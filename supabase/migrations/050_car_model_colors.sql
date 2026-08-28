-- Catalog colors only. Lead color selection and photo-color mapping are intentionally out of scope.
create table if not exists public.car_model_colors (
  id text primary key,
  car_model_id text not null references public.car_models(id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (car_model_id, slug)
);

create index if not exists car_model_colors_model_order_idx
  on public.car_model_colors (car_model_id, sort_order);

alter table public.car_model_colors enable row level security;

drop policy if exists "car_model_colors_select_active" on public.car_model_colors;
create policy "car_model_colors_select_active"
on public.car_model_colors for select to authenticated
using (active = true and exists (
  select 1 from public.car_models
  where car_models.id = car_model_colors.car_model_id
    and car_models.active = true
));

revoke all on public.car_model_colors from anon;
grant select on public.car_model_colors to authenticated;

-- Map only to current catalog IDs. Trim variants that do not exist separately
-- are coalesced into their single current catalog model.
insert into public.car_model_colors (id, car_model_id, name, slug, sort_order, active)
values
  ('v3-plateado', 'v3', 'Plateado', 'plateado', 1, true),
  ('v3-blanco', 'v3', 'Blanco', 'blanco', 2, true),
  ('v3-negro', 'v3', 'Negro', 'negro', 3, true),
  ('alsvin-plus-blanco', 'alsvin-plus', 'Blanco', 'blanco', 1, true),
  ('alsvin-plus-negro', 'alsvin-plus', 'Negro', 'negro', 2, true),
  ('alsvin-plus-plateado', 'alsvin-plus', 'Plateado', 'plateado', 3, true),
  ('alsvin-plus-plomo', 'alsvin-plus', 'Plomo', 'plomo', 4, true),
  ('alsvin-plus-rojo', 'alsvin-plus', 'Rojo', 'rojo', 5, true),
  ('cs15-2027-negro', 'cs15-2027', 'Negro', 'negro', 1, true),
  ('cs15-2027-blanco', 'cs15-2027', 'Blanco', 'blanco', 2, true),
  ('cs15-2027-plateado', 'cs15-2027', 'Plateado', 'plateado', 3, true),
  ('cs55-rev-2027-blanco', 'cs55-rev-2027', 'Blanco', 'blanco', 1, true),
  ('cs55-rev-2027-negro', 'cs55-rev-2027', 'Negro', 'negro', 2, true),
  ('cs55-rev-2027-plateado', 'cs55-rev-2027', 'Plateado', 'plateado', 3, true),
  ('cs55-rev-2027-plomo', 'cs55-rev-2027', 'Plomo', 'plomo', 4, true),
  ('cs55-rev-2027-rojo', 'cs55-rev-2027', 'Rojo', 'rojo', 5, true),
  ('cs75-negro', 'cs75', 'Negro', 'negro', 1, true),
  ('cs75-blanco', 'cs75', 'Blanco', 'blanco', 2, true),
  ('cs75-plomo', 'cs75', 'Plomo', 'plomo', 3, true),
  ('cs75-plata', 'cs75', 'Plata', 'plata', 4, true),
  ('deepal-s05-e-negro', 'deepal-s05-e', 'Negro', 'negro', 1, true),
  ('deepal-s05-e-blanco', 'deepal-s05-e', 'Blanco', 'blanco', 2, true),
  ('deepal-s05-e-plomo', 'deepal-s05-e', 'Plomo', 'plomo', 3, true),
  ('deepal-s05-e-plateado-champagne', 'deepal-s05-e', 'Plateado (Champagne)', 'plateado-champagne', 4, true),
  ('deepal-s05-max-hibrido-negro', 'deepal-s05-max-hibrido', 'Negro', 'negro', 1, true),
  ('deepal-s05-max-hibrido-blanco', 'deepal-s05-max-hibrido', 'Blanco', 'blanco', 2, true),
  ('deepal-s05-max-hibrido-plomo', 'deepal-s05-max-hibrido', 'Plomo', 'plomo', 3, true),
  ('deepal-s05-max-hibrido-plateado-champagne', 'deepal-s05-max-hibrido', 'Plateado (Champagne)', 'plateado-champagne', 4, true),
  ('deepal-s05-max-hibrido-celeste', 'deepal-s05-max-hibrido', 'Celeste', 'celeste', 5, true),
  ('deepal-s07-e-negro', 'deepal-s07-e', 'Negro', 'negro', 1, true),
  ('deepal-s07-e-blanco', 'deepal-s07-e', 'Blanco', 'blanco', 2, true),
  ('deepal-s07-e-plomo', 'deepal-s07-e', 'Plomo', 'plomo', 3, true),
  ('deepal-s07-e-naranja', 'deepal-s07-e', 'Naranja', 'naranja', 4, true),
  ('deepal-s07-e-celeste', 'deepal-s07-e', 'Celeste', 'celeste', 5, true),
  ('deepal-s07-e-verde', 'deepal-s07-e', 'Verde', 'verde', 6, true),
  ('deepal-g318-r-ev-negro', 'deepal-g318-r-ev', 'Negro', 'negro', 1, true),
  ('deepal-g318-r-ev-blanco', 'deepal-g318-r-ev', 'Blanco', 'blanco', 2, true),
  ('deepal-g318-r-ev-plateado-mate', 'deepal-g318-r-ev', 'Plateado mate', 'plateado-mate', 3, true),
  ('deepal-g318-r-ev-plata-silver', 'deepal-g318-r-ev', 'Plata Silver', 'plata-silver', 4, true),
  ('hunter-turbo-rojo', 'hunter-turbo', 'Rojo', 'rojo', 1, true),
  ('hunter-turbo-blanco', 'hunter-turbo', 'Blanco', 'blanco', 2, true),
  ('hunter-turbo-azul', 'hunter-turbo', 'Azul', 'azul', 3, true),
  ('hunter-turbo-plomo-plateado', 'hunter-turbo', 'Plomo plateado', 'plomo-plateado', 4, true),
  ('hunter-e-rojo', 'hunter-e', 'Rojo', 'rojo', 1, true),
  ('hunter-e-blanco', 'hunter-e', 'Blanco', 'blanco', 2, true),
  ('hunter-e-negro', 'hunter-e', 'Negro', 'negro', 3, true),
  ('hunter-e-azul', 'hunter-e', 'Azul', 'azul', 4, true),
  ('hunter-e-verde', 'hunter-e', 'Verde', 'verde', 5, true),
  ('hunter-e-naranja', 'hunter-e', 'Naranja', 'naranja', 6, true),
  ('hunter-e-plata-mate', 'hunter-e', 'Plata mate', 'plata-mate', 7, true),
  ('hunter-e-plomo', 'hunter-e', 'Plomo', 'plomo', 8, true)
on conflict (car_model_id, slug) do update set
  name = excluded.name,
  sort_order = excluded.sort_order,
  active = excluded.active;

comment on table public.car_model_colors is 'Advisor-facing catalog colors; lead color selection is intentionally separate.';
