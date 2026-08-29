-- Persist catalog lead-registration totals so the catalog does not count leads
-- on every visit. Totals intentionally include soft-deleted leads.
alter table public.car_models
  add column if not exists lead_registration_count integer not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'car_models_lead_registration_count_check'
  ) then
    alter table public.car_models
      add constraint car_models_lead_registration_count_check
      check (lead_registration_count >= 0);
  end if;
end;
$$;

create or replace function public.catalog_model_id_for_lead_model(p_model_name text)
returns text
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  with normalized as (
    select lower(btrim(coalesce(p_model_name, ''))) as value
  )
  select case
    when value in ('v3', 'alsvin v3') then 'v3'
    when value = 'alsvin plus' then 'alsvin-plus'
    when value in ('cs15', 'cs15 - modelo 2027') then 'cs15-2027'
    when value = 'q05' then 'q05'
    when value in ('cs55 plus r-ev', 'cs55 r-ev - modelo 2027') then 'cs55-rev-2027'
    when value = 'x7 plus' then 'x7-plus'
    when value in ('cs75', 'cs75 plus') then 'cs75'
    when value in ('deepal s05 max híbrido', 'deepal s05 max hibrido', 'deepal s05 max') then 'deepal-s05-max-hibrido'
    when value = 'deepal s05 e' then 'deepal-s05-e'
    when value = 'deepal s07 e' then 'deepal-s07-e'
    when value = 'deepal s07 reev' then 'deepal-s07-reev'
    when value = 'deepal g318 r-ev' then 'deepal-g318-r-ev'
    when value in ('hunter turbo diésel', 'hunter turbo diesel', 'hunter turbo') then 'hunter-turbo'
    when value = 'hunter e' then 'hunter-e'
    when value in ('honor s cargo', 'honor s') then 'honor-s'
    when value in ('star truck', 'startruck') then 'startruck'
    when value in ('m60 pasajeros', 'm60') then 'm60'
    else null
  end
  from normalized
  where value <> '';
$$;

revoke all on function public.catalog_model_id_for_lead_model(text) from public, anon, authenticated;

-- Backfill once, including deleted leads. Historical names are normalized by
-- the resolver above so catalog renames do not erase their contribution.
with lead_model_counts as (
  select
    public.catalog_model_id_for_lead_model(model_name) as car_model_id,
    count(*)::integer as registration_count
  from public.leads as leads
  cross join lateral unnest(
    case
      when cardinality(coalesce(leads.car_models, '{}'::text[])) > 0 then leads.car_models
      else array[leads.car_model]
    end
  ) as selected(model_name)
  where public.catalog_model_id_for_lead_model(model_name) is not null
  group by public.catalog_model_id_for_lead_model(model_name)
)
update public.car_models as models
set lead_registration_count = coalesce(counts.registration_count, 0)
from lead_model_counts as counts
where models.id = counts.car_model_id;

update public.car_models
set lead_registration_count = 0
where not exists (
  select 1
  from public.leads as leads
  cross join lateral unnest(
    case
      when cardinality(coalesce(leads.car_models, '{}'::text[])) > 0 then leads.car_models
      else array[leads.car_model]
    end
  ) as selected(model_name)
  where public.catalog_model_id_for_lead_model(selected.model_name) = public.car_models.id
);

create or replace function public.track_catalog_lead_registration()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  model_id text;
begin
  for model_id in
    select distinct public.catalog_model_id_for_lead_model(selected.model_name)
    from unnest(
      case
        when cardinality(coalesce(new.car_models, '{}'::text[])) > 0 then new.car_models
        else array[new.car_model]
      end
    ) as selected(model_name)
    where public.catalog_model_id_for_lead_model(selected.model_name) is not null
  loop
    if tg_op = 'UPDATE' and exists (
      select 1
      from unnest(
        case
          when cardinality(coalesce(old.car_models, '{}'::text[])) > 0 then old.car_models
          else array[old.car_model]
        end
      ) as previous(model_name)
      where public.catalog_model_id_for_lead_model(previous.model_name) = model_id
    ) then
      continue;
    end if;

    update public.car_models
    set lead_registration_count = lead_registration_count + 1
    where id = model_id;
  end loop;

  return new;
end;
$$;

drop trigger if exists leads_track_catalog_registration on public.leads;
create trigger leads_track_catalog_registration
after insert or update of car_model, car_models on public.leads
for each row execute function public.track_catalog_lead_registration();

comment on column public.car_models.lead_registration_count is
  'Historical count of lead registrations for this catalog model, including soft-deleted leads.';
