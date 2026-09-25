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

-- Public website quote requests. Anonymous visitors may create a request, but
-- they cannot read, update, or delete any request. Signed-in portal users can.
create table if not exists public.niko_quote_requests (
  id uuid primary key,
  customer_name text not null check (char_length(customer_name) between 2 and 100),
  phone text not null check (char_length(phone) between 7 and 30),
  email text not null check (char_length(email) between 5 and 160),
  project_address text not null check (char_length(project_address) between 4 and 240),
  service_types jsonb not null default '[]'::jsonb check (jsonb_typeof(service_types) = 'array' and jsonb_array_length(service_types) between 1 and 10),
  project_description text not null check (char_length(project_description) between 20 and 5000),
  preferred_visit_date date,
  preferred_time_window text check (preferred_time_window is null or char_length(preferred_time_window) <= 80),
  budget_range text check (budget_range is null or char_length(budget_range) <= 80),
  documentation_photo_consent boolean not null default false check (documentation_photo_consent = true),
  public_photo_release boolean not null default false,
  file_paths jsonb not null default '[]'::jsonb check (jsonb_typeof(file_paths) = 'array' and jsonb_array_length(file_paths) <= 6),
  status text not null default 'New' check (status in ('New','Contacted','Visit scheduled','Quoted','Converted to job','Closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.niko_quote_requests enable row level security;
revoke all on table public.niko_quote_requests from anon, authenticated;
grant insert on table public.niko_quote_requests to anon;
grant select, insert, update, delete on table public.niko_quote_requests to authenticated;

drop policy if exists "Public can submit valid Niko quote requests" on public.niko_quote_requests;
create policy "Public can submit valid Niko quote requests"
on public.niko_quote_requests for insert
to anon
with check (
  documentation_photo_consent = true
  and status = 'New'
  and created_at >= now() - interval '5 minutes'
  and created_at <= now() + interval '5 minutes'
  and not exists (
    select 1 from jsonb_array_elements_text(file_paths) as path
    where split_part(path, '/', 1) <> id::text
  )
);

drop policy if exists "Signed in Niko users can read quote requests" on public.niko_quote_requests;
create policy "Signed in Niko users can read quote requests"
on public.niko_quote_requests for select
to authenticated
using ((select auth.uid()) is not null);

drop policy if exists "Signed in Niko users can update quote requests" on public.niko_quote_requests;
create policy "Signed in Niko users can update quote requests"
on public.niko_quote_requests for update
to authenticated
using ((select auth.uid()) is not null)
with check ((select auth.uid()) is not null);

drop policy if exists "Signed in Niko users can delete quote requests" on public.niko_quote_requests;
create policy "Signed in Niko users can delete quote requests"
on public.niko_quote_requests for delete
to authenticated
using ((select auth.uid()) is not null);

create or replace function public.niko_quote_upload_allowed(object_name text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.niko_quote_requests request
    where request.id::text = split_part(object_name, '/', 1)
      and request.created_at >= now() - interval '2 hours'
  );
$$;

revoke all on function public.niko_quote_upload_allowed(text) from public;
grant execute on function public.niko_quote_upload_allowed(text) to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'niko-quote-request-files',
  'niko-quote-request-files',
  false,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can upload recent Niko request photos" on storage.objects;
create policy "Public can upload recent Niko request photos"
on storage.objects for insert
to anon
with check (
  bucket_id = 'niko-quote-request-files'
  and public.niko_quote_upload_allowed(name)
);

drop policy if exists "Signed in Niko users can read request photos" on storage.objects;
create policy "Signed in Niko users can read request photos"
on storage.objects for select
to authenticated
using (bucket_id = 'niko-quote-request-files' and (select auth.uid()) is not null);

drop policy if exists "Signed in Niko users can delete request photos" on storage.objects;
create policy "Signed in Niko users can delete request photos"
on storage.objects for delete
to authenticated
using (bucket_id = 'niko-quote-request-files' and (select auth.uid()) is not null);

-- Customer-approved public portfolio records. Public readers only see rows
-- whose is_published flag is true. Owners manage only their own records.
create table if not exists public.niko_public_projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  source_job_id uuid not null,
  title text not null check (char_length(title) between 2 and 120),
  summary text not null check (char_length(summary) between 10 and 1000),
  service_category text check (service_category is null or char_length(service_category) <= 80),
  area_label text check (area_label is null or char_length(area_label) <= 80),
  before_paths jsonb not null default '[]'::jsonb check (jsonb_typeof(before_paths) = 'array' and jsonb_array_length(before_paths) <= 12),
  after_paths jsonb not null default '[]'::jsonb check (jsonb_typeof(after_paths) = 'array' and jsonb_array_length(after_paths) <= 12),
  completed_on date,
  published_at timestamptz not null default now(),
  is_published boolean not null default true,
  unique (owner_id, source_job_id)
);

alter table public.niko_public_projects enable row level security;
revoke all on table public.niko_public_projects from anon, authenticated;
grant select on table public.niko_public_projects to anon;
grant select, insert, update, delete on table public.niko_public_projects to authenticated;

drop policy if exists "Public can read published Niko projects" on public.niko_public_projects;
create policy "Public can read published Niko projects"
on public.niko_public_projects for select
to anon, authenticated
using (is_published = true);

drop policy if exists "Owners can read all their Niko public projects" on public.niko_public_projects;
create policy "Owners can read all their Niko public projects"
on public.niko_public_projects for select
to authenticated
using ((select auth.uid()) = owner_id);

drop policy if exists "Owners can create Niko public projects" on public.niko_public_projects;
create policy "Owners can create Niko public projects"
on public.niko_public_projects for insert
to authenticated
with check ((select auth.uid()) = owner_id);

drop policy if exists "Owners can update Niko public projects" on public.niko_public_projects;
create policy "Owners can update Niko public projects"
on public.niko_public_projects for update
to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

drop policy if exists "Owners can delete Niko public projects" on public.niko_public_projects;
create policy "Owners can delete Niko public projects"
on public.niko_public_projects for delete
to authenticated
using ((select auth.uid()) = owner_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'niko-public-portfolio',
  'niko-public-portfolio',
  true,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can view Niko portfolio photos" on storage.objects;
create policy "Public can view Niko portfolio photos"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'niko-public-portfolio');

drop policy if exists "Owners can upload Niko portfolio photos" on storage.objects;
create policy "Owners can upload Niko portfolio photos"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'niko-public-portfolio'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "Owners can update Niko portfolio photos" on storage.objects;
create policy "Owners can update Niko portfolio photos"
on storage.objects for update
to authenticated
using (
  bucket_id = 'niko-public-portfolio'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
)
with check (
  bucket_id = 'niko-public-portfolio'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "Owners can delete Niko portfolio photos" on storage.objects;
create policy "Owners can delete Niko portfolio photos"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'niko-public-portfolio'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

-- Secure customer contract links and electronic signatures.
-- The public site never receives direct table access. It can only call the
-- two functions below with the random link token plus matching customer data.
create extension if not exists pgcrypto;

create table if not exists public.niko_signature_requests (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid not null,
  access_token_hash text not null unique check (char_length(access_token_hash) = 64),
  customer_name text not null,
  customer_phone_last4 text not null check (customer_phone_last4 ~ '^[0-9]{4}$'),
  quote_number text not null,
  document_type text not null default 'contract' check (document_type in ('quote','contract','receipt')),
  document_snapshot jsonb not null,
  expires_at timestamptz not null,
  opened_at timestamptz,
  signed_at timestamptz,
  signer_name text,
  signature_data_url text,
  signer_acknowledged boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.niko_signature_requests enable row level security;
revoke all on table public.niko_signature_requests from anon, authenticated;
grant select, insert, update, delete on table public.niko_signature_requests to authenticated;

drop policy if exists "Owners manage their signature requests" on public.niko_signature_requests;
create policy "Owners manage their signature requests"
on public.niko_signature_requests for all
to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

create or replace function public.niko_open_signature_request(
  p_token text,
  p_customer_name text,
  p_phone_last4 text,
  p_quote_number text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare request_row public.niko_signature_requests%rowtype;
begin
  select * into request_row
  from public.niko_signature_requests
  where access_token_hash = encode(digest(p_token, 'sha256'), 'hex')
    and lower(trim(customer_name)) = lower(trim(p_customer_name))
    and customer_phone_last4 = regexp_replace(p_phone_last4, '[^0-9]', '', 'g')
    and upper(trim(quote_number)) = upper(trim(p_quote_number))
    and expires_at > now();
  if not found then return null; end if;
  update public.niko_signature_requests set opened_at = coalesce(opened_at, now()) where id = request_row.id;
  return jsonb_build_object(
    'id', request_row.id,
    'documentType', request_row.document_type,
    'document', request_row.document_snapshot,
    'expiresAt', request_row.expires_at,
    'signedAt', request_row.signed_at,
    'signerName', request_row.signer_name
  );
end;
$$;

create or replace function public.niko_submit_signature(
  p_token text,
  p_customer_name text,
  p_phone_last4 text,
  p_quote_number text,
  p_signer_name text,
  p_signature_data_url text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare request_id uuid;
begin
  if char_length(trim(p_signer_name)) < 2 or char_length(p_signature_data_url) > 250000 or p_signature_data_url not like 'data:image/png;base64,%' then
    raise exception 'Invalid signature information';
  end if;
  select id into request_id
  from public.niko_signature_requests
  where access_token_hash = encode(digest(p_token, 'sha256'), 'hex')
    and lower(trim(customer_name)) = lower(trim(p_customer_name))
    and customer_phone_last4 = regexp_replace(p_phone_last4, '[^0-9]', '', 'g')
    and upper(trim(quote_number)) = upper(trim(p_quote_number))
    and expires_at > now()
    and signed_at is null;
  if request_id is null then return null; end if;
  update public.niko_signature_requests
  set signer_name = trim(p_signer_name), signature_data_url = p_signature_data_url,
      signer_acknowledged = true, signed_at = now()
  where id = request_id;
  return jsonb_build_object('id', request_id, 'signedAt', now());
end;
$$;

revoke all on function public.niko_open_signature_request(text,text,text,text) from public;
revoke all on function public.niko_submit_signature(text,text,text,text,text,text) from public;
grant execute on function public.niko_open_signature_request(text,text,text,text) to anon, authenticated;
grant execute on function public.niko_submit_signature(text,text,text,text,text,text) to anon, authenticated;
