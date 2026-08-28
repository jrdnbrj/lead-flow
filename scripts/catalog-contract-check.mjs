import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const shell = read("components/layout/app-shell.tsx");
const page = read("app/catalogo/page.tsx");
const repo = read("lib/catalog/repository.ts");
const catalog = read("components/catalog/car-catalog.tsx");
const migration = read("supabase/migrations/050_car_model_colors.sql");
const orderCorrection = read("supabase/migrations/051_catalog_color_order_correction.sql");

for (const required of ["/catalogo", "/push-diagnostics", "logoutAction", "aria-haspopup=\"menu\"", "Catálogo de autos", "Push Diagnostics", "Cerrar sesión"]) {
  if (!shell.includes(required)) throw new Error(`user menu missing: ${required}`);
}
if (shell.includes('href="/whatsapp" aria-label="Configurar vendedor y WhatsApp"')) throw new Error("user icon must not navigate directly to WhatsApp");
for (const required of ["requireAdvisorOrRedirect(\"/catalogo\")", "getCatalogModels", "Catálogo de autos"]) {
  if (!page.includes(required)) throw new Error(`catalog page missing: ${required}`);
}
for (const required of ["from(\"car_models\")", "order(\"sort_order\"", "car_model_assets", "car_model_images", "car_model_colors", "storage/v1/object/public/vehiculos"]) {
  if (!repo.includes(required)) throw new Error(`catalog repository missing: ${required}`);
}
for (const required of ["Ver foto", "role=\"dialog\"", "iframe", "Abrir ficha completa", "Colores disponibles"]) {
  if (!catalog.includes(required)) throw new Error(`catalog UI missing: ${required}`);
}
for (const required of ["create table if not exists public.car_model_colors", "references public.car_models(id)", "enable row level security", "grant select on public.car_model_colors to authenticated", "cs15-2027", "deepal-s07-e"]) {
  if (!migration.includes(required)) throw new Error(`color migration missing: ${required}`);
}
for (const required of ["car_model_id = 'cs75'", "('plata', 1)", "('negro', 2)", "('blanco', 3)", "('plomo', 4)"]) {
  if (!orderCorrection.includes(required)) throw new Error(`catalog color order correction missing: ${required}`);
}
const modelIds = [...migration.matchAll(/\('(?:[^']+)', '([^']+)', '[^']+', '[^']+'/g)].map((match) => match[1]);
if (new Set(modelIds).size < 10) throw new Error("color migration has too few mapped catalog models");

console.log("Catalog contract checks: PASS");
