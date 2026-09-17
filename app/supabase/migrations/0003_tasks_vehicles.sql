-- To-do list, garage (vehicles), and a saved home location for weather in
-- the daily briefing.

create type public.task_priority as enum ('low', 'medium', 'high');

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  notes text,
  list_name text not null default 'Inbox',
  priority public.task_priority not null default 'medium',
  due_at timestamptz,
  completed boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tasks_user_due_idx on public.tasks (user_id, completed, due_at);

create type public.fuel_type as enum ('petrol', 'diesel', 'electric', 'hybrid', 'other');

create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  make text,
  model text,
  year integer,
  color text,
  license_plate text,
  fuel_type public.fuel_type not null default 'petrol',
  fuel_level_pct numeric,
  battery_level_pct numeric,
  odometer_km numeric,
  range_km numeric,
  last_service_date date,
  next_service_due date,
  notes text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists vehicles_user_idx on public.vehicles (user_id);

alter table public.profiles
  add column if not exists home_latitude numeric,
  add column if not exists home_longitude numeric,
  add column if not exists home_city text;

alter table public.tasks enable row level security;
alter table public.vehicles enable row level security;

create policy "tasks: owner" on public.tasks for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "vehicles: owner" on public.vehicles for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
