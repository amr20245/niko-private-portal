-- Niko Project Manager v3
-- Run this entire file once in Supabase Dashboard > SQL Editor.

create table if not exists public.niko_app_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.niko_app_state enable row level security;

revoke all on table public.niko_app_state from anon, authenticated;
grant select, insert, update, delete on table public.niko_app_state to authenticated;

drop policy if exists "Owners can read their own Niko data" on public.niko_app_state;
create policy "Owners can read their own Niko data"
on public.niko_app_state for select
to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "Owners can create their own Niko data" on public.niko_app_state;
create policy "Owners can create their own Niko data"
on public.niko_app_state for insert
to authenticated
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "Owners can update their own Niko data" on public.niko_app_state;
create policy "Owners can update their own Niko data"
on public.niko_app_state for update
to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "Owners can delete their own Niko data" on public.niko_app_state;
create policy "Owners can delete their own Niko data"
on public.niko_app_state for delete
to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

-- Private storage for before/after photos, PDF receipts, and material-receipt images.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'niko-job-files',
  'niko-job-files',
  false,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Niko owners can read their own files" on storage.objects;
create policy "Niko owners can read their own files"
on storage.objects for select
to authenticated
using (
  bucket_id = 'niko-job-files'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "Niko owners can upload their own files" on storage.objects;
create policy "Niko owners can upload their own files"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'niko-job-files'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "Niko owners can update their own files" on storage.objects;
create policy "Niko owners can update their own files"
on storage.objects for update
to authenticated
using (
  bucket_id = 'niko-job-files'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
)
with check (
  bucket_id = 'niko-job-files'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "Niko owners can delete their own files" on storage.objects;
create policy "Niko owners can delete their own files"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'niko-job-files'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);
