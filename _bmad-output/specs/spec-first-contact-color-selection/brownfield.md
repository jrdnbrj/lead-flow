# Brownfield: decisión de implementación

Este companion contiene el contrato técnico que no cabe en el kernel. Debe leerse junto con `SPEC.md`, el `project-context.md`, el architecture spine y la spec de recursos multi-vehículo.

## Evidencia actual y frontera exacta

- `leads.car_models` es `text[]`; el formulario usa el orden de inserción y no existe una fila persistente por vehículo seleccionado.
- `car_model_colors` ya relaciona `car_model_id` con `name`, `slug`, `sort_order` y `active`.
- `car_model_color_assets` ya relaciona un color con un `PHOTO`, `storage_path`, `file_name`, `sort_order` y `active`; `car_model_assets` conserva PHOTO/SHEET model-level y `car_model_images` es fallback legacy.
- `buildFirstContactRequest` genera el texto con todos los modelos, reduce recursos a los primeros tres, consulta `getCarModelContactAssetsForModels`, crea items `PHOTO:<posición>:<modelo>` y `TECHNICAL_SHEET:<posición>:<modelo>`, y ejecuta recursos en serie después de MESSAGE.
- `FirstContactSummary` ya es la superficie de resultado/retry. En `/nuevo` aparece después de guardar; en dashboard el botón existente `Enviar` llama directamente a `sendLeadWhatsappAction` y debe pasar por la misma preselección sólo cuando todavía no existe operación.
- E3 identifica una operación por `(lead_id, operation_type)`, un item por `(operation_id, item_key)` y un efecto por `(lead_id, effect_kind, business_key)`. Hoy `resource_version` es un digest, pero el item no guarda el locator suficiente para reconstruir de forma inmutable el recurso.

## UX y punto de integración

Crear una superficie compartida, compacta y mobile-first `FirstContactColorSelector`, sin nueva ruta ni rediseño de First Contact:

1. El botón `Iniciar` de `FirstContactSummary` abre el selector cuando no hay operación.
2. El botón existente `Enviar` del dashboard abre la misma superficie para un lead nuevo; no envía directamente ni crea un segundo flujo de WhatsApp.
3. El selector muestra sólo `carModels.slice(0, 3)`. Cada fila contiene nombre, miniatura efectiva, `Predeterminada` y chips de colores activos de ese modelo. El texto inicial conserva todos los modelos.
4. `Predeterminada` queda seleccionada inicialmente. El toque de un color actualiza estado local y miniatura sin navegación; una foto específica ausente muestra la miniatura fallback y una nota discreta, no un error bloqueante.
5. Confirmar llama al mismo start action con `{ vehicleIndex, colorId }`; `null` representa Predeterminada. Cancelar no persiste ni envía.
6. Si ya existe una operación, no se muestra selector: la UI actual de estados/retries continúa usando los items persistidos, incluidos los históricos sin snapshot.

Las opciones se cargan mediante un boundary server-side autenticado y acotado a tres posiciones. El cliente recibe sólo nombres, IDs de color, disponibilidad/miniatura pública y selección actual; nunca recibe service role, API key, URLs arbitrarias del proveedor ni puede elegir instancia o destinatario.

## Modelo mínimo de datos

### `lead_vehicle_color_selections`

Una migración nueva posterior a `059` crea:

| Campo | Regla | Propósito |
|---|---|---|
| `lead_id` | FK a `leads`, cascade sólo para hard-delete | ownership y asociación |
| `vehicle_index` | `smallint`, `0..2`, parte de PK | posición estable dentro de `car_models.slice(0, 3)` |
| `car_model_id` | FK a `car_models` | identidad estructurada del modelo de la posición |
| `car_model_color_id` | FK compuesto con `car_model_id` a `car_model_colors` | garantiza color perteneciente al modelo |
| `created_at`, `updated_at` | `timestamptz` | auditoría |

La PK `(lead_id, vehicle_index)` garantiza como máximo una selección por lead y posición. No guardar una fila significa `Predeterminada`; volver a Predeterminada elimina la fila. La operación server-only valida que el modelo de la fila siga coincidiendo con `leads.car_models[vehicle_index]`; si el modelo cambió, ignora la selección obsoleta y usa Predeterminada, sin asignar el color a otro modelo.

RLS debe permitir lectura al asesor propietario y bloquear DML directo del navegador. Un RPC/Server Action autenticado y validado es el único camino de escritura. No agregar la selección a `leads` como JSON ni a `car_model_colors` como estado del lead.

### Snapshot E3

La misma migración agrega `resource_snapshot jsonb null` a `lead_contact_operation_items`, con validación de forma en el RPC. Para items PHOTO nuevos debe contener, como mínimo:

```json
{
  "schema": 1,
  "resource": "PHOTO",
  "vehicle_index": 0,
  "model_id": "...",
  "model_name": "...",
  "selected_color_id": "...",
  "selected_color_name": "...",
  "source": "COLOR_PHOTO|DEFAULT_COLOR_PHOTO|MODEL_PHOTO|LEGACY_PHOTO|NONE",
  "asset_id": "...",
  "storage_path": "...",
  "file_name": "...",
  "public_url": "...",
  "snapshot_digest": "sha256..."
}
```

`selected_color_*` puede ser null para Predeterminada. `NONE` conserva la intención/posición cuando la foto no existe. No incluir secretos, tokens, UUIDs internos innecesarios para UI ni payload bruto de Evolution. La ficha técnica conserva su resolución actual, pero su item también puede usar el mismo mecanismo de snapshot model-level sin añadir color.

El RPC de lectura no necesita exponer el snapshot al browser. El servidor debe usarlo para enviar/reintentar. Los items históricos con snapshot null conservan su camino actual y no se rellenan retroactivamente.

## Resolución de foto

Para cada posición `i < 3`:

1. Resolver el nombre del lead a `car_models.id` usando el match exacto y el mapa legacy existente.
2. Si hay `colorId`, comprobar que es un color activo del `model_id` resuelto y buscar su PHOTO activa en `car_model_color_assets`. Si existe, usarla.
3. Si la foto específica falta, ejecutar exactamente el resolver predeterminado vigente: PHOTO blanca activa, PHOTO de `car_model_assets`, y `car_model_images` sólo en el caso legacy que ya soporta el código.
4. Si nada existe, crear `NOT_AVAILABLE`; nunca sustituir con otro modelo.

La salida debe incluir `modelId`, nombre, color solicitado, asset elegido, `storage_path`, filename, URL pública y origen. La consulta es acotada a tres modelos y hasta tres colores; no introducir N+1. La ficha usa sólo `car_model_assets` `TECHNICAL_SHEET` y no recibe `colorId`.

Si el color existe sin foto, la UX puede mostrar la miniatura fallback y explicar “Este color usará la foto predeterminada”. No se convierte en `NOT_AVAILABLE` si el fallback existe.

## Inicio, snapshot, retry y compatibilidad

- El start action recibe sólo `leadId` y selecciones `{ vehicleIndex, colorId|null }`; vuelve a leer el lead y valida ownership, posiciones, modelo/color y que no haya operación existente.
- La creación de selección y de operación debe ser una transacción/RPC única o una secuencia protegida por el lock de la operación. Si la operación ya existe, devuelve sus items y no cambia selecciones ni snapshots.
- El request E3 forward-only debe persistir el snapshot junto al item antes de devolver una operación utilizable. Si no puede persistirlo, se aborta antes de provider IO y se devuelve error recuperable.
- `item_key` conserva identidad por recurso y modelo (`PHOTO:01:<model-id>`); el color no se agrega como nueva categoría ni permite colisión. `resource_version` para items nuevos se deriva del snapshot canónico; operaciones viejas conservan su digest actual.
- Antes de enviar, el comando aplica los snapshots persistidos al request. Un retry nunca vuelve a consultar un color/asset diferente para un item nuevo. El payload digest/fence se calcula sobre ese snapshot.
- `ACCEPTED` nunca se reenvía. `FAILED` y los recursos recuperables siguen el retry existente. `UNKNOWN` conserva las reglas actuales y no entra en retry automático.
- `NOT_AVAILABLE` no crea efecto. Si el asset aparece después, el recovery puede hidratar ese mismo item y guardar un snapshot nuevo una sola vez; desde entonces queda congelado. No crear items adicionales ni expandir operaciones históricas.
- Si una operación histórica no tiene snapshot, se conserva exactamente el comportamiento compatible actual; la nueva garantía de snapshot aplica a operaciones creadas con el contrato nuevo.

Para que el snapshot sea real y no sólo un path mutable, una futura actualización de asset debe escribir una nueva fila y una nueva `storage_path`, desactivar la anterior y conservar el objeto anterior mientras una operación pueda referenciarlo. La administración de assets está fuera de este incremento, pero es una precondición operacional del contrato.

## Migración y boundaries

Proponer `060_first_contact_color_selection_snapshot.sql` (nombre final en implementación):

- crea `lead_vehicle_color_selections`, índices, RLS y grants mínimos;
- agrega la unicidad compuesta necesaria en `car_model_colors` para el FK modelo+color;
- agrega `resource_snapshot` a `lead_contact_operation_items` con un check de JSONB acotado;
- crea/reemplaza RPCs server-side de selección, request, lectura, retry y hydration para aceptar/persistir snapshots;
- deja las firmas históricas disponibles para compatibilidad, no modifica migraciones anteriores y no hace backfill.

La implementación debe actualizar el tipo generado `lib/supabase/database.ts`; no cambiar `leads` ni crear enums de color. La migración se valida localmente y en Supabase antes de aplicación, pero esta mini-spec no la crea ni la ejecuta.

## Archivos probables

- `components/leads/first-contact-color-selector.tsx` — selector compacto compartido.
- `components/leads/first-contact-summary.tsx` — abrir selector, mostrar estado y pasar selección.
- `components/dashboard/dashboard-client.tsx` — enrutar el `Enviar` de un lead nuevo al selector sin tocar recovery ni estados existentes.
- `components/leads/lead-capture-form.tsx` — sólo ajustar props si el summary necesita las opciones; no tocar formulario de creación.
- `lib/first-contact/command.ts`, `resource-plan.ts`, `types.ts` — selección, snapshot y aplicación en send/retry.
- `lib/leads/actions.ts`, `validation.ts`, `repository.ts` — boundary autenticado, resolución acotada y RPCs.
- `lib/supabase/database.ts` — tipos de la tabla/columna nueva.
- `supabase/migrations/060_first_contact_color_selection_snapshot.sql` — contrato DB forward-only.
- `scripts/e3-multi-vehicle-contract-check.mjs` y un runtime check puro nuevo o ampliado — contrato, orden, fallback e idempotencia.

No tocar `lib/whatsapp/reminders.ts`, `lib/whatsapp/service.ts` salvo que una importación existente lo requiriera (no debería), webhook Evolution, Push, Service Worker, catálogo general, scheduler de reminders, workflows de deploy o dependencias.

## Acceptance criteria

1. Sin selección, el flujo y el recurso predeterminado son idénticos al actual.
2. Uno, dos y tres modelos muestran y persisten selecciones independientes; más de tres ignora posiciones posteriores.
3. Color válido con PHOTO activa envía la foto de ese modelo/color; color sin PHOTO usa el fallback del mismo modelo; otro modelo nunca se usa.
4. Ficha técnica, texto con todos los modelos, orden de salida y límite de siete items se mantienen.
5. El start no envía al guardar el lead; sólo una acción explícita inicia E3.
6. Dos clicks/concurrencia no crean otra operación, item, efecto ni envío aceptado.
7. El snapshot existe antes de IO y un cambio posterior de lead/color/asset no altera un retry nuevo.
8. Modelos sin colores funcionan con Predeterminada; colores inactivos no aparecen para nuevas selecciones y no rompen snapshots existentes.
9. Operaciones históricas no reciben nuevas filas ni efectos.
10. No se filtran secretos ni se permite al browser elegir URLs o proveedor.

## Tests y runtime QA

**Contratos/puro:** un modelo default/color, 2 y 3 colores independientes, 4+ limitado, orden de `car_models`, color sin asset, fallback, color cruzado inválido, snapshot/version digest, keys sin colisión, retry de PHOTO A vs PHOTO B, MESSAGE failure, partial status, send-once e histórico.

**Integración local:** RPC/owner/RLS, creación atómica selección+operación, replay concurrente, snapshot antes de `begin_effect_io`, hydration de un item unavailable y preservación de operaciones antiguas. Usar fixtures/mocks; no Evolution real.

**Runtime QA móvil y desktop:** abrir selector desde `/nuevo` después de guardar y desde `Enviar` del dashboard; seleccionar/resetear color y comprobar miniatura; 1–3 filas, modelo sin colores, loading/error recuperable, cancelación; verificar que los resultados siguen mostrando estados actuales. No mandar WhatsApp real.

**Regresión:** `npm run typecheck`, `npm run lint`, `npm run build`, `bash scripts/ci-contract-checks.sh`, `git diff --check`; confirmar que First Contact manual, Push, reminder WhatsApp, inbound, Auth, catálogo y creación de lead no cambiaron fuera de lo especificado.

## Diferencias producto ↔ arquitectura resueltas

- “Foto genérica” se interpreta como el comportamiento actual de `Predeterminada`, que hoy es white-first y luego model-level/legacy; no se cambia la prioridad.
- Como el lead no tiene IDs/filas de vehículos, la selección se identifica por `vehicle_index` y se valida contra el modelo actual de esa posición.
- El requisito de snapshot no se satisface con el digest URL actual; requiere persistir locator/asset y exigir rutas inmutables para nuevos assets.
- El dashboard tiene un camino de envío directo separado del `FirstContactSummary`; ambos deben converger en el selector sólo para el primer inicio, sin duplicar estados ni comandos.

## Qué no se toca

Creación/edición general de lead, modelos del formulario, texto comercial salvo la selección de foto, technical sheet resolution, First Contact manual/send-once/E3 categories/order, retries/status semantics, historical operations, Evolution instances/API/webhook, customer WhatsApp, reminder WhatsApp, Push/service worker/scheduler, catálogo visual/admin, compras, cotizador, colores por inventario, dependencias, deploy y datos de producción.
