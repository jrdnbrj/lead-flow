insert into public.car_model_images (car_model_id, image_url, alt_text, sort_order)
select source.car_model_id, source.image_url, source.alt_text, 0
from (values
  ('cs75', 'https://changanecuador.com/wp-content/uploads/CS752c.png', 'Changan CS75'),
  ('honor-s', 'https://changanecuador.com/wp-content/uploads/HONOR-S-img.jpg', 'Changan Honor S'),
  ('startruck', 'https://changanecuador.com/wp-content/uploads/Star-Truck-img.jpg', 'Changan Startruck'),
  ('other', 'https://changanecuador.com/wp-content/uploads/Changan-v3-izquierda3_4-Blanco.png', 'Imagen referencial Changan')
) as source(car_model_id, image_url, alt_text)
where not exists (
  select 1 from public.car_model_images existing
  where existing.car_model_id = source.car_model_id
);

comment on table public.car_model_images is
  'One or more public image references per Changan model; every selectable option has at least one fallback image.';
