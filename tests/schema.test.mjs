import test from 'node:test';
import assert from 'node:assert/strict';
import { createDb } from '../tools/local-db.mjs';

const { db, as, rpc, addUser } = await createDb();
const face = (axis, off = 0) => Array.from({ length: 1024 }, (_, i) => (i === axis ? 20 + off : 0));
const selfies = (axis) => [face(axis), face(axis, 1), face(axis, -1)];
const privacy = (u, f, m) =>
  rpc(u, 'set_privacy', { p_use_face: f, p_match_uploads: m, p_version: 'v1' });
const enroll = async (u, axis) =>
  rpc(null, 'submit_enrollment', {
    p_token: await rpc(u, 'create_enrollment'),
    p_faces: selfies(axis),
  });
const addPhoto = async (u, ev) => {
  const id = crypto.randomUUID();
  await rpc(u, 'add_photo', {
    p_id: id,
    p_event: ev,
    p_name: 'a.jpg',
    p_taken_on: '2026-11-25',
    p_location: 'Here',
  });
  return id;
};
const album = (u, ev) => rpc(u, 'album_photos', { p_event: ev });
const match = (u, id, faces) => rpc(u, 'match_faces', { p_photo: id, p_faces: faces });

const ann = await addUser('ann@test', 'Ann');
const bob = await addUser('bob@test', 'Bob');
const eve = await addUser('eve@test', 'Eve');
const ev = await rpc(ann, 'create_event', {
  p_name: 'Party',
  p_date: '2026-11-25',
  p_location: 'NYC',
});
const code = (await rpc(ann, 'my_events'))[0].code;
await rpc(bob, 'join_event', { p_code: code.toLowerCase() });

test('tables and private helpers are closed to clients', async () => {
  const { rows } = await db.query(`select tablename t from pg_tables where schemaname = 'public'`);
  assert.ok(rows.length >= 8);
  for (const { t } of rows)
    for (const u of [null, ann])
      await assert.rejects(as(u, `select * from public.${t}`), /permission denied/);
  await assert.rejects(as(ann, `select * from private.settings`), /permission denied/);
  await assert.rejects(as(ann, `select private.mark_rescan($1)`, [bob]), /permission denied/);
});

test('anon can only reach the two phone functions', async () => {
  for (const fn of ['get_me', 'my_events', 'create_enrollment'])
    await assert.rejects(rpc(null, fn), /permission denied/);
  assert.equal(await rpc(null, 'enrollment_status', { p_token: 'nope' }), 'expired');
});

test('non-members are refused', async () => {
  await assert.rejects(album(eve, ev), /not a member/);
  await assert.rejects(addPhoto(eve, ev), /not a member/);
  assert.deepEqual(await rpc(eve, 'my_events'), []);
  await assert.rejects(rpc(eve, 'join_event', { p_code: 'WRONG' }), /No album/);
});

test('selfies need consent, and links are single use and expire', async () => {
  await assert.rejects(rpc(bob, 'create_enrollment'), /Turn on/);
  await privacy(bob, true, false);
  const token = await rpc(bob, 'create_enrollment');
  const send = (faces) => rpc(null, 'submit_enrollment', { p_token: token, p_faces: faces });
  await assert.rejects(send(selfies(1).slice(1)), /three/);
  await assert.rejects(send([[1], [1], [1]]), /Invalid face/);
  assert.equal(await rpc(null, 'enrollment_status', { p_token: token }), 'waiting');
  await send(selfies(1));
  assert.equal(await rpc(null, 'enrollment_status', { p_token: token }), 'completed');
  await assert.rejects(send(selfies(2)), /expired/);
  const late = await rpc(bob, 'create_enrollment');
  await db.query(`update public.enrollments set expires_at = now() - interval '1 second'`);
  await assert.rejects(
    rpc(null, 'submit_enrollment', { p_token: late, p_faces: selfies(2) }),
    /expired/,
  );
});

test('matching delivers privately, and only with the uploader consent', async () => {
  const id = await addPhoto(ann, ev);
  await assert.rejects(match(ann, id, [face(1)]), /not allowed/);
  assert.deepEqual(await rpc(ann, 'photos_to_scan', { p_event: ev }), []);
  await privacy(ann, false, true);
  assert.equal((await rpc(ann, 'photos_to_scan', { p_event: ev })).length, 1);
  await assert.rejects(match(bob, id, [face(1)]), /not allowed/);
  assert.deepEqual(await album(bob, ev), []);

  await match(ann, id, [face(1, 0.5), face(500)]);
  const [mine] = await album(ann, ev);
  assert.equal(mine.status, 'delivered');
  assert.equal(mine.unsolved, true);
  assert.deepEqual(
    mine.people.map((p) => p.name),
    ['Bob'],
  );
  const [got] = await album(bob, ev);
  assert.equal(got.deliveredToMe, true);
  assert.equal(got.mine, false);
  assert.deepEqual(got.people, []);
  assert.deepEqual(await rpc(ann, 'photos_to_scan', { p_event: ev }), []);

  await rpc(eve, 'join_event', { p_code: code });
  assert.deepEqual(await album(eve, ev), [], 'a member with no delivery sees nothing');
  await assert.rejects(rpc(bob, 'delete_photo', { p_id: id }), /only delete your own/);

  const file = `${ev}/${ann}/${id}.jpg`;
  await as(ann, `insert into storage.objects values ('photos', $1)`, [file]);
  const read = (u) => as(u, `select * from storage.objects where name = $1`, [file]);
  assert.equal((await read(ann)).length, 1);
  assert.equal((await read(bob)).length, 1);
  assert.equal((await read(eve)).length, 0);
  assert.equal((await as(bob, `delete from storage.objects returning 1`)).length, 0);
  for (const bad of [`${ev}/${ann}/${crypto.randomUUID()}.jpg`, `${ev}/${bob}/x.jpg`])
    await assert.rejects(
      as(bob, `insert into storage.objects values ('photos', $1)`, [bad]),
      /row-level security/,
    );
});

test('new selfies trigger a rescan; withdrawing consent deletes signatures', async () => {
  await privacy(eve, true, false);
  await enroll(eve, 500);
  const [todo] = await rpc(ann, 'photos_to_scan', { p_event: ev });
  await match(ann, todo.id, [face(1), face(500)]);
  assert.equal((await album(eve, ev)).length, 1);

  await privacy(eve, false, false);
  const { rows } = await db.query('select 1 from public.face_signatures where user_id = $1', [eve]);
  assert.equal(rows.length, 0);
  const id = await addPhoto(ann, ev);
  await match(ann, id, [face(500)]);
  assert.equal((await album(eve, ev)).length, 1, 'no new deliveries after withdrawal');
  const log = await db.query('select use_face from public.consent_log where user_id = $1', [eve]);
  assert.deepEqual(
    log.rows.map((r) => r.use_face),
    [true, false],
  );
});

test('people outside the album are never matched', async () => {
  const out = await addUser('out@test', 'Out');
  await privacy(out, true, false);
  await enroll(out, 700);
  const id = await addPhoto(ann, ev);
  await match(ann, id, [face(700)]);
  assert.equal((await album(ann, ev)).find((p) => p.id === id).status, 'no_match');
});
