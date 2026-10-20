-- Focus Practice shareability MVP. Run in Supabase SQL Editor before deploying.
-- Legacy focuses are intentionally unclaimed until the account UUID is known.
alter table public.focuses add column if not exists owner_id uuid references auth.users(id) on delete cascade;
create index if not exists focuses_owner_id_created_at_idx on public.focuses(owner_id,created_at desc);
alter table public.focuses enable row level security;
alter table public.sessions enable row level security;

-- Replace existing table policies so older permissive anonymous policies cannot
-- override the owner-only rules below.
do $$
declare p record;
begin
  for p in select schemaname,tablename,policyname from pg_policies
    where schemaname='public' and tablename in ('focuses','sessions')
  loop execute format('drop policy if exists %I on %I.%I',p.policyname,p.schemaname,p.tablename); end loop;
end $$;

create policy "focuses_public_read" on public.focuses for select using (true);
create policy "focuses_owner_insert" on public.focuses for insert to authenticated with check (owner_id=auth.uid());
create policy "focuses_owner_update" on public.focuses for update to authenticated using (owner_id=auth.uid()) with check (owner_id=auth.uid());
create policy "focuses_owner_delete" on public.focuses for delete to authenticated using (owner_id=auth.uid());

create policy "sessions_public_read" on public.sessions for select using (exists(select 1 from public.focuses f where f.id=sessions.focus_id));
create policy "sessions_owner_insert" on public.sessions for insert to authenticated with check (exists(select 1 from public.focuses f where f.id=sessions.focus_id and f.owner_id=auth.uid()));
create policy "sessions_owner_update" on public.sessions for update to authenticated using (exists(select 1 from public.focuses f where f.id=sessions.focus_id and f.owner_id=auth.uid())) with check (exists(select 1 from public.focuses f where f.id=sessions.focus_id and f.owner_id=auth.uid()));
create policy "sessions_owner_delete" on public.sessions for delete to authenticated using (exists(select 1 from public.focuses f where f.id=sessions.focus_id and f.owner_id=auth.uid()));

-- Restrict storage writes for this bucket to the owner of the focus whose ID
-- is the first folder in the object path. Public image reads remain enabled.
do $$
declare p record;
begin
  for p in select policyname from pg_policies where schemaname='storage' and tablename='objects'
    and (coalesce(qual,'') ilike '%session-images%' or coalesce(with_check,'') ilike '%session-images%')
  loop execute format('drop policy if exists %I on storage.objects',p.policyname); end loop;
end $$;
create policy "session_images_public_read" on storage.objects for select using(bucket_id='session-images');
create policy "session_images_owner_upload" on storage.objects for insert to authenticated with check(
 bucket_id='session-images' and exists(select 1 from public.focuses f where f.id::text=(storage.foldername(name))[1] and f.owner_id=auth.uid()));
create policy "session_images_owner_update" on storage.objects for update to authenticated using(
 bucket_id='session-images' and exists(select 1 from public.focuses f where f.id::text=(storage.foldername(name))[1] and f.owner_id=auth.uid())) with check(
 bucket_id='session-images' and exists(select 1 from public.focuses f where f.id::text=(storage.foldername(name))[1] and f.owner_id=auth.uid()));
create policy "session_images_owner_delete" on storage.objects for delete to authenticated using(
 bucket_id='session-images' and exists(select 1 from public.focuses f where f.id::text=(storage.foldername(name))[1] and f.owner_id=auth.uid()));
