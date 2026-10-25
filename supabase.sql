-- Run this once in Supabase: SQL Editor > New query > paste > Run.
create table if not exists public.wr_users (
  email       text primary key,
  name        text,
  for_name    text,
  pass_hash   text not null,
  pin_hash    text not null,
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
-- Only the server (service key) may touch this table. No public access.
alter table public.wr_users enable row level security;
