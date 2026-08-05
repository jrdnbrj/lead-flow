alter table public.leads
  add column if not exists car_models text[] not null default '{}';

alter table public.leads
  drop constraint if exists leads_car_model_check;

alter table public.leads
  add constraint leads_car_model_check
  check (char_length(trim(car_model)) between 2 and 500);

update public.leads
set car_models = regexp_split_to_array(trim(car_model), '\\s*,\\s*')
where cardinality(car_models) = 0
  and char_length(trim(car_model)) > 0;

do $$
begin
  alter table public.leads
    add constraint leads_car_models_count_check
    check (cardinality(car_models) between 1 and 10);
exception when duplicate_object then null;
end $$;

create index if not exists leads_car_models_gin_idx on public.leads using gin (car_models);

create table if not exists public.car_models (
  id text primary key,
  name text not null unique,
  sort_order integer not null,
  active boolean not null default true,
  is_other boolean not null default false,
  created_at timestamptz not null default now()
);

insert into public.car_models (id, name, sort_order, active, is_other)
values
  ('v3', 'V3', 1, true, false),
  ('cs15-2027', 'CS15 - Modelo 2027', 2, true, false),
  ('cs75', 'CS75', 3, true, false),
  ('cs55-rev-2027', 'CS55 R-EV - Modelo 2027', 4, true, false),
  ('hunter-e', 'HUNTER E', 5, true, false),
  ('hunter-turbo', 'HUNTER TURBO', 6, true, false),
  ('m60', 'M60', 7, true, false),
  ('honor-s', 'Honor S', 8, true, false),
  ('startruck', 'Startruck', 9, true, false),
  ('other', 'Otro modelo', 10, true, true)
on conflict (id) do update set
  name = excluded.name,
  sort_order = excluded.sort_order,
  active = excluded.active,
  is_other = excluded.is_other;

create table if not exists public.car_model_images (
  id uuid primary key default gen_random_uuid(),
  car_model_id text not null references public.car_models(id) on delete cascade,
  image_url text not null,
  storage_path text,
  alt_text text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists car_model_images_model_sort_idx
on public.car_model_images (car_model_id, sort_order);

insert into public.car_model_images (car_model_id, image_url, alt_text, sort_order)
select source.car_model_id, source.image_url, source.alt_text, 0
from (values
  ('v3', 'https://changanecuador.com/wp-content/uploads/Changan-v3-izquierda3_4-Blanco.png', 'Changan V3'),
  ('cs15-2027', 'https://changanecuador.com/wp-content/uploads/cs15Blanco_01.png', 'Changan CS15'),
  ('cs55-rev-2027', 'https://changanecuador.com/wp-content/uploads/cs55rev.png', 'Changan CS55 R-EV'),
  ('hunter-e', 'https://changanecuador.com/wp-content/uploads/HUNTER_E-1-1.png', 'Changan HUNTER E'),
  ('hunter-turbo', 'https://changanecuador.com/wp-content/uploads/HUNTER-1.png', 'Changan HUNTER TURBO'),
  ('m60', 'https://changanecuador.com/wp-content/uploads/m60_l.png', 'Changan M60')
) as source(car_model_id, image_url, alt_text)
where not exists (
  select 1 from public.car_model_images existing
  where existing.car_model_id = source.car_model_id
    and existing.image_url = source.image_url
);

alter table public.car_models enable row level security;
alter table public.car_model_images enable row level security;

drop policy if exists "car_models_select_active" on public.car_models;
create policy "car_models_select_active"
on public.car_models for select to anon, authenticated
using (active = true);

drop policy if exists "car_model_images_select_active" on public.car_model_images;
create policy "car_model_images_select_active"
on public.car_model_images for select to anon, authenticated
using (exists (
  select 1 from public.car_models
  where car_models.id = car_model_images.car_model_id
    and car_models.active = true
));

do $$
begin
  alter publication supabase_realtime add table public.car_models;
exception when duplicate_object then null;
end $$;

comment on table public.car_models is 'Active Changan Ecuador vehicle catalog used by LeadFlow lead capture.';
comment on table public.car_model_images is 'One or more public image references per Changan model; the first image is used for automated outreach.';
