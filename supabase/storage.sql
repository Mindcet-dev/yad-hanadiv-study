-- Supabase Storage for files uploaded on the live site. Sign-in stays in Firebase: enable
-- Authentication → Third-party Auth → Firebase with the Firebase project id first, so Supabase accepts
-- Firebase ID tokens. Those tokens carry no `role` claim, so requests run as `anon`; every policy below
-- therefore checks that the token was issued by our Firebase project.
-- Replace FIREBASE_PROJECT_ID and the facilitator emails, then run this in the SQL Editor.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('yad-hanadiv-study', 'yad-hanadiv-study', true, 20971520,
        array['application/pdf', 'image/*', 'video/*', 'text/*'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.yad_hanadiv_facilitators (email text primary key);
alter table public.yad_hanadiv_facilitators enable row level security;
insert into public.yad_hanadiv_facilitators (email) values
  ('facilitator@example.com')
on conflict do nothing;

create or replace function public.yad_hanadiv_is_firebase_user() returns boolean
language sql stable set search_path = '' as $$
  select coalesce(auth.jwt() ->> 'iss', '') = 'https://securetoken.google.com/FIREBASE_PROJECT_ID'
     and coalesce(auth.jwt() ->> 'aud', '') = 'FIREBASE_PROJECT_ID'
$$;

create or replace function public.yad_hanadiv_is_facilitator() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.yad_hanadiv_is_firebase_user()
     and exists (select 1 from public.yad_hanadiv_facilitators f where f.email = lower(auth.jwt() ->> 'email'))
$$;

-- Object names are "<firebase uid>-<random>"; the uploader (or a facilitator) may delete them.
drop policy if exists "yad-hanadiv read" on storage.objects;
create policy "yad-hanadiv read" on storage.objects for select to anon, authenticated
  using (bucket_id = 'yad-hanadiv-study' and public.yad_hanadiv_is_firebase_user());

drop policy if exists "yad-hanadiv upload" on storage.objects;
create policy "yad-hanadiv upload" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'yad-hanadiv-study' and public.yad_hanadiv_is_firebase_user()
              and split_part(name, '-', 1) = auth.jwt() ->> 'sub');

drop policy if exists "yad-hanadiv delete" on storage.objects;
create policy "yad-hanadiv delete" on storage.objects for delete to anon, authenticated
  using (bucket_id = 'yad-hanadiv-study' and public.yad_hanadiv_is_firebase_user()
         and (split_part(name, '-', 1) = auth.jwt() ->> 'sub' or public.yad_hanadiv_is_facilitator()));
