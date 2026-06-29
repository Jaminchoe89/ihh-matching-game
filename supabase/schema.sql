-- IHH Matching Game leaderboard table.
-- Run this in the Supabase SQL editor (or via the CLI) once per project.
--
-- Security model: Row Level Security is enabled with NO policies, so the
-- public/anon key cannot read or write this table. Only the service-role key
-- (used by the game's server, never exposed to the browser) can access it.
-- Phone numbers therefore never leave the server except via the password-
-- protected /admin endpoint.

create table if not exists public.leaderboard (
  id          bigint generated always as identity primary key,
  name        text        not null,
  phone       text        not null,
  time_ms     integer     not null,
  created_at  timestamptz not null default now()
);

create index if not exists leaderboard_time_idx
  on public.leaderboard (time_ms asc, created_at asc);

alter table public.leaderboard enable row level security;
-- (Intentionally no policies — server uses the service-role key, which bypasses RLS.)
