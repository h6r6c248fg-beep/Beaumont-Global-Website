-- Meridian — initial schema
-- Every table is owned by a single auth.uid() and locked down with RLS so
-- data is private per-user and syncs automatically across every device the
-- user signs in on (that's just Postgres + Supabase Auth — no extra work).

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  avatar_url text,
  timezone text not null default 'Europe/London',
  theme text not null default 'obsidian',
  onboarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Calendar
-- ---------------------------------------------------------------------------
create type public.calendar_provider as enum ('google', 'microsoft', 'apple_caldav', 'manual');

create table if not exists public.calendar_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider public.calendar_provider not null,
  display_name text not null,
  email text,
  color text not null default '#cba15c',
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  caldav_url text,
  caldav_username text,
  caldav_app_password text,
  status text not null default 'connected',
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);

create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  calendar_account_id uuid references public.calendar_accounts (id) on delete cascade,
  external_id text,
  title text not null,
  description text,
  location text,
  start_at timestamptz not null,
  end_at timestamptz not null,
  all_day boolean not null default false,
  source public.calendar_provider not null default 'manual',
  color text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists calendar_events_user_start_idx on public.calendar_events (user_id, start_at);

-- ---------------------------------------------------------------------------
-- Email
-- ---------------------------------------------------------------------------
create type public.email_provider as enum ('gmail', 'microsoft', 'imap');

create table if not exists public.email_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider public.email_provider not null,
  display_name text not null,
  email_address text not null,
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  imap_host text,
  imap_port integer,
  imap_username text,
  imap_app_password text,
  status text not null default 'connected',
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);

create table if not exists public.email_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  email_account_id uuid not null references public.email_accounts (id) on delete cascade,
  external_id text,
  from_name text,
  from_address text,
  subject text,
  snippet text,
  received_at timestamptz not null default now(),
  is_read boolean not null default false,
  is_starred boolean not null default false,
  folder text not null default 'inbox',
  created_at timestamptz not null default now()
);

create index if not exists email_messages_user_received_idx on public.email_messages (user_id, received_at desc);

-- ---------------------------------------------------------------------------
-- AI Assistant
-- ---------------------------------------------------------------------------
create table if not exists public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null default 'New conversation',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create type public.ai_role as enum ('user', 'assistant', 'system');

create table if not exists public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.ai_role not null,
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists ai_messages_conversation_idx on public.ai_messages (conversation_id, created_at);

-- ---------------------------------------------------------------------------
-- Cycles (steroid / peptide tracking)
-- ---------------------------------------------------------------------------
create type public.compound_category as enum ('anabolic_steroid', 'peptide', 'ancillary', 'sarm', 'other');

create table if not exists public.compounds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  name text not null,
  category public.compound_category not null,
  default_unit text not null default 'mg',
  half_life_hours numeric,
  notes text,
  is_custom boolean not null default true,
  created_at timestamptz not null default now()
);

create type public.cycle_type as enum ('steroid', 'peptide', 'mixed');
create type public.cycle_status as enum ('planned', 'active', 'completed', 'discontinued');

create table if not exists public.cycles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  cycle_type public.cycle_type not null default 'mixed',
  goal text,
  start_date date not null,
  end_date date,
  status public.cycle_status not null default 'planned',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create type public.administration_route as enum ('im', 'subq', 'oral', 'topical', 'nasal', 'other');

create table if not exists public.cycle_items (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.cycles (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  compound_id uuid references public.compounds (id) on delete set null,
  compound_name text not null,
  dose_amount numeric not null,
  dose_unit text not null default 'mg',
  frequency text not null default 'E3D',
  route public.administration_route not null default 'im',
  start_date date not null,
  end_date date,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.dose_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  cycle_item_id uuid not null references public.cycle_items (id) on delete cascade,
  logged_at timestamptz not null default now(),
  amount numeric not null,
  unit text not null default 'mg',
  injection_site text,
  taken boolean not null default true,
  notes text
);

create index if not exists dose_logs_user_logged_idx on public.dose_logs (user_id, logged_at desc);

create table if not exists public.bloodwork_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  cycle_id uuid references public.cycles (id) on delete set null,
  test_date date not null,
  lab_name text,
  panel jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Nutrition
-- ---------------------------------------------------------------------------
create table if not exists public.foods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  name text not null,
  brand text,
  serving_size numeric not null default 100,
  serving_unit text not null default 'g',
  calories numeric not null default 0,
  protein_g numeric not null default 0,
  carbs_g numeric not null default 0,
  fat_g numeric not null default 0,
  fiber_g numeric not null default 0,
  sugar_g numeric not null default 0,
  sodium_mg numeric not null default 0,
  is_custom boolean not null default true,
  created_at timestamptz not null default now()
);

create type public.meal_type as enum ('breakfast', 'lunch', 'dinner', 'snack');

create table if not exists public.food_log_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  food_id uuid not null references public.foods (id) on delete cascade,
  log_date date not null default current_date,
  meal public.meal_type not null default 'breakfast',
  servings numeric not null default 1,
  created_at timestamptz not null default now()
);

create index if not exists food_log_entries_user_date_idx on public.food_log_entries (user_id, log_date);

create table if not exists public.nutrition_targets (
  user_id uuid primary key references auth.users (id) on delete cascade,
  calories numeric not null default 2400,
  protein_g numeric not null default 180,
  carbs_g numeric not null default 250,
  fat_g numeric not null default 70,
  updated_at timestamptz not null default now()
);

create table if not exists public.body_weight_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  log_date date not null default current_date,
  weight_kg numeric not null,
  body_fat_pct numeric,
  notes text,
  created_at timestamptz not null default now()
);

create unique index if not exists body_weight_logs_user_date_key on public.body_weight_logs (user_id, log_date);

-- ---------------------------------------------------------------------------
-- Workouts
-- ---------------------------------------------------------------------------
create table if not exists public.exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  name text not null,
  category text not null default 'strength',
  primary_muscle text,
  equipment text,
  instructions text,
  is_custom boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.routine_exercises (
  id uuid primary key default gen_random_uuid(),
  routine_id uuid not null references public.routines (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  order_index integer not null default 0,
  target_sets integer not null default 3,
  target_reps integer not null default 10,
  target_weight_kg numeric
);

create table if not exists public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  routine_id uuid references public.routines (id) on delete set null,
  name text not null default 'Workout',
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  notes text,
  bodyweight_kg numeric,
  created_at timestamptz not null default now()
);

create table if not exists public.workout_sets (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.workout_sessions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  set_index integer not null default 1,
  weight_kg numeric not null default 0,
  reps integer not null default 0,
  rpe numeric,
  is_warmup boolean not null default false,
  completed boolean not null default true,
  rest_seconds integer,
  created_at timestamptz not null default now()
);

create index if not exists workout_sets_session_idx on public.workout_sets (session_id, set_index);
create index if not exists workout_sets_user_exercise_idx on public.workout_sets (user_id, exercise_id, created_at);

-- ---------------------------------------------------------------------------
-- Integrations (OrgView, TraderPro, future third parties)
-- ---------------------------------------------------------------------------
create type public.integration_provider as enum ('orgview', 'traderpro');

create table if not exists public.integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider public.integration_provider not null,
  display_name text not null,
  api_base_url text,
  api_key text,
  status text not null default 'not_connected',
  last_synced_at timestamptz,
  last_error text,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, provider)
);

create table if not exists public.integration_snapshots (
  id uuid primary key default gen_random_uuid(),
  integration_id uuid not null references public.integrations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  snapshot_date date not null default current_date,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.calendar_accounts enable row level security;
alter table public.calendar_events enable row level security;
alter table public.email_accounts enable row level security;
alter table public.email_messages enable row level security;
alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;
alter table public.compounds enable row level security;
alter table public.cycles enable row level security;
alter table public.cycle_items enable row level security;
alter table public.dose_logs enable row level security;
alter table public.bloodwork_logs enable row level security;
alter table public.foods enable row level security;
alter table public.food_log_entries enable row level security;
alter table public.nutrition_targets enable row level security;
alter table public.body_weight_logs enable row level security;
alter table public.exercises enable row level security;
alter table public.routines enable row level security;
alter table public.routine_exercises enable row level security;
alter table public.workout_sessions enable row level security;
alter table public.workout_sets enable row level security;
alter table public.integrations enable row level security;
alter table public.integration_snapshots enable row level security;

create policy "profiles: self" on public.profiles for all
  using (id = auth.uid()) with check (id = auth.uid());

create policy "calendar_accounts: owner" on public.calendar_accounts for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "calendar_events: owner" on public.calendar_events for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "email_accounts: owner" on public.email_accounts for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "email_messages: owner" on public.email_messages for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "ai_conversations: owner" on public.ai_conversations for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "ai_messages: owner" on public.ai_messages for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "compounds: owner or global" on public.compounds for select
  using (user_id = auth.uid() or user_id is null);
create policy "compounds: owner writes" on public.compounds for insert
  with check (user_id = auth.uid());
create policy "compounds: owner updates" on public.compounds for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "compounds: owner deletes" on public.compounds for delete
  using (user_id = auth.uid());

create policy "cycles: owner" on public.cycles for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "cycle_items: owner" on public.cycle_items for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "dose_logs: owner" on public.dose_logs for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "bloodwork_logs: owner" on public.bloodwork_logs for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "foods: owner or global" on public.foods for select
  using (user_id = auth.uid() or user_id is null);
create policy "foods: owner writes" on public.foods for insert
  with check (user_id = auth.uid());
create policy "foods: owner updates" on public.foods for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "foods: owner deletes" on public.foods for delete
  using (user_id = auth.uid());

create policy "food_log_entries: owner" on public.food_log_entries for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "nutrition_targets: owner" on public.nutrition_targets for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "body_weight_logs: owner" on public.body_weight_logs for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "exercises: owner or global" on public.exercises for select
  using (user_id = auth.uid() or user_id is null);
create policy "exercises: owner writes" on public.exercises for insert
  with check (user_id = auth.uid());
create policy "exercises: owner updates" on public.exercises for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "exercises: owner deletes" on public.exercises for delete
  using (user_id = auth.uid());

create policy "routines: owner" on public.routines for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "routine_exercises: owner" on public.routine_exercises for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "workout_sessions: owner" on public.workout_sessions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "workout_sets: owner" on public.workout_sets for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "integrations: owner" on public.integrations for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "integration_snapshots: owner" on public.integration_snapshots for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
