import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const shell = read("components/layout/app-shell.tsx");
const page = read("app/catalogo/page.tsx");
const repo = read("lib/catalog/repository.ts");
const catalog = read("components/catalog/car-catalog.tsx");
const migration = read("supabase/migrations/050_car_model_colors.sql");
const orderCorrection = read("supabase/migrations/051_catalog_color_order_correction.sql");
const terminologyMigration = read("supabase/migrations/055_catalog_rename_plomo_to_gris.sql");
const colorAssetMigration = read("supabase/migrations/056_catalog_color_photos.sql");

for (const required of ["/catalogo", "/push-diagnostics", "logoutAction", "aria-haspopup=\"menu\"", "Catálogo de autos", "Push Diagnostics", "Cerrar sesión"]) {
  if (!shell.includes(required)) throw new Error(`user menu missing: ${required}`);
}
if (shell.includes('href="/whatsapp" aria-label="Configurar vendedor y WhatsApp"')) throw new Error("user icon must not navigate directly to WhatsApp");
for (const required of ["requireAdvisorOrRedirect(\"/catalogo\")", "getCatalogModels", "Catálogo de autos"]) {
  if (!page.includes(required)) throw new Error(`catalog page missing: ${required}`);
}
for (const required of ["from(\"car_models\")", "order(\"sort_order\"", "car_model_assets", "car_model_colors", "car_model_color_assets", "storage/v1/object/public/vehiculos"]) {
  if (!repo.includes(required)) throw new Error(`catalog repository missing: ${required}`);
}
for (const required of ["role=\"dialog\"", "onTouchStart", "onTouchEnd", "no disponible todavía", "Foto anterior", "Foto siguiente", "iframe", "Abrir ficha completa", "Fotos por color"]) {
  if (!catalog.includes(required)) throw new Error(`catalog UI missing: ${required}`);
}
if (catalog.includes(">Colores disponibles</div>")) throw new Error("catalog must not show the redundant colors heading");
if (/<button[^>]*>Foto<\/button>/.test(catalog)) throw new Error("catalog must open photos by clicking the image, without a Foto button");
for (const required of ["create table if not exists public.car_model_colors", "references public.car_models(id)", "enable row level security", "grant select on public.car_model_colors to authenticated", "cs15-2027", "deepal-s07-e"]) {
  if (!migration.includes(required)) throw new Error(`color migration missing: ${required}`);
}
for (const required of ["car_model_id = 'cs75'", "('plata', 1)", "('negro', 2)", "('blanco', 3)", "('plomo', 4)"]) {
  if (!orderCorrection.includes(required)) throw new Error(`catalog color order correction missing: ${required}`);
}
for (const required of ["'Gris'", "'gris'", "'Gris plateado'", "'gris-plateado'"]) {
  if (!terminologyMigration.includes(required)) throw new Error(`catalog color terminology migration missing: ${required}`);
}
for (const required of ["create table if not exists public.car_model_color_assets", "car_model_color_id", "deepal-s05/colors/deepal-s05-blanco.jpg", "deepal-s07/colors/deepal-s07-blanco.jpg", "honor-s-blanco"]) {
  if (!colorAssetMigration.includes(required)) throw new Error(`catalog color asset migration missing: ${required}`);
}
const modelIds = [...migration.matchAll(/\('(?:[^']+)', '([^']+)', '[^']+', '[^']+'/g)].map((match) => match[1]);
if (new Set(modelIds).size < 10) throw new Error("color migration has too few mapped catalog models");

console.log("Catalog contract checks: PASS");
