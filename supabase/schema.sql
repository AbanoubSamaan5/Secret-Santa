-- Run as the Supabase SQL editor / database owner.
create extension if not exists pgcrypto;

create table if not exists public.game_state (
  id integer primary key check (id = 1),
  started_at timestamptz null
);
insert into public.game_state(id, started_at) values (1, null) on conflict (id) do nothing;

create table if not exists public.participants (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (char_length(display_name) between 1 and 80),
  claim_status text not null default 'available' check (claim_status in ('available','claimed')),
  joined_at timestamptz null,
  reset_at timestamptz null,
  created_at timestamptz not null default now()
);
create unique index if not exists participants_display_name_ci on public.participants (lower(display_name));

-- The recipient UUID is encrypted before it reaches this table.
create table if not exists public.assignments (
  giver_id uuid primary key references public.participants(id) on delete cascade,
  recipient_ciphertext text not null
);

create table if not exists public.device_sessions (
  token_hash text primary key,
  participant_id uuid not null references public.participants(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists device_sessions_participant_idx on public.device_sessions(participant_id);

create table if not exists public.admin_token (
  id integer primary key check (id = 1),
  token_hash text not null
);
create table if not exists public.admin_sessions (
  token_hash text primary key,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.wishlists (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.participants(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 100),
  url text null check (url is null or char_length(url) <= 1000),
  note text null check (note is null or char_length(note) <= 300),
  approx_price text null check (approx_price is null or char_length(approx_price) <= 40),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists wishlists_owner_sort_idx on public.wishlists(owner_id, sort_order);

create table if not exists public.wishlist_preferences (
  participant_id uuid primary key references public.participants(id) on delete cascade,
  anything_is_fine boolean not null default false,
  updated_at timestamptz not null default now()
);

-- Dashboard-safe aggregate only. No wishlist content.
create or replace view public.wishlist_stats as
select p.id as participant_id,
       (count(w.id) > 0 or coalesce(pref.anything_is_fine,false)) as has_wishlist,
       count(w.id)::integer as item_count
from public.participants p
left join public.wishlists w on w.owner_id = p.id
left join public.wishlist_preferences pref on pref.participant_id = p.id
group by p.id, pref.anything_is_fine;

-- Simple fixed-window rate limiter. Only service role can execute it.
create table if not exists public.rate_limits (
  key text primary key,
  window_started_at timestamptz not null,
  request_count integer not null
);
create or replace function public.consume_rate_limit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean language plpgsql security definer set search_path = public as $$
declare allowed boolean;
begin
  insert into rate_limits(key, window_started_at, request_count)
  values (p_key, now(), 1)
  on conflict (key) do update
    set window_started_at = case when rate_limits.window_started_at < now() - make_interval(secs => p_window_seconds) then now() else rate_limits.window_started_at end,
        request_count = case when rate_limits.window_started_at < now() - make_interval(secs => p_window_seconds) then 1 else rate_limits.request_count + 1 end;
  select request_count <= p_limit into allowed from rate_limits where key = p_key;
  return allowed;
end $$;

-- Deny direct client access to every sensitive table/view.
alter table public.game_state enable row level security;
alter table public.participants enable row level security;
alter table public.assignments enable row level security;
alter table public.device_sessions enable row level security;
alter table public.admin_token enable row level security;
alter table public.admin_sessions enable row level security;
alter table public.wishlists enable row level security;
alter table public.wishlist_preferences enable row level security;
alter table public.rate_limits enable row level security;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on function public.consume_rate_limit(text,integer,integer) from anon, authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
grant execute on function public.consume_rate_limit(text,integer,integer) to service_role;

-- Important: never expose service_role key to the browser.
