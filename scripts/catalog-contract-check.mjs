import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const shell = read("components/layout/app-shell.tsx");
const page = read("app/catalogo/page.tsx");
const repo = read("lib/catalog/repository.ts");
const catalog = read("components/catalog/car-catalog.tsx");
const pdfViewer = read("components/catalog/pdf-viewer.tsx");
const migration = read("supabase/migrations/050_car_model_colors.sql");
const orderCorrection = read("supabase/migrations/051_catalog_color_order_correction.sql");
const terminologyMigration = read("supabase/migrations/055_catalog_rename_plomo_to_gris.sql");
const colorAssetMigration = read("supabase/migrations/056_catalog_color_photos.sql");
const metricsMigration = read("supabase/migrations/057_catalog_lead_registration_metrics.sql");
const photoRoute = read("app/api/catalog/photo/[colorId]/route.ts");
const catalogActions = read("lib/catalog/actions.ts");

for (const required of ["/catalogo", "/push-diagnostics", "logoutAction", "aria-haspopup=\"menu\"", "Catálogo de autos", "Push Diagnostics", "Cerrar sesión"]) {
  if (!shell.includes(required)) throw new Error(`user menu missing: ${required}`);
}
if (shell.includes('href="/whatsapp" aria-label="Configurar vendedor y WhatsApp"')) throw new Error("user icon must not navigate directly to WhatsApp");
for (const required of ["requireAdvisorOrRedirect(\"/catalogo\")", "getCatalogModels", "Catálogo de autos"]) {
  if (!page.includes(required)) throw new Error(`catalog page missing: ${required}`);
}
for (const required of ["from(\"car_models\")", "order(\"sort_order\"", "lead_registration_count", "car_model_assets", "car_model_colors", "car_model_color_assets", "is_default", "defaultColorId", "storage/v1/object/public/vehiculos"]) {
  if (!repo.includes(required)) throw new Error(`catalog repository missing: ${required}`);
}
for (const required of ["role=\"dialog\"", "onTouchStart", "onTouchEnd", "no disponible todavía", "Foto anterior", "Foto siguiente", "Abrir ficha completa", "Descargar foto", "Descargar ficha", "Fotos por color", "aria-pressed", "leadRegistrationCount", "history.pushState", "technicalSheetViewerUrl", "object-cover"]) {
  if (!catalog.includes(required)) throw new Error(`catalog UI missing: ${required}`);
}
for (const required of ["pdfjs-dist", "GlobalWorkerOptions.workerSrc", "Cargando ficha", "Array.from", "pageCount", "páginas"]) {
  if (!pdfViewer.includes(required)) throw new Error(`PDF viewer missing: ${required}`);
}
for (const required of ["requireAdvisor", "car_model_color_assets", "content-disposition", "attachment", "PHOTO_NOT_FOUND"]) {
  if (!photoRoute.includes(required)) throw new Error(`catalog photo route missing: ${required}`);
}
for (const required of ["requireAdvisor", "setCatalogModelDefaultColor", "set_car_model_default_color_v1"]) {
  if (!catalogActions.includes(required) && !repo.includes(required)) throw new Error(`catalog default color action missing: ${required}`);
}
if (catalog.includes(">Colores disponibles</div>")) throw new Error("catalog must not show the redundant colors heading");
if (/<button[^>]*>Foto<\/button>/.test(catalog)) throw new Error("catalog must open photos by clicking the image, without a Foto button");
if (page.includes("Consulta rápida para el asesor")) throw new Error("catalog must not show the redundant quick-consult eyebrow");
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
for (const required of ["lead_registration_count", "track_catalog_lead_registration", "including soft-deleted leads", "after insert or update of car_model, car_models"]) {
  if (!metricsMigration.includes(required)) throw new Error(`catalog metrics migration missing: ${required}`);
}
const modelIds = [...migration.matchAll(/\('(?:[^']+)', '([^']+)', '[^']+', '[^']+'/g)].map((match) => match[1]);
if (new Set(modelIds).size < 10) throw new Error("color migration has too few mapped catalog models");

console.log("Catalog contract checks: PASS");
