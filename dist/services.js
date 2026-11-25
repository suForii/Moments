/** Backend boundary. Every server call in the app goes through this file. */
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const configured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
const client = configured ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

async function unwrap(promise) {
  if (!client) throw new Error('Moments is not connected to a server yet.');
  const { data, error } = await promise;
  if (error) throw new Error(error.message || 'Something went wrong. Please try again.');
  return data;
}
const rpc = (name, args) => unwrap(client?.rpc(name, args));
const homeUrl = () => new URL('./', location.href).href;
const bucket = () => client.storage.from('photos');

// Signed URLs are cached so re-rendering does not re-download every picture.
const signed = new Map();
async function signPaths(paths) {
  const missing = paths.filter((p) => !(signed.get(p)?.until > Date.now()));
  if (missing.length) {
    const rows = await unwrap(bucket().createSignedUrls(missing, 3600));
    for (const row of rows)
      if (row.signedUrl) signed.set(row.path, { url: row.signedUrl, until: Date.now() + 3000e3 });
  }
  return paths.map((p) => signed.get(p)?.url || '');
}

function putFile(path, blob, token, onProgress) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', `${SUPABASE_URL}/storage/v1/object/photos/${path}`);
    request.setRequestHeader('Authorization', `Bearer ${token}`);
    request.setRequestHeader('apikey', SUPABASE_ANON_KEY);
    request.setRequestHeader('Content-Type', 'image/jpeg');
    request.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    request.onload = () =>
      request.status < 300 ? resolve() : reject(new Error('Upload was refused. Please try again.'));
    request.onerror = () => reject(new Error('Connection lost during upload.'));
    request.send(blob);
  });
}

/** Deletes my stored files, in one album or everywhere. */
async function removeFiles(eventId) {
  const files = await rpc('my_files', { p_event: eventId });
  for (let i = 0; i < files.length; i += 100)
    await unwrap(bucket().remove(files.slice(i, i + 100)));
}

export const api = {
  auth: {
    onChange: (callback) => client?.auth.onAuthStateChange(callback),
    session: async () => (client ? (await unwrap(client.auth.getSession())).session : null),
    login: ({ email, password }) => unwrap(client?.auth.signInWithPassword({ email, password })),
    signup: ({ name, email, password, redirect }) =>
      unwrap(
        client?.auth.signUp({
          email,
          password,
          options: { data: { name }, emailRedirectTo: redirect || homeUrl() },
        }),
      ),
    logout: async () => {
      signed.clear();
      await unwrap(client?.auth.signOut({ scope: 'local' }));
    },
    reset: (email) => unwrap(client?.auth.resetPasswordForEmail(email, { redirectTo: homeUrl() })),
    setPassword: (password) => unwrap(client?.auth.updateUser({ password })),
  },
  me: () => rpc('get_me'),
  async deleteAccount() {
    await removeFiles(null);
    await rpc('delete_account');
    signed.clear();
    // The account is gone, so only the local session is left to clear.
    await client.auth.signOut({ scope: 'local' }).catch(() => {});
  },
  setName: (name) => rpc('set_name', { p_name: name }),
  setPrivacy: ({ useFace, matchUploads, version }) =>
    rpc('set_privacy', {
      p_use_face: useFace,
      p_match_uploads: matchUploads,
      p_version: version,
    }),
  events: {
    list: () => rpc('my_events'),
    create: ({ name, date, location }) =>
      rpc('create_event', { p_name: name, p_date: date, p_location: location }),
    preview: (code) => rpc('preview_event', { p_code: code }),
    join: (code) => rpc('join_event', { p_code: code }),
    members: (id) => rpc('album_members', { p_event: id }),
    resetCode: (id) => rpc('reset_code', { p_event: id }),
    removeMember: (id, userId) => rpc('remove_member', { p_event: id, p_user: userId }),
    async leave(id) {
      await removeFiles(id);
      await rpc('leave_event', { p_event: id });
    },
  },
  photos: {
    async list(eventId) {
      const photos = await rpc('album_photos', { p_event: eventId });
      const urls = photos.length ? await signPaths(photos.map((p) => `${p.path}_t.jpg`)) : [];
      return photos.map((p, i) => ({ ...p, thumb: urls[i] }));
    },
    fullUrl: async (photo) => (await signPaths([`${photo.path}.jpg`]))[0],
    blob: (photo) => unwrap(bucket().download(`${photo.path}.jpg`)),
    shareUrl: async (photo) =>
      (await unwrap(bucket().createSignedUrl(`${photo.path}.jpg`, 7 * 24 * 3600))).signedUrl,
    async upload({ id, eventId, name, date, location, full, thumb }, onProgress) {
      const session = await api.auth.session();
      if (!session) throw new Error('Please log in again.');
      const path = `${eventId}/${session.user.id}/${id}`;
      const files = [`${path}.jpg`, `${path}_t.jpg`];
      try {
        await putFile(files[0], full, session.access_token, (n) => onProgress(n * 90));
        await putFile(files[1], thumb, session.access_token, (n) => onProgress(90 + n * 10));
        await rpc('add_photo', {
          p_id: id,
          p_event: eventId,
          p_name: name,
          p_taken_on: date,
          p_location: location,
        });
      } catch (error) {
        // Do not leave orphaned files behind, and let a retry reuse the same id.
        await bucket()
          .remove(files)
          .catch(() => {});
        throw error;
      }
    },
    async remove(photo) {
      await unwrap(bucket().remove([`${photo.path}.jpg`, `${photo.path}_t.jpg`]));
      await rpc('delete_photo', { p_id: photo.id });
    },
  },
  enrollment: {
    create: () => rpc('create_enrollment'),
    status: (token) => rpc('enrollment_status', { p_token: token }),
    submit: (token, faces) => rpc('submit_enrollment', { p_token: token, p_faces: faces }),
  },
  matching: {
    pending: (eventId) => rpc('photos_to_scan', { p_event: eventId }),
    submit: (photoId, faces) => rpc('match_faces', { p_photo: photoId, p_faces: faces }),
  },
};
