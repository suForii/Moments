-- Moments MVP schema.
-- Tables have RLS enabled and no policies, so clients cannot touch them directly.
-- Everything goes through the SECURITY DEFINER functions in "public" below.

create schema if not exists extensions;
create extension if not exists vector with schema extensions;
create schema if not exists private;
revoke all on schema private from public;

-- ---------- Tables ----------
create table public.profiles (
  user_id uuid primary key references auth.users on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  use_face boolean not null default false,
  match_uploads boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.consent_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  use_face boolean not null,
  match_uploads boolean not null,
  consent_version text not null,
  created_at timestamptz not null default now()
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  date date not null,
  location text not null check (char_length(location) between 1 and 120),
  code text not null unique,
  -- Photos scanned before this moment are scanned again by their uploader.
  rescan_after timestamptz not null default '-infinity',
  created_at timestamptz not null default now()
);

create table public.event_members (
  event_id uuid references public.events on delete cascade,
  user_id uuid references auth.users on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
create index on public.event_members (user_id);

-- Files live at <event>/<owner>/<photo>.jpg and <event>/<owner>/<photo>_t.jpg.
create table public.photos (
  id uuid primary key,
  event_id uuid not null references public.events on delete cascade,
  owner_id uuid not null references auth.users on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  taken_on date not null,
  location text not null check (char_length(location) between 1 and 120),
  status text not null default 'processing' check (status in ('processing', 'delivered', 'no_match')),
  unsolved_faces int not null default 0,
  scanned_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.photos (event_id, owner_id);

create table public.deliveries (
  photo_id uuid references public.photos on delete cascade,
  user_id uuid references auth.users on delete cascade,
  delivered_at timestamptz not null default now(),
  primary key (photo_id, user_id)
);
create index on public.deliveries (user_id);

-- Biometric data. No function ever returns these vectors.
create table public.face_signatures (
  user_id uuid references auth.users on delete cascade,
  angle int check (angle between 1 and 3),
  embedding extensions.vector(1024) not null,
  created_at timestamptz not null default now(),
  primary key (user_id, angle)
);

create table public.enrollments (
  token_hash bytea primary key,
  user_id uuid not null references auth.users on delete cascade,
  expires_at timestamptz not null default now() + interval '15 minutes',
  completed_at timestamptz
);
create index on public.enrollments (user_id);

-- Maximum L2 distance that counts as the same person. Tune with real test photos.
create table private.settings (key text primary key, value double precision not null);
insert into private.settings values
  ('match_distance', 8),
  -- How far a turned selfie may be from the front one before it looks like someone else.
  ('selfie_distance', 13);

alter table public.profiles enable row level security;
alter table public.consent_log enable row level security;
alter table public.events enable row level security;
alter table public.event_members enable row level security;
alter table public.photos enable row level security;
alter table public.deliveries enable row level security;
alter table public.face_signatures enable row level security;
alter table public.enrollments enable row level security;
revoke all on all tables in schema public from anon, authenticated;

-- ---------- Private helpers ----------
create function private.uid() returns uuid language plpgsql stable set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'Please log in again.' using errcode = '28000';
  end if;
  return auth.uid();
end $$;

create function private.require_member(p_event uuid) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := private.uid();
begin
  if not exists (select 1 from public.event_members where event_id = p_event and user_id = me) then
    raise exception 'You are not a member of this album.' using errcode = '42501';
  end if;
  return me;
end $$;

create function private.mark_rescan(p_user uuid) returns void
language sql security definer set search_path = '' as $$
  update public.events e set rescan_after = clock_timestamp()
  from public.event_members m where m.event_id = e.id and m.user_id = p_user;
$$;

create function private.token_hash(p_token text) returns bytea
language sql immutable set search_path = '' as $$ select sha256(convert_to(p_token, 'UTF8')) $$;

-- Parses [[...1024 numbers...], ...]; vector() rejects wrong sizes, NaN and infinity.
create function private.parse_faces(p_faces jsonb, p_max int) returns setof extensions.vector
language plpgsql immutable set search_path = '' as $$
declare f jsonb; v extensions.vector;
begin
  if jsonb_typeof(p_faces) is distinct from 'array' or jsonb_array_length(p_faces) > p_max then
    raise exception 'Invalid face data.' using errcode = '22023';
  end if;
  for f in select * from jsonb_array_elements(p_faces) loop
    if jsonb_typeof(f) <> 'array' or jsonb_array_length(f) <> 1024 then
      raise exception 'Invalid face data.' using errcode = '22023';
    end if;
    v := f::text::extensions.vector;
    return next v;
  end loop;
end $$;

create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (user_id, name) values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), 'Moments member'), 80)
  );
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------- Account and consent ----------
create function public.get_me() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := private.uid();
begin
  return (select jsonb_build_object(
    'id', p.user_id, 'name', p.name, 'useFace', p.use_face, 'matchUploads', p.match_uploads,
    'onboarded', exists (select 1 from public.consent_log c where c.user_id = me),
    'hasSelfies', exists (select 1 from public.face_signatures s where s.user_id = me))
  from public.profiles p where p.user_id = me);
end $$;

create function public.set_name(p_name text) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := private.uid();
begin
  update public.profiles set name = trim(p_name) where user_id = me;
end $$;

create function public.set_privacy(p_use_face boolean, p_match_uploads boolean, p_version text)
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := private.uid(); had_match boolean;
begin
  if p_use_face is null or p_match_uploads is null or coalesce(trim(p_version), '') = '' then
    raise exception 'Invalid privacy choice.' using errcode = '22023';
  end if;
  select match_uploads into had_match from public.profiles where user_id = me for update;
  update public.profiles set use_face = p_use_face, match_uploads = p_match_uploads
    where user_id = me;
  insert into public.consent_log (user_id, use_face, match_uploads, consent_version)
    values (me, p_use_face, p_match_uploads, p_version);
  if not p_use_face then
    delete from public.face_signatures where user_id = me;
    delete from public.enrollments where user_id = me;
  end if;
  if p_match_uploads and not had_match then
    update public.photos set scanned_at = null where owner_id = me;
  end if;
end $$;

-- ---------- Albums ----------
create function public.create_event(p_name text, p_date date, p_location text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare me uuid := private.uid(); new_id uuid;
begin
  insert into public.events (owner_id, name, date, location, code) values (
    me, trim(p_name), p_date, trim(p_location),
    private.new_code())
  returning id into new_id;
  insert into public.event_members (event_id, user_id) values (new_id, me);
  return new_id;
end $$;

-- Exact code only, so strangers cannot discover albums by name.
create function public.preview_event(p_code text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := private.uid();
begin
  return (select jsonb_build_object('id', e.id, 'name', e.name, 'code', e.code, 'joined',
    exists (select 1 from public.event_members m where m.event_id = e.id and m.user_id = me))
  from public.events e where e.code = upper(trim(p_code)));
end $$;

create function public.join_event(p_code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare me uuid := private.uid(); e_id uuid;
begin
  select id into e_id from public.events where code = upper(trim(p_code));
  if e_id is null then
    raise exception 'No album found for that code.' using errcode = '22023';
  end if;
  insert into public.event_members (event_id, user_id) values (e_id, me) on conflict do nothing;
  if found and exists (select 1 from public.face_signatures where user_id = me) then
    update public.events set rescan_after = clock_timestamp() where id = e_id;
  end if;
  return e_id;
end $$;

create function public.my_events() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := private.uid();
begin
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id', e.id, 'name', e.name, 'date', e.date, 'location', e.location, 'code', e.code,
    'owner', e.owner_id = me,
    'members', (select count(*) from public.event_members x where x.event_id = e.id),
    'photos', (select count(*) from public.photos p where p.event_id = e.id and (p.owner_id = me
      or exists (select 1 from public.deliveries d where d.photo_id = p.id and d.user_id = me)))
  ) order by e.date desc, e.created_at desc)
  from public.events e join public.event_members m on m.event_id = e.id and m.user_id = me),
  '[]');
end $$;

create function private.require_owner(p_event uuid) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := private.uid();
begin
  if not exists (select 1 from public.events where id = p_event and owner_id = me) then
    raise exception 'Only the album owner can do that.' using errcode = '42501';
  end if;
  return me;
end $$;

create function private.new_code() returns text language sql volatile set search_path = '' as $$
  select upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
$$;

-- Removes someone from an album. A departing owner hands it to the longest-standing member;
-- an album nobody is left in is deleted.
create function private.drop_member(p_event uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare heir uuid;
begin
  perform 1 from public.events where id = p_event for update;
  delete from public.deliveries d using public.photos p
    where p.id = d.photo_id and p.event_id = p_event and d.user_id = p_user;
  delete from public.event_members where event_id = p_event and user_id = p_user;
  if exists (select 1 from public.events where id = p_event and owner_id = p_user) then
    select user_id into heir from public.event_members
      where event_id = p_event order by joined_at, user_id limit 1;
    if heir is null then
      delete from public.events where id = p_event;
    else
      update public.events set owner_id = heir where id = p_event;
    end if;
  end if;
end $$;

create function public.album_members(p_event uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := private.require_owner(p_event);
begin
  return (select jsonb_agg(jsonb_build_object('id', m.user_id, 'name', p.name,
    'me', m.user_id = me) order by m.joined_at)
  from public.event_members m join public.profiles p on p.user_id = m.user_id
  where m.event_id = p_event);
end $$;

create function public.reset_code(p_event uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare fresh text := private.new_code();
begin
  perform private.require_owner(p_event);
  update public.events set code = fresh where id = p_event;
  return fresh;
end $$;

-- Also changes the code, so the old invite cannot be used to come back.
-- Their uploads stay theirs and stay delivered.
create function public.remove_member(p_event uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := private.require_owner(p_event);
begin
  if p_user = me then
    raise exception 'Leave the album instead.' using errcode = '22023';
  end if;
  perform private.drop_member(p_event, p_user);
  update public.events set code = private.new_code() where id = p_event;
end $$;

create function public.leave_event(p_event uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := private.require_member(p_event);
begin
  delete from public.photos where event_id = p_event and owner_id = me;
  perform private.drop_member(p_event, me);
end $$;

-- My stored files, so the client can delete them before leaving or closing the account.
create function public.my_files(p_event uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := private.uid();
begin
  return coalesce((select jsonb_agg(o.name) from storage.objects o
    where o.bucket_id = 'photos' and split_part(o.name, '/', 2) = me::text
      and (p_event is null or split_part(o.name, '/', 1) = p_event::text)), '[]');
end $$;

create function public.delete_account() returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := private.uid(); ev uuid;
begin
  delete from public.photos where owner_id = me;
  for ev in select event_id from public.event_members where user_id = me loop
    perform private.drop_member(ev, me);
  end loop;
  delete from auth.users where id = me;
end $$;

-- ---------- Photos ----------
create function public.add_photo(
  p_id uuid, p_event uuid, p_name text, p_taken_on date, p_location text
) returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := private.require_member(p_event);
begin
  insert into public.photos (id, event_id, owner_id, name, taken_on, location)
  values (p_id, p_event, me, left(p_name, 200), p_taken_on, left(p_location, 120));
end $$;

-- Only your uploads and photos delivered to you. People are listed to the uploader only.
create function public.album_photos(p_event uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := private.require_member(p_event);
begin
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id', p.id, 'eventId', p.event_id, 'name', p.name, 'date', p.taken_on,
    'location', p.location, 'status', p.status, 'mine', p.owner_id = me,
    'deliveredToMe', d.user_id is not null,
    'path', p.event_id || '/' || p.owner_id || '/' || p.id,
    'unsolved', p.owner_id = me and p.unsolved_faces > 0,
    'people', case when p.owner_id = me then coalesce((
      select jsonb_agg(jsonb_build_object('id', x.user_id, 'name', pr.name) order by pr.name)
      from public.deliveries x join public.profiles pr on pr.user_id = x.user_id
      where x.photo_id = p.id), '[]') else '[]' end
  ) order by p.created_at desc)
  from public.photos p
  left join public.deliveries d on d.photo_id = p.id and d.user_id = me
  where p.event_id = p_event and (p.owner_id = me or d.user_id is not null)), '[]');
end $$;

create function public.delete_photo(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := private.uid();
begin
  delete from public.photos where id = p_id and owner_id = me;
  if not found then
    raise exception 'You can only delete your own photos.' using errcode = '42501';
  end if;
end $$;

-- ---------- Phone selfie setup ----------
create function public.create_enrollment() returns text
language plpgsql security definer set search_path = '' as $$
declare me uuid := private.uid(); token text;
begin
  if not (select use_face from public.profiles where user_id = me) then
    raise exception 'Turn on "Use my face for matching" first.' using errcode = '42501';
  end if;
  token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  delete from public.enrollments where user_id = me;
  insert into public.enrollments (token_hash, user_id) values (private.token_hash(token), me);
  return token;
end $$;

-- Callable from the phone without logging in; the token is the credential.
create function public.enrollment_status(p_token text) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select case when completed_at is not null then 'completed'
    when expires_at < now() then 'expired' else 'waiting' end
  from public.enrollments where token_hash = private.token_hash(p_token)), 'expired');
$$;

create function public.submit_enrollment(p_token text, p_faces jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare target uuid;
begin
  update public.enrollments n set completed_at = now()
  from public.profiles p
  where n.token_hash = private.token_hash(p_token) and n.completed_at is null
    and n.expires_at > now() and p.user_id = n.user_id and p.use_face
  returning n.user_id into target;
  if target is null then
    raise exception 'This link has expired. Start again on your computer.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_faces) is distinct from 'array' or jsonb_array_length(p_faces) <> 3 then
    raise exception 'Exactly three selfies are needed.' using errcode = '22023';
  end if;
  delete from public.face_signatures where user_id = target;
  insert into public.face_signatures (user_id, angle, embedding)
    select target, n, v from private.parse_faces(p_faces, 3) with ordinality as f (v, n);
  if exists (
    select 1 from public.face_signatures a
    join public.face_signatures b on b.user_id = a.user_id and b.angle > 1
    where a.user_id = target and a.angle = 1 and a.embedding operator(extensions.<->) b.embedding
      > (select value from private.settings where key = 'selfie_distance')
  ) then
    raise exception 'The selfies do not look like the same person. Please take them again.'
      using errcode = '22023';
  end if;
  perform private.mark_rescan(target);
end $$;

-- ---------- Matching ----------
create function public.photos_to_scan(p_event uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := private.require_member(p_event);
begin
  return coalesce((select jsonb_agg(jsonb_build_object('id', p.id,
    'path', p.event_id || '/' || p.owner_id || '/' || p.id))
  from public.photos p
  join public.events e on e.id = p.event_id
  join public.profiles pr on pr.user_id = me
  where p.event_id = p_event and p.owner_id = me and pr.match_uploads
    and (p.scanned_at is null or p.scanned_at < e.rescan_after)), '[]');
end $$;

-- Faces found in a photo are compared and then discarded; only matches are stored.
create function public.match_faces(p_photo uuid, p_faces jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := private.uid();
  ev uuid; f extensions.vector; hit uuid; missed int := 0;
  -- Taken before comparing, so a change during matching triggers another scan.
  started timestamptz := clock_timestamp();
  max_distance double precision;
begin
  select p.event_id into ev from public.photos p
    join public.profiles pr on pr.user_id = p.owner_id
    where p.id = p_photo and p.owner_id = me and pr.match_uploads for update of p;
  if ev is null then
    raise exception 'Matching is not allowed for this photo.' using errcode = '42501';
  end if;
  perform private.require_member(ev);
  select value into max_distance from private.settings where key = 'match_distance';
  for f in select * from private.parse_faces(p_faces, 60) loop
    hit := null;
    select s.user_id into hit from public.face_signatures s
      join public.event_members m on m.user_id = s.user_id and m.event_id = ev
      join public.profiles pr on pr.user_id = s.user_id and pr.use_face
      where s.embedding operator(extensions.<->) f < max_distance
      order by s.embedding operator(extensions.<->) f limit 1;
    if hit is null then
      missed := missed + 1;
    else
      insert into public.deliveries (photo_id, user_id) values (p_photo, hit)
        on conflict do nothing;
    end if;
  end loop;
  update public.photos set unsolved_faces = missed, scanned_at = started,
    status = case when exists (select 1 from public.deliveries where photo_id = p_photo)
      then 'delivered' else 'no_match' end
  where id = p_photo;
end $$;

-- ---------- Photo files ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 5242880, array['image/jpeg']);

create function private.can_read_file(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select split_part(p_name, '/', 2) = auth.uid()::text or exists (
    select 1 from public.deliveries d join public.photos p on p.id = d.photo_id
    where d.user_id = auth.uid() and p_name in (
      p.event_id || '/' || p.owner_id || '/' || p.id || '.jpg',
      p.event_id || '/' || p.owner_id || '/' || p.id || '_t.jpg'));
$$;

create function private.can_write_file(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select split_part(p_name, '/', 2) = auth.uid()::text
    and p_name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}(_t)?\.jpg$'
    and exists (select 1 from public.event_members m
      where m.user_id = auth.uid() and m.event_id::text = split_part(p_name, '/', 1));
$$;

create policy "read own or delivered photos" on storage.objects for select to authenticated
  using (bucket_id = 'photos' and private.can_read_file(name));
create policy "upload to own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and private.can_write_file(name));
create policy "delete own files" on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and split_part(name, '/', 2) = auth.uid()::text);

-- ---------- Grants ----------
revoke execute on all functions in schema private from public;
grant usage on schema private to authenticated;
grant execute on function private.can_read_file(text), private.can_write_file(text) to authenticated;
revoke execute on all functions in schema public from public, anon;
do $$
declare f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname in (
      'get_me', 'set_name', 'set_privacy', 'create_event', 'preview_event', 'join_event',
      'my_events', 'add_photo', 'album_photos', 'delete_photo', 'create_enrollment',
      'photos_to_scan', 'match_faces',
      'album_members', 'reset_code', 'remove_member', 'leave_event', 'my_files', 'delete_account', 'enrollment_status', 'submit_enrollment')
  loop execute format('grant execute on function %s to authenticated', f); end loop;
end $$;
grant execute on function public.enrollment_status(text) to anon;
grant execute on function public.submit_enrollment(text, jsonb) to anon;
