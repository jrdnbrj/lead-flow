-- Forward-only catalog terminology update. Keep color row IDs stable so any
-- future catalog references remain intact while the visible commercial names
-- use "Gris" instead of "Plomo".
update public.car_model_colors
set name = case when slug = 'plomo-plateado' then 'Gris plateado' else 'Gris' end,
    slug = case when slug = 'plomo-plateado' then 'gris-plateado' else 'gris' end
where slug in ('plomo', 'plomo-plateado');
