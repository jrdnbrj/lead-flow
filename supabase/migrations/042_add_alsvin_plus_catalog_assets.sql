-- Add the Alsvin Plus catalog entry and its stable First Contact assets.
-- Files are uploaded separately to the public `vehiculos` Storage bucket.

insert into public.car_models (id, name, sort_order, active, is_other)
values ('alsvin-plus', 'Alsvin Plus', 14, true, false)
on conflict (id) do update set
  name = excluded.name,
  sort_order = excluded.sort_order,
  active = excluded.active,
  is_other = excluded.is_other;

insert into public.car_model_assets (car_model_id, asset_kind, storage_path, file_name, mime_type, sort_order, active)
values
  ('alsvin-plus', 'PHOTO', 'alsvin-plus/changan-alsvin-plus-vehiculo.jpg', 'Changan Alsvin Plus - Vehículo.jpg', 'image/jpeg', 0, true),
  ('alsvin-plus', 'TECHNICAL_SHEET', 'alsvin-plus/changan-alsvin-plus-ficha-tecnica.pdf', 'Changan Alsvin Plus - Ficha técnica.pdf', 'application/pdf', 0, true)
on conflict (car_model_id, asset_kind) do update set
  storage_path = excluded.storage_path,
  file_name = excluded.file_name,
  mime_type = excluded.mime_type,
  sort_order = excluded.sort_order,
  active = excluded.active;
