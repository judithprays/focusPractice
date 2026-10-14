-- Focus Practice: session TL;DR summary fields
-- Safe to run more than once.
alter table public.sessions
  add column if not exists summary text,
  add column if not exists summary_emoji text;
