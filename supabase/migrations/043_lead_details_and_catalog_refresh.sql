-- Lead details, refreshed vehicle catalog, and purchase confirmation identity.
-- Additive only: historical migrations remain immutable.

alter table public.leads
  add column if not exists national_id text,
  add column if not exists email text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'leads_national_id_format_check'
  ) then
    alter table public.leads
      add constraint leads_national_id_format_check
      check (national_id is null or (length(btrim(national_id)) between 5 and 30 and btrim(national_id) ~ '^[0-9A-Za-z-]+$'));
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'leads_email_format_check'
  ) then
    alter table public.leads
      add constraint leads_email_format_check
      check (email is null or (length(btrim(email)) between 3 and 150 and position('@' in btrim(email)) > 1));
  end if;
end;
$$;

alter table public.lead_milestones
  add column if not exists buyer_national_id text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'lead_milestones_buyer_national_id_check'
  ) then
    alter table public.lead_milestones
      add constraint lead_milestones_buyer_national_id_check
      check (buyer_national_id is null or (length(btrim(buyer_national_id)) between 5 and 30 and btrim(buyer_national_id) ~ '^[0-9A-Za-z-]+$'));
  end if;
end;
$$;

-- Keep the active catalog aligned with the advisor-facing order. Existing rows
-- are updated rather than deleted so historical lead values remain readable.
insert into public.car_models (id, name, sort_order, active, is_other)
values
  ('v3', 'Alsvin V3', 1, true, false),
  ('alsvin-plus', 'Alsvin Plus', 2, true, false),
  ('cs15-2027', 'CS15', 3, true, false),
  ('q05', 'Q05', 4, true, false),
  ('cs55-rev-2027', 'CS55 Plus R-EV', 5, true, false),
  ('x7-plus', 'X7 Plus', 6, true, false),
  ('cs75', 'CS75 Plus', 7, true, false),
  ('deepal-s05-max-hibrido', 'Deepal S05 Max Híbrido', 8, true, false),
  ('deepal-s05-e', 'Deepal S05 E', 9, true, false),
  ('deepal-s07-e', 'Deepal S07 E', 10, true, false),
  ('deepal-s07-reev', 'Deepal S07 REEV', 11, true, false),
  ('deepal-g318-r-ev', 'Deepal G318 R-EV', 12, true, false),
  ('hunter-turbo', 'HUNTER Turbo Diésel', 13, true, false),
  ('hunter-e', 'HUNTER E', 14, true, false),
  ('honor-s', 'Honor S Cargo', 15, true, false),
  ('startruck', 'Star Truck', 16, true, false),
  ('m60', 'M60 Pasajeros', 17, true, false),
  ('other', 'Otro modelo', 99, true, true)
on conflict (id) do update set
  name = excluded.name,
  sort_order = excluded.sort_order,
  active = excluded.active,
  is_other = excluded.is_other;

update public.car_models
set active = false
where id = 'deepal-s07-max';

create table if not exists public.car_model_assets (
  id uuid primary key default gen_random_uuid(),
  car_model_id text not null references public.car_models(id) on delete cascade,
  asset_kind text not null check (asset_kind in ('PHOTO', 'TECHNICAL_SHEET')),
  storage_path text not null,
  file_name text not null,
  mime_type text not null,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (car_model_id, asset_kind)
);

create index if not exists car_model_assets_model_kind_idx
  on public.car_model_assets (car_model_id, asset_kind, sort_order);

alter table public.car_model_assets enable row level security;

drop policy if exists "car_model_assets_select_active" on public.car_model_assets;
create policy "car_model_assets_select_active"
on public.car_model_assets for select to anon, authenticated
using (active = true and exists (
  select 1 from public.car_models
  where car_models.id = car_model_assets.car_model_id
    and car_models.active = true
));

insert into public.car_model_assets (car_model_id, asset_kind, storage_path, file_name, mime_type, sort_order, active)
values
  ('cs15-2027', 'PHOTO', 'cs15/changan-cs15-vehiculo.jpg', 'Changan CS15 - Vehículo.jpg', 'image/jpeg', 0, true),
  ('cs15-2027', 'TECHNICAL_SHEET', 'cs15/changan-cs15-ficha-tecnica.pdf', 'Changan CS15 - Ficha técnica.pdf', 'application/pdf', 0, true),
  ('deepal-s07-e', 'PHOTO', 'deepal-s07-e/changan-deepal-s07-e-vehiculo.jpg', 'Deepal S07 E - Vehículo.jpg', 'image/jpeg', 0, true),
  ('deepal-s07-e', 'TECHNICAL_SHEET', 'deepal-s07-e/changan-deepal-s07-e-ficha-tecnica.pdf', 'Deepal S07 E - Ficha técnica.pdf', 'application/pdf', 0, true),
  ('deepal-s07-reev', 'PHOTO', 'deepal-s07-reev/changan-deepal-s07-reev-vehiculo.jpg', 'Deepal S07 REEV - Vehículo.jpg', 'image/jpeg', 0, true),
  ('deepal-s07-reev', 'TECHNICAL_SHEET', 'deepal-s07-reev/changan-deepal-s07-reev-ficha-tecnica.pdf', 'Deepal S07 REEV - Ficha técnica.pdf', 'application/pdf', 0, true)
on conflict (car_model_id, asset_kind) do update set
  storage_path = excluded.storage_path,
  file_name = excluded.file_name,
  mime_type = excluded.mime_type,
  sort_order = excluded.sort_order,
  active = excluded.active;

-- New purchase commands require the buyer identity while preserving the
-- existing E6 v1 RPC for historical compatibility.
create or replace function public.record_purchase_decision_v2(
  p_lead_id uuid,
  p_national_id text,
  p_idempotency_key text default null,
  p_recorded_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  owner_id uuid;
  lead_row public.leads;
  milestone_row public.lead_milestones;
  event_result jsonb;
  normalized_national_id text := nullif(btrim(p_national_id), '');
  recorded_at timestamptz := coalesce(p_recorded_at, now());
begin
  owner_id := public.leadflow_action_owner_v1();
  if p_lead_id is null then
    raise exception using errcode = '22023', message = 'LEAD_REQUIRED';
  end if;
  if normalized_national_id is null or length(normalized_national_id) not between 5 and 30 or normalized_national_id !~ '^[0-9A-Za-z-]+$' then
    raise exception using errcode = '22023', message = 'BUYER_NATIONAL_ID_REQUIRED';
  end if;
  if p_idempotency_key is null or length(btrim(p_idempotency_key)) not between 16 and 200 then
    raise exception using errcode = '22023', message = 'PURCHASE_DECISION_COMMAND_INPUT_REQUIRED';
  end if;
  if p_recorded_at is not null and p_recorded_at > now() + interval '5 minutes' then
    raise exception using errcode = '22023', message = 'PURCHASE_DECISION_TIMESTAMP_INVALID';
  end if;

  select * into lead_row
  from public.leads
  where id = p_lead_id and user_id = owner_id and deleted_at is null
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'LEAD_NOT_ACTIVE_OR_NOT_OWNED';
  end if;

  select * into milestone_row
  from public.lead_milestones
  where lead_id = p_lead_id and milestone_type = 'PURCHASE_DECISION'
  for update;
  if found then
    return jsonb_build_object('status', 'REPLAYED', 'replayed', true, 'milestone', jsonb_build_object(
      'id', milestone_row.id, 'lead_id', milestone_row.lead_id,
      'milestone_type', milestone_row.milestone_type, 'recorded_at', milestone_row.recorded_at,
      'origin', milestone_row.origin
    ));
  end if;

  update public.leads
  set national_id = normalized_national_id
  where id = lead_row.id;

  insert into public.lead_milestones (lead_id, milestone_type, recorded_at, origin, buyer_national_id)
  values (p_lead_id, 'PURCHASE_DECISION', recorded_at, 'MANUAL', normalized_national_id)
  returning * into milestone_row;

  event_result := public.append_leadflow_event_v1(jsonb_build_object(
    'event_type', 'purchase_decision_recorded',
    'schema_version', 1,
    'occurred_at', milestone_row.recorded_at,
    'source', 'PWA',
    'stage', 'PURCHASE',
    'actor_kind', 'ADVISOR',
    'actor_id', owner_id,
    'correlation_id', gen_random_uuid(),
    'idempotency_key', p_idempotency_key,
    'payload', jsonb_build_object('lead_id', milestone_row.lead_id, 'milestone_id', milestone_row.id, 'origin', 'MANUAL'),
    'identity_components', jsonb_build_array(jsonb_build_object('name', 'milestone_id', 'value', milestone_row.id))
  ));

  return jsonb_build_object('status', 'RECORDED', 'replayed', false,
    'event', event_result,
    'milestone', jsonb_build_object(
      'id', milestone_row.id, 'lead_id', milestone_row.lead_id,
      'milestone_type', milestone_row.milestone_type, 'recorded_at', milestone_row.recorded_at,
      'origin', milestone_row.origin
    ));
end;
$$;

revoke all on function public.record_purchase_decision_v2(uuid, text, text, timestamptz) from public, anon;
grant execute on function public.record_purchase_decision_v2(uuid, text, text, timestamptz) to authenticated;
