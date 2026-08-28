-- Preserve the commercial order supplied for the CS75 catalog colors.
update public.car_model_colors as colors
set sort_order = ordered.sort_order
from (values
  ('plata', 1),
  ('negro', 2),
  ('blanco', 3),
  ('plomo', 4)
) as ordered(slug, sort_order)
where colors.car_model_id = 'cs75'
  and colors.slug = ordered.slug;
