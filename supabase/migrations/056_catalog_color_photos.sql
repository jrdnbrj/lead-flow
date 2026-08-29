-- Catalog-only color photos. Existing model-level assets remain untouched as
-- backup and continue serving First Contact; the catalog reads this table.
create table if not exists public.car_model_color_assets (
  id uuid primary key default gen_random_uuid(),
  car_model_color_id text not null references public.car_model_colors(id) on delete cascade,
  asset_kind text not null check (asset_kind in ('PHOTO')),
  storage_path text not null,
  file_name text not null,
  mime_type text not null,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (car_model_color_id, asset_kind)
);

create index if not exists car_model_color_assets_color_kind_idx
  on public.car_model_color_assets (car_model_color_id, asset_kind, sort_order);

alter table public.car_model_color_assets enable row level security;

drop policy if exists "car_model_color_assets_select_active" on public.car_model_color_assets;
create policy "car_model_color_assets_select_active"
on public.car_model_color_assets for select to authenticated
using (active = true and exists (
  select 1
  from public.car_model_colors
  join public.car_models on car_models.id = car_model_colors.car_model_id
  where car_model_colors.id = car_model_color_assets.car_model_color_id
    and car_model_colors.active = true
    and car_models.active = true
    and car_models.is_other = false
));

revoke all on public.car_model_color_assets from anon;
grant select on public.car_model_color_assets to authenticated;

-- Complete the catalog color set required by the supplied photographs.
update public.car_model_colors
set name = 'Plateado', slug = 'plateado'
where car_model_id in ('deepal-s05-e', 'deepal-s05-max-hibrido')
  and slug = 'plateado-champagne';

insert into public.car_model_colors (id, car_model_id, name, slug, sort_order, active)
values
  ('v3-gris', 'v3', 'Gris', 'gris', 4, true),
  ('v3-rojo', 'v3', 'Rojo', 'rojo', 5, true),
  ('q05-blanco', 'q05', 'Blanco', 'blanco', 1, true),
  ('q05-gris', 'q05', 'Gris', 'gris', 2, true),
  ('q05-plateado', 'q05', 'Plateado', 'plateado', 3, true),
  ('x7-plus-azul', 'x7-plus', 'Azul', 'azul', 1, true),
  ('x7-plus-blanco', 'x7-plus', 'Blanco', 'blanco', 2, true),
  ('x7-plus-gris', 'x7-plus', 'Gris', 'gris', 3, true),
  ('deepal-s05-e-celeste', 'deepal-s05-e', 'Celeste', 'celeste', 5, true),
  ('deepal-s07-reev-negro', 'deepal-s07-reev', 'Negro', 'negro', 1, true),
  ('deepal-s07-reev-blanco', 'deepal-s07-reev', 'Blanco', 'blanco', 2, true),
  ('deepal-s07-reev-gris', 'deepal-s07-reev', 'Gris', 'gris', 3, true),
  ('deepal-s07-reev-naranja', 'deepal-s07-reev', 'Naranja', 'naranja', 4, true),
  ('deepal-s07-reev-celeste', 'deepal-s07-reev', 'Celeste', 'celeste', 5, true),
  ('deepal-s07-reev-verde', 'deepal-s07-reev', 'Verde', 'verde', 6, true),
  ('honor-s-blanco', 'honor-s', 'Blanco', 'blanco', 1, true),
  ('startruck-blanco', 'startruck', 'Blanco', 'blanco', 1, true),
  ('m60-blanco', 'm60', 'Blanco', 'blanco', 1, true)
on conflict (car_model_id, slug) do update set
  name = excluded.name,
  sort_order = excluded.sort_order,
  active = excluded.active;

-- The same normalized source photo is intentionally reused by the two S05
-- variants and the two S07 variants, without duplicating it in Storage.
insert into public.car_model_color_assets
  (car_model_color_id, asset_kind, storage_path, file_name, mime_type, sort_order, active)
values
  ('v3-plateado', 'PHOTO', 'v3/colors/v3-plateado.jpg', 'Alsvin V3 - Plateado.jpg', 'image/jpeg', 0, true),
  ('v3-blanco', 'PHOTO', 'v3/colors/v3-blanco.jpg', 'Alsvin V3 - Blanco.jpg', 'image/jpeg', 0, true),
  ('v3-negro', 'PHOTO', 'v3/colors/v3-negro.jpg', 'Alsvin V3 - Negro.jpg', 'image/jpeg', 0, true),
  ('v3-gris', 'PHOTO', 'v3/colors/v3-gris.jpg', 'Alsvin V3 - Gris.jpg', 'image/jpeg', 0, true),
  ('v3-rojo', 'PHOTO', 'v3/colors/v3-rojo.jpg', 'Alsvin V3 - Rojo.jpg', 'image/jpeg', 0, true),
  ('alsvin-plus-blanco', 'PHOTO', 'alsvin-plus/colors/alsvin-plus-blanco.jpg', 'Alsvin Plus - Blanco.jpg', 'image/jpeg', 0, true),
  ('alsvin-plus-negro', 'PHOTO', 'alsvin-plus/colors/alsvin-plus-negro.jpg', 'Alsvin Plus - Negro.jpg', 'image/jpeg', 0, true),
  ('alsvin-plus-plateado', 'PHOTO', 'alsvin-plus/colors/alsvin-plus-plateado.jpg', 'Alsvin Plus - Plateado.jpg', 'image/jpeg', 0, true),
  ('alsvin-plus-plomo', 'PHOTO', 'alsvin-plus/colors/alsvin-plus-gris.jpg', 'Alsvin Plus - Gris.jpg', 'image/jpeg', 0, true),
  ('alsvin-plus-rojo', 'PHOTO', 'alsvin-plus/colors/alsvin-plus-rojo.jpg', 'Alsvin Plus - Rojo.jpg', 'image/jpeg', 0, true),
  ('cs15-2027-negro', 'PHOTO', 'cs15-2027/colors/cs15-negro.jpg', 'CS15 - Negro.jpg', 'image/jpeg', 0, true),
  ('cs15-2027-blanco', 'PHOTO', 'cs15-2027/colors/cs15-blanco.jpg', 'CS15 - Blanco.jpg', 'image/jpeg', 0, true),
  ('cs15-2027-plateado', 'PHOTO', 'cs15-2027/colors/cs15-plateado.jpg', 'CS15 - Plateado.jpg', 'image/jpeg', 0, true),
  ('q05-blanco', 'PHOTO', 'q05/colors/q05-blanco.jpg', 'Q05 - Blanco.jpg', 'image/jpeg', 0, true),
  ('q05-gris', 'PHOTO', 'q05/colors/q05-gris.jpg', 'Q05 - Gris.jpg', 'image/jpeg', 0, true),
  ('q05-plateado', 'PHOTO', 'q05/colors/q05-plateado.jpg', 'Q05 - Plateado.jpg', 'image/jpeg', 0, true),
  ('cs55-rev-2027-blanco', 'PHOTO', 'cs55-rev-2027/colors/cs55-rev-2027-blanco.jpg', 'CS55 Plus R-EV - Blanco.jpg', 'image/jpeg', 0, true),
  ('cs55-rev-2027-negro', 'PHOTO', 'cs55-rev-2027/colors/cs55-rev-2027-negro.jpg', 'CS55 Plus R-EV - Negro.jpg', 'image/jpeg', 0, true),
  ('cs55-rev-2027-plateado', 'PHOTO', 'cs55-rev-2027/colors/cs55-rev-2027-plateado.jpg', 'CS55 Plus R-EV - Plateado.jpg', 'image/jpeg', 0, true),
  ('cs55-rev-2027-plomo', 'PHOTO', 'cs55-rev-2027/colors/cs55-rev-2027-gris.jpg', 'CS55 Plus R-EV - Gris.jpg', 'image/jpeg', 0, true),
  ('cs55-rev-2027-rojo', 'PHOTO', 'cs55-rev-2027/colors/cs55-rev-2027-rojo.jpg', 'CS55 Plus R-EV - Rojo.jpg', 'image/jpeg', 0, true),
  ('x7-plus-azul', 'PHOTO', 'x7-plus/colors/x7-plus-azul.jpg', 'X7 Plus - Azul.jpg', 'image/jpeg', 0, true),
  ('x7-plus-blanco', 'PHOTO', 'x7-plus/colors/x7-plus-blanco.jpg', 'X7 Plus - Blanco.jpg', 'image/jpeg', 0, true),
  ('x7-plus-gris', 'PHOTO', 'x7-plus/colors/x7-plus-gris.jpg', 'X7 Plus - Gris.jpg', 'image/jpeg', 0, true),
  ('cs75-negro', 'PHOTO', 'cs75/colors/cs75-negro.jpg', 'CS75 Plus - Negro.jpg', 'image/jpeg', 0, true),
  ('cs75-blanco', 'PHOTO', 'cs75/colors/cs75-blanco.jpg', 'CS75 Plus - Blanco.jpg', 'image/jpeg', 0, true),
  ('cs75-plomo', 'PHOTO', 'cs75/colors/cs75-gris.jpg', 'CS75 Plus - Gris.jpg', 'image/jpeg', 0, true),
  ('cs75-plata', 'PHOTO', 'cs75/colors/cs75-plata.jpg', 'CS75 Plus - Plata.jpg', 'image/jpeg', 0, true),
  ('deepal-s05-e-negro', 'PHOTO', 'deepal-s05/colors/deepal-s05-negro.jpg', 'Deepal S05 - Negro.jpg', 'image/jpeg', 0, true),
  ('deepal-s05-e-blanco', 'PHOTO', 'deepal-s05/colors/deepal-s05-blanco.jpg', 'Deepal S05 - Blanco.jpg', 'image/jpeg', 0, true),
  ('deepal-s05-e-plomo', 'PHOTO', 'deepal-s05/colors/deepal-s05-gris.jpg', 'Deepal S05 - Gris.jpg', 'image/jpeg', 0, true),
  ('deepal-s05-e-plateado-champagne', 'PHOTO', 'deepal-s05/colors/deepal-s05-plateado.jpg', 'Deepal S05 - Plateado.jpg', 'image/jpeg', 0, true),
  ('deepal-s05-e-celeste', 'PHOTO', 'deepal-s05/colors/deepal-s05-celeste.jpg', 'Deepal S05 - Celeste.jpg', 'image/jpeg', 0, true),
  ('deepal-s05-max-hibrido-negro', 'PHOTO', 'deepal-s05/colors/deepal-s05-negro.jpg', 'Deepal S05 Max Híbrido - Negro.jpg', 'image/jpeg', 0, true),
  ('deepal-s05-max-hibrido-blanco', 'PHOTO', 'deepal-s05/colors/deepal-s05-blanco.jpg', 'Deepal S05 Max Híbrido - Blanco.jpg', 'image/jpeg', 0, true),
  ('deepal-s05-max-hibrido-plomo', 'PHOTO', 'deepal-s05/colors/deepal-s05-gris.jpg', 'Deepal S05 Max Híbrido - Gris.jpg', 'image/jpeg', 0, true),
  ('deepal-s05-max-hibrido-plateado-champagne', 'PHOTO', 'deepal-s05/colors/deepal-s05-plateado.jpg', 'Deepal S05 Max Híbrido - Plateado.jpg', 'image/jpeg', 0, true),
  ('deepal-s05-max-hibrido-celeste', 'PHOTO', 'deepal-s05/colors/deepal-s05-celeste.jpg', 'Deepal S05 Max Híbrido - Celeste.jpg', 'image/jpeg', 0, true),
  ('deepal-s07-e-negro', 'PHOTO', 'deepal-s07/colors/deepal-s07-negro.jpg', 'Deepal S07 - Negro.jpg', 'image/jpeg', 0, true),
  ('deepal-s07-e-blanco', 'PHOTO', 'deepal-s07/colors/deepal-s07-blanco.jpg', 'Deepal S07 - Blanco.jpg', 'image/jpeg', 0, true),
  ('deepal-s07-e-plomo', 'PHOTO', 'deepal-s07/colors/deepal-s07-gris.jpg', 'Deepal S07 - Gris.jpg', 'image/jpeg', 0, true),
  ('deepal-s07-e-naranja', 'PHOTO', 'deepal-s07/colors/deepal-s07-naranja.jpg', 'Deepal S07 - Naranja.jpg', 'image/jpeg', 0, true),
  ('deepal-s07-e-celeste', 'PHOTO', 'deepal-s07/colors/deepal-s07-celeste.jpg', 'Deepal S07 - Celeste.jpg', 'image/jpeg', 0, true),
  ('deepal-s07-e-verde', 'PHOTO', 'deepal-s07/colors/deepal-s07-verde.jpg', 'Deepal S07 - Verde.jpg', 'image/jpeg', 0, true),
  ('deepal-s07-reev-negro', 'PHOTO', 'deepal-s07/colors/deepal-s07-negro.jpg', 'Deepal S07 REEV - Negro.jpg', 'image/jpeg', 0, true),
  ('deepal-s07-reev-blanco', 'PHOTO', 'deepal-s07/colors/deepal-s07-blanco.jpg', 'Deepal S07 REEV - Blanco.jpg', 'image/jpeg', 0, true),
  ('deepal-s07-reev-gris', 'PHOTO', 'deepal-s07/colors/deepal-s07-gris.jpg', 'Deepal S07 REEV - Gris.jpg', 'image/jpeg', 0, true),
  ('deepal-s07-reev-naranja', 'PHOTO', 'deepal-s07/colors/deepal-s07-naranja.jpg', 'Deepal S07 REEV - Naranja.jpg', 'image/jpeg', 0, true),
  ('deepal-s07-reev-celeste', 'PHOTO', 'deepal-s07/colors/deepal-s07-celeste.jpg', 'Deepal S07 REEV - Celeste.jpg', 'image/jpeg', 0, true),
  ('deepal-s07-reev-verde', 'PHOTO', 'deepal-s07/colors/deepal-s07-verde.jpg', 'Deepal S07 REEV - Verde.jpg', 'image/jpeg', 0, true),
  ('deepal-g318-r-ev-negro', 'PHOTO', 'deepal-g318-r-ev/colors/g318-negro.jpg', 'Deepal G318 R-EV - Negro.jpg', 'image/jpeg', 0, true),
  ('deepal-g318-r-ev-blanco', 'PHOTO', 'deepal-g318-r-ev/colors/g318-blanco.jpg', 'Deepal G318 R-EV - Blanco.jpg', 'image/jpeg', 0, true),
  ('deepal-g318-r-ev-plateado-mate', 'PHOTO', 'deepal-g318-r-ev/colors/g318-plateado-mate.jpg', 'Deepal G318 R-EV - Plateado mate.jpg', 'image/jpeg', 0, true),
  ('deepal-g318-r-ev-plata-silver', 'PHOTO', 'deepal-g318-r-ev/colors/g318-plata-silver.jpg', 'Deepal G318 R-EV - Plata Silver.jpg', 'image/jpeg', 0, true),
  ('hunter-turbo-rojo', 'PHOTO', 'hunter-turbo-diesel/colors/hunter-turbo-diesel-rojo.jpg', 'HUNTER Turbo Diésel - Rojo.jpg', 'image/jpeg', 0, true),
  ('hunter-turbo-blanco', 'PHOTO', 'hunter-turbo-diesel/colors/hunter-turbo-diesel-blanco.jpg', 'HUNTER Turbo Diésel - Blanco.jpg', 'image/jpeg', 0, true),
  ('hunter-turbo-azul', 'PHOTO', 'hunter-turbo-diesel/colors/hunter-turbo-diesel-azul.jpg', 'HUNTER Turbo Diésel - Azul.jpg', 'image/jpeg', 0, true),
  ('hunter-turbo-plomo-plateado', 'PHOTO', 'hunter-turbo-diesel/colors/hunter-turbo-diesel-gris-plateado.jpg', 'HUNTER Turbo Diésel - Gris plateado.jpg', 'image/jpeg', 0, true),
  ('hunter-e-rojo', 'PHOTO', 'hunter-e/colors/hunter-e-rojo.jpg', 'HUNTER E - Rojo.jpg', 'image/jpeg', 0, true),
  ('hunter-e-blanco', 'PHOTO', 'hunter-e/colors/hunter-e-blanco.jpg', 'HUNTER E - Blanco.jpg', 'image/jpeg', 0, true),
  ('hunter-e-negro', 'PHOTO', 'hunter-e/colors/hunter-e-negro.jpg', 'HUNTER E - Negro.jpg', 'image/jpeg', 0, true),
  ('hunter-e-azul', 'PHOTO', 'hunter-e/colors/hunter-e-azul.jpg', 'HUNTER E - Azul.jpg', 'image/jpeg', 0, true),
  ('hunter-e-verde', 'PHOTO', 'hunter-e/colors/hunter-e-verde.jpg', 'HUNTER E - Verde.jpg', 'image/jpeg', 0, true),
  ('hunter-e-naranja', 'PHOTO', 'hunter-e/colors/hunter-e-naranja.jpg', 'HUNTER E - Naranja.jpg', 'image/jpeg', 0, true),
  ('hunter-e-plata-mate', 'PHOTO', 'hunter-e/colors/hunter-e-plata-mate.jpg', 'HUNTER E - Plata mate.jpg', 'image/jpeg', 0, true),
  ('hunter-e-plomo', 'PHOTO', 'hunter-e/colors/hunter-e-gris.jpg', 'HUNTER E - Gris.jpg', 'image/jpeg', 0, true),
  ('honor-s-blanco', 'PHOTO', 'honor-s/colors/honor-s-blanco.jpg', 'Honor S Cargo - Blanco.jpg', 'image/jpeg', 0, true),
  ('startruck-blanco', 'PHOTO', 'star-truck/colors/star-truck-blanco.jpg', 'Star Truck - Blanco.jpg', 'image/jpeg', 0, true),
  ('m60-blanco', 'PHOTO', 'm60-pasajeros/colors/m60-blanco.jpg', 'M60 Pasajeros - Blanco.jpg', 'image/jpeg', 0, true)
on conflict (car_model_color_id, asset_kind) do update set
  storage_path = excluded.storage_path,
  file_name = excluded.file_name,
  mime_type = excluded.mime_type,
  sort_order = excluded.sort_order,
  active = excluded.active;
