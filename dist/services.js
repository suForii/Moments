/** Backend boundary. Replace mock methods with the documented HTTP endpoints.
 * Never persist passwords or generate biometric signatures in the browser. */
const KEY = 'moments.desktop.v1';
export function readState() {
  try {
    return JSON.parse(localStorage.getItem(KEY));
  } catch {
    return null;
  }
}
export function writeState(state) {
  localStorage.setItem(KEY, JSON.stringify(state));
}
const mock = async (result) => {
  await new Promise((resolve) => setTimeout(resolve, 150));
  return result;
};
export const api = {
  auth: {
    login: ({ email }) => mock({ id: 'demo-user', email, name: email.split('@')[0] }),
    signup: ({ name, email }) => mock({ id: 'demo-user', email, name }),
  },
  privacy: { update: (choices) => mock({ ...choices, updatedAt: new Date().toISOString() }) },
  events: {
    create: (data) =>
      mock({
        ...data,
        id: crypto.randomUUID(),
        code: crypto.randomUUID().slice(0, 8).toUpperCase(),
      }),
    join: ({ eventId }) => mock({ eventId, joined: true }),
    list: () => mock(readState()?.events || []),
  },
  photos: {
    remove: (id) => mock({ id, deleted: true }),
    createUpload: (metadata) => mock({ mode: 'local', metadata }),
    list: (eventId) => mock((readState()?.photos || []).filter((p) => p.eventId === eventId)),
  },
  matching: { request: () => Promise.reject(new Error('Face matching is unavailable in v1.')) },
};
