# Contrato técnico y funcional

## Catálogo y cardinalidad

`document_type` es `text` con check controlado: `INVOICE`, `FONDO_VIAL`,
`RAMV`, `PAYMENT_ORDER`, `PAYMENT_RECEIPT`, `REGISTRATION`, `OTHER`.

| Tipo | Activos permitidos | Corrección |
|---|---:|---|
| INVOICE | 1 | Reemplazo; conserva el anterior |
| FONDO_VIAL | 1 | Reemplazo; conserva el anterior |
| RAMV | 1 | Reemplazo/versiones mediante `REPLACED` |
| REGISTRATION | 1 | Reemplazo; conserva el anterior |
| PAYMENT_ORDER | varios | Cada archivo es legítimo; no se reemplaza implícitamente |
| PAYMENT_RECEIPT | varios | Cada archivo es legítimo; no se reemplaza implícitamente |
| OTHER | varios | Cada archivo es independiente |

## Tabla mínima propuesta

`public.purchase_case_documents`:

- `id uuid primary key default gen_random_uuid()`;
- `purchase_case_id uuid not null references purchase_cases(id) on delete restrict`;
- `document_type text not null` con el check anterior;
- `status text not null default 'ACTIVE'` con `ACTIVE | REPLACED | DELETED`;
- `storage_path text not null unique`;
- `original_filename text not null` (sanitizado sólo para presentación);
- `mime_type text not null`;
- `size_bytes bigint not null`;
- `replaced_by uuid null references purchase_case_documents(id) on delete restrict`;
- `deleted_at timestamptz null`, `deleted_by uuid null references auth.users(id)`;
- `created_at timestamptz not null default now()`, `created_by uuid not null references auth.users(id)`;
- `updated_at timestamptz not null default now()`.

No se agregan `version`, `document_date`, `notes` ni un ledger de eventos: la
cadena `created_at` + `replaced_by` conserva lo necesario para v1. Un índice
único parcial sobre `(purchase_case_id, document_type)` cuando el tipo sea
único y `status = 'ACTIVE'` impide dos activos bajo concurrencia.

## Estado, reemplazo y eliminación

- **ACTIVE:** visible y elegible para abrir/descargar.
- **REPLACED:** histórico, no aparece en la lista operativa ni recibe una URL
  nueva; apunta al nuevo documento mediante `replaced_by`.
- **DELETED:** retiro lógico por error o limpieza; no aparece ni recibe URLs.
- Reemplazo: subir primero al path UUID nuevo; una RPC valida caso propio,
  `PURCHASED`, tipo único y documento anterior activo, inserta el nuevo y
  cambia el anterior en una transacción. Si falla la metadata, se elimina el
  objeto nuevo y el anterior sigue activo.
- Eliminación: sólo sobre un documento activo y mediante RPC server-side; es
  soft delete y el objeto permanece privado asociado a su fila. Así no se
  rompe un consumidor futuro ni se crea una operación DB/Storage imposible de
  hacer atómica. La destrucción física, retención y purga son otro slice.
- Para tipos múltiples, `Reemplazar` no se ofrece: se agrega un archivo o se
  retira lógicamente el archivo equivocado.

## Storage y acceso

- Bucket dedicado `purchase-documents`, privado, nunca `vehiculos` ni
  `quotations`; la migration debe crearlo sólo si el preflight confirma que el
  nombre está libre.
- Path: `purchase-cases/{purchase_case_id}/{document_id}/{extension}`. El
  nombre no contiene teléfono, nombre del cliente ni datos libres; UUID y
  `upsert=false` evitan sobrescritura.
- MIME inicial: `application/pdf`, `image/jpeg`, `image/png`, `image/webp`;
  máximo 10 MiB por objeto. Validar extensión, MIME y magic bytes server-side.
- No se persisten URLs. Preview/descarga usa route autenticada por `document_id`
  y `download=1`; valida owner, caso activo del lead y `status = ACTIVE` antes
  de crear una signed URL de máximo 5 minutos o transmitir el objeto. Nunca
  aceptar un `storage_path` del cliente como autorización.
- Upload es compensatorio, no pseudo-atómico: validar primero, subir el UUID,
  insertar/replacear metadata, y remover el objeto nuevo si la RPC falla.
  Un objeto subido sin fila no queda visible por policy; el error se registra
  para limpieza operativa.

## Seguridad y mutaciones

- RLS habilitado. `SELECT` sólo cuando `purchase_case -> leads.user_id =
  auth.uid()` y el lead no está borrado; `REPLACED/DELETED` no reciben acceso
  de Storage aunque permanezcan en metadata.
- Revocar insert/update/delete directo a `anon`/`authenticated`; otorgar sólo
  select si la policy lo limita. Crear RPCs `SECURITY DEFINER`, con
  `search_path` fijo y `grant execute` únicamente a `authenticated`, o usar la
  frontera server-side equivalente ya existente.
- RPCs mínimas: `create_or_replace_purchase_case_document_v1` y
  `delete_purchase_case_document_v1`. No reciben `owner_id`; resuelven owner
  desde sesión y validan `PURCHASED`. Lectura puede ser RPC/read route con el
  mismo ownership.
- `REVERTED`: leer/listar/abrir documentos sí; subir, reemplazar y eliminar
  no. Reactivar no crea caso ni documentos nuevos: reusa las mismas filas.
- Lead soft-deleted o caso inexistente/ajeno: no revelar si existe; responder
  error funcional uniforme.

## UX en Postcompra

Dentro de `PostPurchasePanel`, después del encabezado/progreso y sin nueva
navegación, mostrar `Documentos` con cantidad activa y un botón `Subir`
compacto. Cada fila muestra tipo, nombre original, tamaño/fecha y acciones
`Ver`, `Descargar`, `Reemplazar` sólo para tipos únicos y `Eliminar`.

En móvil debe ser una lista compacta sin overflow horizontal; el input acepta
un archivo, muestra validación de tipo/tamaño y loading/éxito/error. En caso
pausado se mantienen Ver/Descargar y se deshabilitan mutaciones con copy claro.
La sección no llama ni altera ningún milestone y no crea bottom tab.

## Migration plan

Crear una sola migration nueva, `081_purchase_case_documents_v1.sql`, forward-only:

1. tabla, checks, FK, índices y trigger de `updated_at`;
2. RLS, grants y policies de tabla/Storage;
3. bucket privado dedicado con allowlist/límite;
4. RPCs de create/replace/delete y comentarios de seguridad.

Actualizar `lib/supabase/database.ts` sólo mediante el mecanismo de tipos del
proyecto. No editar 068, 070, 074, 075, 077 ni crear backfill.

## Acceptance criteria

- AC1: owner + caso `PURCHASED` puede subir PDF/imagen válida dentro de 10 MiB;
  MIME no permitido, firma inválida o exceso de tamaño se rechaza antes de
  persistir metadata.
- AC2: el archivo queda en bucket privado con path UUID y una fila asociada;
  doble click no sobreescribe un objeto existente.
- AC3: lista/preview/download sólo devuelve documentos `ACTIVE` del owner; un
  owner ajeno, lead borrado o path inventado recibe rechazo uniforme.
- AC4: INVOICE/FONDO_VIAL/RAMV/REGISTRATION mantienen exactamente un activo;
  reemplazo deja el anterior `REPLACED` y no lo elimina.
- AC5: PAYMENT_ORDER/PAYMENT_RECEIPT/OTHER admiten múltiples activos y no se
  reemplazan silenciosamente.
- AC6: eliminar marca `DELETED`, lo quita de la lista y no crea URL nueva; la
  fila/objeto siguen privados y trazables.
- AC7: caso `REVERTED` permite lectura, rechaza las tres mutaciones y vuelve a
  permitirlas al reactivar el mismo caso.
- AC8: subir cualquier documento no cambia compra, lead, score ni ninguna de
  las 13 filas/marcas de milestones.
- AC9: falla de Storage no crea fila activa; falla de metadata intenta borrar
  el objeto nuevo y deja el documento anterior intacto.
- AC10: UX móvil y desktop cabe en el panel actual, muestra feedback y no crea
  navegación global.

## Tests y QA

- Contratos estáticos: tipos/checks, bucket privado, RLS/grants, RPCs,
  cardinalidad parcial, estado REVERTED y ausencia de llamadas de milestones.
- Tests dirigidos: validación MIME/tamaño/firma; single vs multi; replace;
  soft delete; doble solicitud/concurrencia; owner ajeno; lead borrado; fallo
  upload/insert; signed URL expirada; reactivación.
- Runtime local autenticado con fixtures/mocks de Storage: subir, listar,
  preview, descargar, reemplazar y eliminar en desktop/mobile. No usar leads
  reales ni Storage remoto durante QA.

## Risks and deferred decisions

- DB y Storage no comparten transacción; la compensación y la policy que oculta
  paths sin fila reducen la ventana, pero requieren contract test de fallo.
- El límite de 10 MiB y la allowlist pueden requerir ajuste por evidencia real;
  cambiarlo requiere migration/config revisada.
- Futura automatización debe referenciar `purchase_case_documents.id` y un
  snapshot propio antes de consumir un archivo; no se diseña aquí.
- OCR, envíos, retención/purga física y permisos por rol quedan diferidos.

## Out of scope

OCR, Document AI, IA, Fondo Vial/RAMV automáticos, Playwright, Outlook, emails,
WhatsApp, órdenes automáticas, clasificación, milestones automáticos,
reservas, blockers, delivery automation, navegación global, cambios de auth,
Evolution, Push, reminders, cotizaciones y cualquier infraestructura fuera de
la migration/bucket/policies necesarias para este expediente.
