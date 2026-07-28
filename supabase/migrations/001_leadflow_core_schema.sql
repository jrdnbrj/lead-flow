create extension if not exists pgcrypto;

do $$
begin
  create type public.lead_temperature as enum ('HIGH', 'MEDIUM', 'LOW');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.whatsapp_status as enum ('PENDING', 'SENT', 'FAILED');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.lead_status as enum ('NUEVO', 'CONTACTADO', 'COTIZADO', 'PERDIDO', 'CERRADO');
exception when duplicate_object then null;
end $$;

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  tenant_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  full_name text not null check (char_length(trim(full_name)) between 2 and 100),
  phone text not null check (char_length(trim(phone)) between 7 and 30),
  car_model text not null check (char_length(trim(car_model)) between 2 and 100),
  timeframe text not null check (timeframe in ('INMEDIATA', '1_3_MESES', '3_6_MESES', 'EXPLORANDO')),
  payment_method text not null check (payment_method in ('CREDITO', 'CONTADO', 'LEASING', 'POR_DEFINIR')),
  trade_in_car boolean not null default false,
  score integer not null default 0 check (score between 0 and 100),
  temperature public.lead_temperature not null default 'LOW',
  notes text check (notes is null or char_length(notes) <= 500),
  whatsapp_status public.whatsapp_status not null default 'PENDING',
  whatsapp_attempts integer not null default 0 check (whatsapp_attempts >= 0),
  whatsapp_last_error text,
  whatsapp_sent_at timestamptz,
  status public.lead_status not null default 'NUEVO'
);

create index if not exists leads_user_created_at_idx on public.leads (user_id, created_at desc);
create index if not exists leads_temperature_idx on public.leads (temperature);
create index if not exists leads_status_idx on public.leads (status);

create or replace function public.calculate_lead_score()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  calculated_score integer := 0;
begin
  calculated_score := calculated_score + case new.timeframe
    when 'INMEDIATA' then 40
    when '1_3_MESES' then 30
    when '3_6_MESES' then 15
    else 5
  end;
  calculated_score := calculated_score + case new.payment_method
    when 'CREDITO' then 20
    when 'CONTADO' then 15
    when 'LEASING' then 18
    else 5
  end;
  calculated_score := calculated_score + case when new.trade_in_car then 20 else 8 end;
  calculated_score := calculated_score + case when char_length(trim(new.car_model)) > 0 then 20 else 0 end;

  new.score := least(100, calculated_score);
  new.temperature := case
    when new.score >= 70 then 'HIGH'::public.lead_temperature
    when new.score >= 45 then 'MEDIUM'::public.lead_temperature
    else 'LOW'::public.lead_temperature
  end;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists leads_calculate_score on public.leads;
create trigger leads_calculate_score
before insert or update of car_model, timeframe, payment_method, trade_in_car
on public.leads
for each row execute function public.calculate_lead_score();

create or replace function public.touch_lead_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists leads_touch_updated_at on public.leads;
create trigger leads_touch_updated_at
before update on public.leads
for each row execute function public.touch_lead_updated_at();

alter table public.leads enable row level security;

drop policy if exists "leads_select_own" on public.leads;
create policy "leads_select_own"
on public.leads for select to authenticated
using (user_id = auth.uid());

drop policy if exists "leads_insert_own" on public.leads;
create policy "leads_insert_own"
on public.leads for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists "leads_insert_anonymous" on public.leads;
create policy "leads_insert_anonymous"
on public.leads for insert to anon
with check (user_id is null);

drop policy if exists "leads_update_own" on public.leads;
create policy "leads_update_own"
on public.leads for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

comment on table public.leads is 'LeadFlow prospects; tenant_id is reserved for multi-organization isolation.';
comment on column public.leads.whatsapp_status is 'Updated asynchronously by the send-whatsapp-welcome Edge Function.';
