-- Vehicle catalog refresh and stable assets for First Contact.
-- Files live in the public `vehiculos` Storage bucket. This migration stores
-- paths only so a clean installation is not tied to one Supabase project URL.

insert into public.car_models (id, name, sort_order, active, is_other)
values
  ('v3', 'V3', 1, true, false),
  ('cs55-rev-2027', 'CS55 Plus R-EV', 2, true, false),
  ('deepal-s07-max', 'Deepal S07 Max', 3, true, false),
  ('deepal-s05-e', 'Deepal S05 E', 4, true, false),
  ('deepal-s05-max-hibrido', 'Deepal S05 Max Híbrido', 5, true, false),
  ('deepal-g318-r-ev', 'Deepal G318 R-EV', 6, true, false),
  ('cs75', 'CS75 Plus', 7, true, false),
  ('x7-plus', 'X7 Plus', 8, true, false),
  ('hunter-e', 'HUNTER E', 9, true, false),
  ('hunter-turbo', 'HUNTER Turbo Diésel', 10, true, false),
  ('m60', 'M60 Pasajeros', 11, true, false),
  ('honor-s', 'Honor S Cargo', 12, true, false),
  ('startruck', 'Star Truck', 13, true, false),
  ('other', 'Otro modelo', 99, true, true)
on conflict (id) do update set
  name = excluded.name,
  sort_order = excluded.sort_order,
  active = excluded.active,
  is_other = excluded.is_other;

update public.car_models
set active = false
where id in ('cs15-2027')
  and id not in ('v3', 'cs55-rev-2027', 'cs75', 'hunter-e', 'hunter-turbo', 'm60', 'honor-s', 'startruck', 'other');

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

insert into public.car_model_assets (car_model_id, asset_kind, storage_path, file_name, mime_type)
values
  ('v3', 'PHOTO', 'v3/changan-v3-vehiculo.jpg', 'Changan V3 - Vehículo.jpg', 'image/jpeg'),
  ('v3', 'TECHNICAL_SHEET', 'v3/changan-v3-ficha-tecnica.pdf', 'Changan V3 - Ficha técnica.pdf', 'application/pdf'),
  ('cs55-rev-2027', 'PHOTO', 'cs55-plus-r-ev/changan-cs55-plus-r-ev-vehiculo.jpg', 'Changan CS55 Plus R-EV - Vehículo.jpg', 'image/jpeg'),
  ('cs55-rev-2027', 'TECHNICAL_SHEET', 'cs55-plus-r-ev/changan-cs55-plus-r-ev-ficha-tecnica.pdf', 'Changan CS55 Plus R-EV - Ficha técnica.pdf', 'application/pdf'),
  ('deepal-s07-max', 'PHOTO', 'deepal-s07-max/deepal-s07-max-vehiculo.jpg', 'Deepal S07 Max - Vehículo.jpg', 'image/jpeg'),
  ('deepal-s07-max', 'TECHNICAL_SHEET', 'deepal-s07-max/deepal-s07-max-ficha-tecnica.pdf', 'Deepal S07 Max - Ficha técnica.pdf', 'application/pdf'),
  ('deepal-s05-e', 'PHOTO', 'deepal-s05-e/deepal-s05-e-vehiculo.jpg', 'Deepal S05 E - Vehículo.jpg', 'image/jpeg'),
  ('deepal-s05-e', 'TECHNICAL_SHEET', 'deepal-s05-e/deepal-s05-e-ficha-tecnica.pdf', 'Deepal S05 E - Ficha técnica.pdf', 'application/pdf'),
  ('deepal-s05-max-hibrido', 'PHOTO', 'deepal-s05-max-hibrido/deepal-s05-max-hibrido-vehiculo.jpg', 'Deepal S05 Max Híbrido - Vehículo.jpg', 'image/jpeg'),
  ('deepal-s05-max-hibrido', 'TECHNICAL_SHEET', 'deepal-s05-max-hibrido/deepal-s05-max-hibrido-ficha-tecnica.pdf', 'Deepal S05 Max Híbrido - Ficha técnica.pdf', 'application/pdf'),
  ('deepal-g318-r-ev', 'PHOTO', 'deepal-g318-r-ev/deepal-g318-r-ev-vehiculo.jpg', 'Deepal G318 R-EV - Vehículo.jpg', 'image/jpeg'),
  ('deepal-g318-r-ev', 'TECHNICAL_SHEET', 'deepal-g318-r-ev/deepal-g318-r-ev-ficha-tecnica.pdf', 'Deepal G318 R-EV - Ficha técnica.pdf', 'application/pdf'),
  ('cs75', 'PHOTO', 'cs75-plus/changan-cs75-plus-vehiculo.jpg', 'Changan CS75 Plus - Vehículo.jpg', 'image/jpeg'),
  ('cs75', 'TECHNICAL_SHEET', 'cs75-plus/changan-cs75-plus-ficha-tecnica.pdf', 'Changan CS75 Plus - Ficha técnica.pdf', 'application/pdf'),
  ('x7-plus', 'PHOTO', 'x7-plus/changan-x7-plus-vehiculo.jpg', 'Changan X7 Plus - Vehículo.jpg', 'image/jpeg'),
  ('x7-plus', 'TECHNICAL_SHEET', 'x7-plus/changan-x7-plus-ficha-tecnica.pdf', 'Changan X7 Plus - Ficha técnica.pdf', 'application/pdf'),
  ('hunter-e', 'PHOTO', 'hunter-e/changan-hunter-e-vehiculo.jpg', 'Changan HUNTER E - Vehículo.jpg', 'image/jpeg'),
  ('hunter-e', 'TECHNICAL_SHEET', 'hunter-e/changan-hunter-e-ficha-tecnica.pdf', 'Changan HUNTER E - Ficha técnica.pdf', 'application/pdf'),
  ('hunter-turbo', 'PHOTO', 'hunter-turbo-diesel/changan-hunter-turbo-diesel-vehiculo.jpg', 'Changan HUNTER Turbo Diésel - Vehículo.jpg', 'image/jpeg'),
  ('hunter-turbo', 'TECHNICAL_SHEET', 'hunter-turbo-diesel/changan-hunter-turbo-diesel-ficha-tecnica.pdf', 'Changan HUNTER Turbo Diésel - Ficha técnica.pdf', 'application/pdf'),
  ('m60', 'PHOTO', 'm60-pasajeros/changan-m60-pasajeros-vehiculo.jpg', 'Changan M60 Pasajeros - Vehículo.jpg', 'image/jpeg'),
  ('m60', 'TECHNICAL_SHEET', 'm60-pasajeros/changan-m60-pasajeros-ficha-tecnica.pdf', 'Changan M60 Pasajeros - Ficha técnica.pdf', 'application/pdf'),
  ('honor-s', 'PHOTO', 'honor-s-cargo/changan-honor-s-cargo-vehiculo.jpg', 'Changan Honor S Cargo - Vehículo.jpg', 'image/jpeg'),
  ('honor-s', 'TECHNICAL_SHEET', 'honor-s-cargo/changan-honor-s-cargo-ficha-tecnica.pdf', 'Changan Honor S Cargo - Ficha técnica.pdf', 'application/pdf'),
  ('startruck', 'PHOTO', 'star-truck/changan-star-truck-vehiculo.jpg', 'Changan Star Truck - Vehículo.jpg', 'image/jpeg'),
  ('startruck', 'TECHNICAL_SHEET', 'star-truck/changan-star-truck-ficha-tecnica.pdf', 'Changan Star Truck - Ficha técnica.pdf', 'application/pdf')
on conflict (car_model_id, asset_kind) do update set
  storage_path = excluded.storage_path,
  file_name = excluded.file_name,
  mime_type = excluded.mime_type,
  active = true,
  sort_order = 0;

comment on table public.car_model_assets is 'Stable public vehicle assets used by LeadFlow First Contact; files are stored in the vehiculos bucket.';
