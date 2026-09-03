-- Add Tarjeta de crédito as a distinct, lead-level payment intent.
-- Forward-only: preserve historical values and the current creation default.
begin;

alter table public.leads
  drop constraint if exists leads_payment_method_check;

alter table public.leads
  add constraint leads_payment_method_check
  check (payment_method in ('CREDITO', 'TARJETA_CREDITO', 'CONTADO', 'LEASING', 'POR_DEFINIR'));

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
    when 'TARJETA_CREDITO' then 0
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

comment on function public.calculate_lead_score() is 'Lead score; TARJETA_CREDITO is initially neutral (0 points) until product evidence defines a commercial weight.';

commit;
