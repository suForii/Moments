// Runs the app with a throwaway local stand-in for Supabase. Data is lost on exit.
// For development only: passwords and tokens are kept in memory.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDb } from './local-db.mjs';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const port = Number(process.env.PORT || 8930);
const { as, rpc, addUser } = await createDb();
// Apply the production security headers here too, so problems show up early.
const headers = Object.fromEntries(
  (await readFile(join(root, '_headers'), 'utf8'))
    .split('\n')
    .filter((l) => l.startsWith('  '))
    .map((l) =>
      l
        .trim()
        .split(/: (.*)/s)
        .slice(0, 2),
    ),
);
const users = new Map(), // email -> { id, email, password, name }
  tokens = new Map(), // access or refresh token -> user
  files = new Map(), // path -> Buffer
  links = new Map(); // signed token -> path
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

function session(user) {
  const access_token = crypto.randomUUID(),
    refresh_token = crypto.randomUUID();
  tokens.set(access_token, user);
  tokens.set(refresh_token, user);
  return {
    access_token,
    refresh_token,
    token_type: 'bearer',
    expires_in: 86400,
    expires_at: Math.floor(Date.now() / 1000) + 86400,
    user: publicUser(user),
  };
}
const publicUser = (u) => ({
  id: u.id,
  email: u.email,
  aud: 'authenticated',
  app_metadata: {},
  user_metadata: { name: u.name },
});
const fail = (status, message) => Object.assign(new Error(message), { status });
const sign = (path) => {
  const token = crypto.randomUUID();
  links.set(token, path);
  return `/object/sign/photos/${path}?token=${token}`;
};
const canRead = async (uid, path) =>
  (await as(uid, 'select 1 from storage.objects where name = $1', [path])).length > 0;

async function handle(req, url, body) {
  const path = decodeURIComponent(url.pathname);
  const json = () => JSON.parse(body.toString() || '{}');
  const user = tokens.get((req.headers.authorization || '').replace('Bearer ', ''));
  const uid = user?.id || null;
  if (path === '/auth/v1/signup') {
    const { email, password, data } = json();
    if (users.has(email)) throw fail(422, 'User already registered');
    const next = { id: await addUser(email, data?.name), email, password, name: data?.name };
    users.set(email, next);
    return session(next);
  }
  if (path === '/auth/v1/token') {
    const b = json();
    const found = b.refresh_token ? tokens.get(b.refresh_token) : users.get(b.email);
    if (!found || (!b.refresh_token && found.password !== b.password))
      throw fail(400, 'Invalid login credentials');
    return session(found);
  }
  if (path === '/auth/v1/recover' || path === '/auth/v1/logout') return {};
  if (path === '/auth/v1/user') {
    if (!user) throw fail(401, 'Not logged in');
    if (req.method === 'PUT' && json().password) user.password = json().password;
    return publicUser(user);
  }
  if (path.startsWith('/rest/v1/rpc/')) return (await rpc(uid, path.slice(13), json())) ?? null;
  if (path.startsWith('/storage/v1/object/')) {
    const rest = path.slice('/storage/v1/object/'.length);
    if (req.method === 'POST' && rest === 'sign/photos')
      return Promise.all(
        json().paths.map(async (p) =>
          (await canRead(uid, p))
            ? { path: p, signedURL: sign(p), error: null }
            : { path: p, signedURL: null, error: 'Not found' },
        ),
      );
    if (req.method === 'POST' && rest.startsWith('sign/photos/')) {
      const p = rest.slice(12);
      if (!(await canRead(uid, p))) throw fail(400, 'Object not found');
      return { signedURL: sign(p) };
    }
    if (req.method === 'GET') {
      const p = rest.replace(/^(sign\/|authenticated\/)?photos\//, '');
      const ok = rest.startsWith('sign/')
        ? links.get(url.searchParams.get('token')) === p
        : await canRead(uid, p);
      if (!ok || !files.has(p)) throw fail(400, 'Object not found');
      return files.get(p);
    }
    if (req.method === 'POST' && rest.startsWith('photos/')) {
      const p = rest.slice(7);
      await as(uid, `insert into storage.objects values ('photos', $1)`, [p]);
      files.set(p, body);
      return { Key: p };
    }
    if (req.method === 'DELETE') {
      const gone = await as(
        uid,
        'delete from storage.objects where name = any($1) returning name',
        [json().prefixes],
      );
      gone.forEach((g) => files.delete(g.name));
      return gone;
    }
  }
  throw fail(404, 'Not found');
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);
    try {
      if (/^\/(auth|rest|storage)\/v1\//.test(url.pathname)) {
        const chunks = [];
        for await (const c of req) chunks.push(c);
        const out = await handle(req, url, Buffer.concat(chunks));
        const raw = Buffer.isBuffer(out);
        res.writeHead(200, { 'Content-Type': raw ? 'image/jpeg' : 'application/json' });
        res.end(raw ? out : JSON.stringify(out));
      } else if (url.pathname === '/config.js') {
        res.writeHead(200, { 'Content-Type': 'text/javascript' });
        res.end(
          `export const SUPABASE_URL = location.origin;\nexport const SUPABASE_ANON_KEY = 'local';`,
        );
      } else {
        const file = normalize(
          join(root, decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)),
        );
        if (!file.startsWith(root)) throw fail(403, 'Forbidden');
        const data = await readFile(file).catch(() => {
          throw fail(404, 'Not found');
        });
        res.writeHead(200, {
          'Content-Type': types[extname(file)] || 'application/octet-stream',
          'Cache-Control': 'no-store',
          ...headers,
        });
        res.end(data);
      }
    } catch (e) {
      res.writeHead(e.status || 400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: e.message, msg: e.message, code: e.code }));
    }
  })
  .listen(port, '127.0.0.1', () => console.log(`Moments is running at http://localhost:${port}`));
