-- Store the current payment intent as an ordered set while preserving the
-- legacy scalar for older readers and historical LEASING leads.
begin;

alter table public.leads
  add column if not exists payment_methods text[];

update public.leads
set payment_methods = array[payment_method]
where payment_methods is null or cardinality(payment_methods) = 0;

alter table public.leads
  alter column payment_methods set not null;

alter table public.leads
  add constraint leads_payment_methods_check
  check (
    cardinality(payment_methods) between 1 and 5
    and array_position(payment_methods, null) is null
    and payment_methods <@ array['CREDITO', 'TARJETA_CREDITO', 'CONTADO', 'LEASING', 'POR_DEFINIR']::text[]
  );

create or replace function public.calculate_lead_score()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  calculated_score integer := 0;
  payment_score integer := 0;
  method_count integer := 0;
  unique_method_count integer := 0;
begin
  -- Compatibility with older writers: a scalar-only insert/update remains
  -- valid and becomes a one-item array. New writers send both fields.
  if new.payment_methods is null or cardinality(new.payment_methods) = 0 then
    new.payment_methods := array[new.payment_method];
  elsif tg_op = 'UPDATE'
    and new.payment_method is distinct from old.payment_method
    and new.payment_methods is not distinct from old.payment_methods then
    new.payment_methods := array[new.payment_method];
  end if;

  select count(*)::integer, count(distinct method)::integer
  into method_count, unique_method_count
  from unnest(new.payment_methods) as methods(method);

  if method_count <> unique_method_count then
    raise exception 'payment_methods cannot contain duplicates';
  end if;

  -- Keep the legacy scalar as the first selected option for old readers.
  new.payment_method := new.payment_methods[1];

  calculated_score := calculated_score + case new.timeframe
    when 'INMEDIATA' then 40
    when '1_3_MESES' then 30
    when '3_6_MESES' then 15
    else 5
  end;

  -- Multiple methods are alternatives, so retain the strongest existing
  -- signal instead of adding points or making score depend on selection order.
  select coalesce(max(case method
    when 'CREDITO' then 20
    when 'TARJETA_CREDITO' then 0
    when 'CONTADO' then 15
    when 'LEASING' then 18
    else 5
  end), 0)
  into payment_score
  from unnest(new.payment_methods) as methods(method);
  calculated_score := calculated_score + payment_score;
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
before insert or update of car_model, timeframe, payment_method, payment_methods, trade_in_car
on public.leads
for each row execute function public.calculate_lead_score();

comment on column public.leads.payment_methods is 'Ordered payment intents; payment_method remains the first selected value for legacy readers. LEASING is retained for historical leads but is not offered for new leads.';

commit;
