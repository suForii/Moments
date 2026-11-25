// In-process Postgres with just enough of Supabase (auth, storage, roles) to run the migration.
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';

export async function createDb() {
  const db = new PGlite({ extensions: { vector } });
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth; create schema storage;
    create table auth.users (id uuid primary key default gen_random_uuid(), email text unique,
      raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.uid', true), '')::uuid $$;
    create table storage.buckets (id text primary key, name text, public boolean,
      file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (bucket_id text, name text, primary key (bucket_id, name));
    alter table storage.objects enable row level security;
    grant usage on schema auth, storage, public to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    grant select, insert, delete on storage.objects to anon, authenticated;
    alter default privileges in schema public grant all on tables to anon, authenticated;
    alter default privileges in schema public grant execute on functions to anon, authenticated;
  `);
  await db.exec(
    await readFile(new URL('../supabase/migrations/0001_init.sql', import.meta.url), 'utf8'),
  );
  // Run SQL the way the API would: as anon, or as a logged-in user.
  const as = (uid, sql, params) =>
    db.transaction(async (tx) => {
      await tx.query(`select set_config('request.uid', $1, true)`, [uid || '']);
      await tx.exec(`set local role ${uid ? 'authenticated' : 'anon'}`);
      return (await tx.query(sql, params)).rows;
    });
  const rpc = async (uid, fn, args = {}) => {
    const keys = Object.keys(args);
    if (![fn, ...keys].every((k) => /^[a-z_]+$/.test(k))) throw new Error('Bad name');
    const list = keys.map((k, i) => `${k} => $${i + 1}`).join(', ');
    const rows = await as(uid, `select public.${fn}(${list}) as r`, Object.values(args));
    return rows[0].r;
  };
  const addUser = async (email, name) =>
    (
      await db.query(
        'insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id',
        [email, { name }],
      )
    ).rows[0].id;
  return { db, as, rpc, addUser };
}
