---
id: SPEC-first-contact-color-selection
companions:
  - brownfield.md
  - ../../project-context.md
  - ../../planning-artifacts/architecture/architecture-lead-flow-2026-08-06/ARCHITECTURE-SPINE.md
  - ../../implementation-artifacts/spec-first-contact-multi-vehicle-resources.md
  - ../../planning-artifacts/leadflow-current-state-roadmap-2026-09-02.md
sources:
  - ../../../lib/domain/lead.ts
  - ../../../lib/first-contact/command.ts
  - ../../../lib/first-contact/resource-plan.ts
  - ../../../lib/first-contact/order.ts
  - ../../../lib/leads/actions.ts
  - ../../../lib/leads/repository.ts
  - ../../../components/leads/first-contact-summary.tsx
  - ../../../components/dashboard/dashboard-client.tsx
  - ../../../supabase/migrations/007_changan_catalog_and_multi_car_leads.sql
  - ../../../supabase/migrations/019_epic3_first_contact_model.sql
  - ../../../supabase/migrations/049_first_contact_multi_vehicle_resources.sql
  - ../../../supabase/migrations/050_car_model_colors.sql
  - ../../../supabase/migrations/056_catalog_color_photos.sql
  - ../../../supabase/migrations/059_e3_resource_recovery.sql
---

# Selección opcional de color y foto por vehículo para First Contact

## Why

El asesor ya puede elegir hasta tres vehículos para los recursos de First Contact y el catálogo ya conoce colores y fotos por color, pero el envío todavía usa únicamente la resolución predeterminada. Esta capacidad cierra esa brecha sin volver obligatoria la selección ni poner en riesgo el envío manual, la trazabilidad E3 o las operaciones históricas.

## Capabilities

- **CAP-1**
  - **intent:** El asesor puede seleccionar `Predeterminada` o un color disponible para cada una de las primeras tres posiciones de vehículos antes de iniciar First Contact y ve la miniatura que se intentará enviar.
  - **success:** En una prueba de 1, 2 y 3 vehículos, cada posición muestra sus propias opciones; seleccionar un color cambia su miniatura inmediatamente y volver a `Predeterminada` restaura el comportamiento actual.

- **CAP-2**
  - **intent:** LeadFlow puede resolver una foto específica de modelo y color sin cambiar la resolución de la ficha técnica.
  - **success:** Si existe el asset PHOTO activo del color seleccionado se usa ese asset; si no existe, se usa la resolución predeterminada vigente, luego el fallback legacy, sin bloquear First Contact.

- **CAP-3**
  - **intent:** Al crear una operación nueva de First Contact, LeadFlow conserva el recurso exacto resuelto para que los reintentos no cambien de foto por modificaciones posteriores del catálogo o del lead.
  - **success:** Cambiar color, desactivar/reemplazar un asset o cambiar el orden después de crear la operación no cambia el locator, modelo, color ni asset usados por el reintento de esa operación.

- **CAP-4**
  - **intent:** La selección por color extiende el flujo actual sin alterar sus garantías de máximo tres vehículos, orden, envío manual, send-once, idempotencia, efectos externos, estados y compatibilidad histórica.
  - **success:** Los contratos E3 existentes y los nuevos escenarios de selección, fallback, snapshot, retry independiente y operación histórica pasan; guardar un lead nunca produce IO de WhatsApp.

## Constraints

- La autoridad de interés de vehículos sigue siendo `leads.car_models` (`text[]`) en su orden actual; los recursos siguen limitados a `lead.carModels.slice(0, 3)`.
- La selección no aparece en creación/edición general del lead: vive sólo en el contexto de First Contact y se guarda al iniciar la operación.
- `car_model_colors` y `car_model_color_assets` son la fuente estructurada; no se crean colores enum, modelos nuevos ni otra tabla de assets.
- Cada selección debe pertenecer al modelo de su posición y a un lead del asesor autenticado; el navegador no puede enviar URLs, destinatarios ni IDs de proveedor.
- La ficha técnica permanece model-level y no depende del color.
- Un item E3 nuevo debe persistir un snapshot de resolución antes de cualquier IO. Assets referenciados deben conservar locator/bytes mediante rutas y filas inmutables; no se permite reemplazo silencioso in-place.
- No se modifican First Contact histórico, Push, reminder WhatsApp, Evolution, inbound, catálogo administrativo, compra, cotización, ni diseño general.

## Non-goals

- Selección de color durante creación o edición del lead.
- Foto por color para operaciones First Contact históricas o backfill de efectos.
- Administración de modelos, colores o assets desde la UI.
- Cambio de ficha técnica por color, selección de inventario/stock, cotización, pagos, Push, recordatorios WhatsApp o cambios de Evolution.

## Success signal

En el dashboard y en el flujo de lead guardado, el asesor abre el selector ligero de First Contact, elige independientemente hasta tres colores, confirma y recibe el mensaje seguido por los recursos en el orden actual. La operación queda auditable y un retry posterior conserva exactamente los assets que fueron resueltos al iniciarla.

## Assumptions

- `Predeterminada` conserva exactamente el resolver actual: actualmente prioriza la PHOTO blanca activa, después la PHOTO model-level y finalmente el fallback legacy; la terminología de producto “foto genérica” no autoriza cambiar esa prioridad.
- El selector sólo es editable antes de que exista una operación First Contact; después, los estados y snapshots persistidos son la autoridad.
- No hay una suite general de tests; la cobertura se agregará a los contratos E3 y a validaciones puras existentes.

## Open Questions

- Ninguna decisión de producto bloqueante. La única diferencia semántica detectada quedó resuelta conservando el comportamiento actual de `Predeterminada`.
