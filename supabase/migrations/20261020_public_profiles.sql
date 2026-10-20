-- Public creator profiles for Focus Practice.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  avatar_url text,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
drop policy if exists "profiles_public_read" on public.profiles;
drop policy if exists "profiles_owner_insert" on public.profiles;
drop policy if exists "profiles_owner_update" on public.profiles;
create policy "profiles_public_read" on public.profiles for select using (true);
create policy "profiles_owner_insert" on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "profiles_owner_update" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
grant select on public.profiles to anon, authenticated;
grant insert, update on public.profiles to authenticated;
