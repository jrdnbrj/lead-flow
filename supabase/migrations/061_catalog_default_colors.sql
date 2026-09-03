-- Persist one selected catalog color per model. This is also the default
-- color used by the First Contact resolver when the advisor does not choose a
-- different color for that operation.
begin;

alter table public.car_model_colors
  add column if not exists is_default boolean not null default false;

create unique index if not exists car_model_colors_one_default_per_model_idx
  on public.car_model_colors (car_model_id)
  where is_default;

update public.car_model_colors
set is_default = true
where active = true
  and slug = 'blanco'
  and exists (
    select 1
    from public.car_models
    where car_models.id = car_model_colors.car_model_id
      and car_models.active = true
  );

create or replace function public.set_car_model_default_color_v1(
  p_model_id text,
  p_color_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'CATALOG_DEFAULT_COLOR_FORBIDDEN';
  end if;

  if not exists (
    select 1
    from public.car_model_colors c
    join public.car_models m on m.id = c.car_model_id
    where c.id = p_color_id
      and c.car_model_id = p_model_id
      and c.active = true
      and m.active = true
      and m.is_other = false
  ) then
    raise exception using errcode = '22023', message = 'CATALOG_DEFAULT_COLOR_INVALID';
  end if;

  update public.car_model_colors
     set is_default = false
   where car_model_id = p_model_id
     and is_default;

  update public.car_model_colors
     set is_default = true
   where id = p_color_id
     and car_model_id = p_model_id;

  return jsonb_build_object('model_id', p_model_id, 'color_id', p_color_id);
end;
$$;

revoke all on function public.set_car_model_default_color_v1(text, text) from public, anon, authenticated;
grant execute on function public.set_car_model_default_color_v1(text, text) to service_role;

commit;
