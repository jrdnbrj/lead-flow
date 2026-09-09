---
title: "Postcompra: caso postcompra y milestones operativos"
type: brownfield-mini-spec
status: ready-for-approval
created: 2026-09-08
baseline_commit: c27c9703a82ec6e64544e62c54796395ca8109f0
---

# Mini-spec BMAD brownfield

## Intent y señal de éxito

LeadFlow necesita registrar manualmente el avance posterior a una compra sin
contaminar `leads`, inferir estados comerciales ni automatizar sistemas
externos. Un asesor debe poder abrir un caso postcompra de un lead con
`PURCHASE_DECISION` activo, marcar etapas, corregir una marca y ver el progreso
actual con fecha y responsable.

La implementación será exitosa cuando un lead comprado tenga un único caso,
13 etapas ordenadas y consultables, progreso correcto, acciones idempotentes y
ownership server-side, sin alterar la compra, el score, el estado del lead,
WhatsApp, Push, reminders, cotizaciones o Evolution.

## Brownfield discovery actual

- `public.lead_milestones` actualmente sólo admite `PURCHASE_DECISION`, tiene
  unicidad `(lead_id, milestone_type)`, `recorded_at`, `origin`,
  `buyer_national_id` y, desde migration 074, `purchase_status` con valores
  `PURCHASED`/`REVERTED`.
- `PURCHASE_DECISION` se crea o reactiva mediante `record_purchase_decision_v2`
  y se revierte mediante `revert_purchase_decision_v1`; ambas RPCs son
  `SECURITY DEFINER`, bloquean el lead, derivan el owner con
  `leadflow_action_owner_v1()` y exigen lead activo y propio.
- La migration 074 no creó una entidad de caso ni hitos posteriores. No se
  debe ampliar su fila para representar facturación, RAMV o entrega.
- El ledger `leadflow_events` es append-only y su registro actual incluye
  `purchase_decision_recorded`, no eventos específicos para cada etapa
  postcompra. La auditoría mínima de este slice cabe en las filas actuales de
  caso/milestone; no se crea un ledger paralelo.
- La lectura privada existente usa RLS por `leads.user_id`; las mutaciones
  sensibles se delegan a RPCs server-side. El cliente no debe enviar un
  `user_id` confiable ni escribir tablas directamente.
- El dashboard no tiene una pantalla de postcompra separada. `LeadCard` en
  `components/dashboard/dashboard-client.tsx` muestra el detalle expandido,
  el estado de compra, seguimientos, First Contact y cotizaciones. Éste es el
  punto de integración de menor fricción.
- No existen actualmente `purchase_cases`, milestones postcompra, blockers,
  documentos de postcompra ni automatizaciones de Fondo Vial/RAMV/órdenes.

## Decisiones de dominio

### PURCHASE_CASE_RECOMMENDED: YES

Se recomienda un caso 1:1 con el lead porque será el ancla estable para futuros
documentos, bloqueos, matrícula, accesorios, preparación y entrega. Reutilizar
`lead_milestones` para todo reduciría tablas ahora, pero mezclaría la decisión
de compra reversible con el ciclo operativo, obligaría a relajar el contrato
actual de 074 y dejaría sin un agregado claro para documentos futuros.

No se agregan esos futuros datos al caso en v1: sólo identidad, ownership y
timestamps básicos.

### CASE_CREATION_TRIGGER:

El caso nace de forma idempotente en el primer acceso autenticado a la sección
Postcompra de un lead con `PURCHASE_DECISION = PURCHASED`.

Esta opción conserva intacta la RPC de marcar compra, evita writes al guardar
un lead y evita un backfill masivo. La operación `ensure` crea el caso y sus 13
filas iniciales dentro de una transacción; una restricción única por `lead_id`
protege contra doble click/concurrencia.

Un lead histórico comprado sin caso se incorpora al primer acceso, sin modificar
la operación histórica de compra.

### CASE_BEHAVIOR_WHEN_PURCHASE_REVERTED:

- No se borra el caso ni sus milestones.
- El acceso de lectura puede mostrar `Postcompra pausada` sin acciones de
  cambio; las mutaciones se rechazan mientras no exista una compra activa.
- El caso no necesita un segundo estado duplicado: su disponibilidad operativa
  se deriva de `PURCHASE_DECISION.purchase_status`.
- Si la compra se reactiva, se vuelve a usar el mismo caso y las mismas filas.
- No se reabren ni se completan etapas automáticamente.

### MILESTONE_MODEL:

Crear `purchase_case_milestones`, una fila por etapa y caso. La creación del
caso siembra las 13 etapas en el orden v1, todas inicialmente `PENDING`.

Campos mínimos:

- `id` UUID;
- `purchase_case_id` FK al caso;
- `milestone_type` código estable;
- `position` 1–13;
- `status`;
- `completed_at`, nullable;
- `completed_by`, nullable FK a `auth.users`;
- `reverted_at`, nullable;
- `reverted_by`, nullable FK a `auth.users`;
- `created_at`, `updated_at`.

Restricciones:

- una sola fila por `(purchase_case_id, milestone_type)`;
- una sola fila por `(purchase_case_id, position)`;
- `status` sólo `PENDING`, `COMPLETED` o `REVERTED`;
- `COMPLETED` requiere `completed_at` y `completed_by`;
- `REVERTED` conserva `completed_at`/`completed_by` como referencia de la
  última finalización y requiere `reverted_at`/`reverted_by`;
- `PENDING` no muestra una finalización activa; al revertir no se borran los
  datos de auditoría de la corrección.

### MILESTONE_STATES:

- `PENDING`: aún no completado o pendiente después de una corrección.
- `COMPLETED`: etapa confirmada explícitamente por el asesor.
- `REVERTED`: una finalización anterior fue corregida; cuenta como pendiente
  para el progreso y conserva quién/cuándo la corrigió.

### Catálogo v1 de 13 etapas

| Posición | Código interno | Nombre visible | Significado de completado |
|---:|---|---|---|
| 1 | `INVOICED` | Facturado | El asesor confirma que la facturación fue atendida. |
| 2 | `FONDO_VIAL` | Fondo vial | La solicitud/gestión del Fondo Vial fue registrada como atendida. |
| 3 | `RAMV_REQUESTED` | RAMV solicitado | La solicitud del RAMV fue realizada. |
| 4 | `RAMV_UPLOADED` | RAMV cargado | El RAMV requerido está cargado/recibido. |
| 5 | `ORDERS_AVAILABLE` | Órdenes disponibles | Las órdenes están disponibles para operar. |
| 6 | `ORDERS_SENT` | Órdenes enviadas | Las órdenes fueron enviadas al cliente. |
| 7 | `PAYMENTS_RECEIVED` | Pagos recibidos | Los comprobantes/pagos requeridos fueron recibidos. |
| 8 | `SENT_TO_REGISTRATION` | Enviado a matricular | El caso fue enviado al proceso de matriculación. |
| 9 | `REGISTERED` | Matriculado | El vehículo figura como matriculado. |
| 10 | `ACCESSORIES_COMPLETE` | Accesorios completos | Los accesorios comprometidos están completos. |
| 11 | `VEHICLE_REQUESTED` | Vehículo solicitado | La solicitud/traslado del vehículo fue realizada. |
| 12 | `DELIVERY_PREPARATION` | Preparación para entrega | El vehículo está en preparación para entrega. |
| 13 | `DELIVERED` | Entregado | La entrega fue confirmada por el asesor. |

### FONDO_VIAL_ONE_OR_TWO_MILESTONES: ONE

La lista de negocio presenta "solicitado/registrado" como una etapa y el
progreso inicial debe ser 13, no 14. En v1 `FONDO_VIAL` significa que la
gestión fue iniciada y registrada como atendida por el asesor. Si más adelante
se necesita distinguir solicitud de registro, se agregará una decisión de
producto y nuevos códigos; no se oculta esa diferencia dentro de un estado
ambiguo ahora.

### OUT_OF_ORDER_ALLOWED: YES

Se permite completar cualquier etapa cuando la operación real lo requiera. No
se bloquea una etapa posterior por gaps anteriores. La UI muestra el progreso
numérico y mantiene visibles las etapas pendientes, sin sugerir que una etapa
posterior corrige las anteriores.

### AUDIT_MODEL:

La auditoría v1 vive en la fila actual: `completed_at`, `completed_by`,
`reverted_at`, `reverted_by` y `updated_at`. No se añade un evento a
`leadflow_events` por cada click; el ledger actual no tiene contrato para estas
transiciones y crear una segunda auditoría sería desproporcionado. Un historial
completo de cambios queda fuera de este slice.

### FACTURADO_V1_REQUIRED_DATA

Sólo requiere confirmación explícita del asesor. Se persisten timestamp y actor
de la acción. No se solicitan número de factura, PDF, monto, fecha fiscal,
datos tributarios ni OCR.

## Modelo de datos previsto

```text
leads
  └── purchase_cases (1:1, sólo para un lead con PURCHASED actual)
        └── purchase_case_milestones (13 filas ordenadas)
```

`PURCHASE_DECISION` permanece en `lead_milestones` y no se copia ni se
transforma. El caso se relaciona al lead, no a la fila de decisión, porque el
estado actual se consulta siempre desde la decisión activa.

`purchase_cases` mínimo:

- `id` UUID PK;
- `lead_id` UUID NOT NULL FK `leads(id)`, único, `ON DELETE RESTRICT`;
- `created_at` timestamptz NOT NULL;
- `created_by` UUID NOT NULL FK `auth.users(id)`;
- `updated_at` timestamptz NOT NULL.

No habrá precio, modelo elegido, factura, documentos, bloqueos ni estado de
automatización en esta tabla.

## API de persistencia y ownership

Todas las mutaciones se ejecutan mediante RPCs `SECURITY DEFINER` con
`search_path` fijo y owner derivado por `leadflow_action_owner_v1()`:

1. `ensure_purchase_case_v1(p_lead_id)`
   - bloquea y valida lead activo y propio;
   - exige `PURCHASE_DECISION` actual `PURCHASED`;
   - obtiene o crea el único caso;
   - siembra las 13 filas con `ON CONFLICT DO NOTHING`;
   - devuelve caso, catálogo y progreso.
2. `complete_purchase_milestone_v1(p_case_id, p_milestone_type,
   p_idempotency_key)`
   - bloquea lead, caso y fila;
   - revalida ownership y compra activa;
   - si ya está `COMPLETED`, responde replay sin cambiar timestamp;
   - si está `PENDING`/`REVERTED`, marca `COMPLETED` con actor/timestamp del
     owner y devuelve el read model.
3. `revert_purchase_milestone_v1(p_case_id, p_milestone_type,
   p_idempotency_key)`
   - sólo opera un milestone ya completado;
   - si ya está `REVERTED`, responde replay;
   - marca `REVERTED`, conserva la última finalización y registra actor/timestamp
     de la corrección.

### IDEMPOTENCY_PLAN:

El `p_idempotency_key` se valida como comando, pero la garantía primaria v1 es
la fila única bloqueada y el estado actual: retry después de timeout no crea
otra fila ni otro caso. No se crea una tabla genérica de idempotencia.

### RLS_PLAN:

RLS prevista:

- `purchase_cases` y `purchase_case_milestones` habilitan RLS;
- lectura sólo para `authenticated` cuando el caso llega a un lead propio y no
  eliminado;
- sin INSERT/UPDATE/DELETE directo para el cliente;
- grants de RPC sólo a `authenticated`, nunca `public`/`anon`;
- cada RPC valida además ownership y `PURCHASED`, aunque la UI ya lo haya
  comprobado.

## Proyección y UI v1

La integración ocurre sólo en `LeadCard` expandido, sin nueva bottom tab ni
rediseño del dashboard.

Para una compra activa se muestra una sección discreta:

```text
Postcompra
3 de 13 completados

✓ Facturado                         08 sep · Jordan
○ Fondo vial                        Marcar como hecho
○ RAMV solicitado                   Marcar como hecho
...
```

- La lista respeta `position`, no el orden de la última acción.
- Cada fila muestra nombre, estado y fecha/actor sólo si corresponde.
- `Marcar como hecho` requiere la acción explícita del asesor; no hay optimistic
  success antes de la respuesta RPC.
- `Corregir`/`Deshacer` es una acción discreta y confirma antes de revertir.
- Un error de RPC/red queda inline y conserva el estado visual anterior.
- El panel puede cargar el caso al abrirse; el dashboard no crea casos al
  guardar leads ni al cargar indiscriminadamente todos los leads.
- Para un caso existente con compra revertida se muestra sólo un estado
  pausado, sin acciones mutantes, hasta reactivar la compra.
- El resumen de una tarjeta no se convierte en checklist; sólo el detalle
  expandido contiene las 13 filas.

Progreso:

`completed_count = count(status = COMPLETED)` y `total = 13`.
`PENDING` y `REVERTED` permanecen como gaps. Completar una etapa posterior no
incrementa otra ni modifica etapas previas.

## MIGRATION_PLAN:

Crear sólo una migration nueva, por ejemplo:

`supabase/migrations/075_purchase_case_milestones.sql`

Debe ser forward-only y contener únicamente:

- `purchase_cases` y constraints 1:1;
- `purchase_case_milestones`, catálogo/checks, índices y unicidades;
- RLS/policies/grants;
- las tres RPCs con locks, ownership, compra activa y replay;
- funciones auxiliares estrictamente necesarias.

No modificar `018`, `043`, `069`, `074` ni otras migraciones históricas. No
hacer backfill masivo ni crear casos por todos los leads comprados; el primer
acceso realiza el ensure idempotente. No añadir columnas a `leads`.

## Code Map probable

- `supabase/migrations/075_purchase_case_milestones.sql` — tablas, checks,
  RLS, RPCs e índices.
- `lib/supabase/database.ts` — tipos de tablas/RPC generados o actualizados.
- `lib/domain/lead.ts` — tipos pequeños para caso, estado, milestone y
  proyección `completed/total`.
- `lib/leads/repository.ts` o un módulo `lib/postpurchase/` — lectura y
  adaptación de RPCs, sin writes directos.
- `lib/leads/actions.ts` o `lib/postpurchase/actions.ts` — autorización,
  validación y respuestas funcionales.
- `lib/leads/validation.ts` o `lib/postpurchase/validation.ts` — lead/case,
  código de milestone y claves de comando.
- `components/dashboard/dashboard-client.tsx` — punto de integración del
  detalle expandido, manteniendo controles actuales intactos.
- `components/leads/post-purchase-panel.tsx` — componente aislado para la
  sección/checklist, si la separación evita agrandar `LeadCard`.
- `scripts/pp-purchase-case-contract-check.mjs` — contrato estático de alcance,
  estados, orden, RLS y no regresión.

No se anticipan cambios en Evolution, Push, reminders, First Contact,
cotizaciones, catálogo, auth de usuario ni creación/edición de leads.

## I/O & Edge-Case Matrix

| Caso | Entrada/estado | Resultado esperado |
|---|---|---|
| PP1 | Lead `NOT_PURCHASED` | No crea ni modifica caso/milestones; error funcional. |
| PP2 | Lead `PURCHASED` | Accede a un caso único y a 13 filas. |
| PP3 | Aperturas/doble click/concurrencia | Mismo caso, mismas 13 filas; sin duplicados. |
| PP4 | Completar `INVOICED` | `COMPLETED`, `completed_at` y `completed_by` persistidos. |
| PP5 | Repetir completion | Replay idempotente; no cambia timestamp ni crea fila. |
| PP6 | Revertir `INVOICED` | `REVERTED`, progreso disminuye, lead intacto. |
| PP7 | Completar etapa posterior | Permitido; gaps anteriores continúan visibles. |
| PP8 | Progreso | Siempre `completed_count/13`; sólo COMPLETED cuenta. |
| PP9 | Otro owner/anónimo | Lectura y mutación rechazadas por RLS/ownership. |
| PP10 | Revertir `PURCHASE_DECISION` | Caso y datos conservados; actividad nueva bloqueada. |
| PP11 | Reactivar compra | Mismo caso vuelve a ser operable; no siembra duplicados. |
| PP12 | Histórico comprado sin caso | Se crea al primer acceso; sin backfill masivo. |
| PP13 | Caso/lead eliminado o inexistente | No se opera; no se filtran datos ajenos. |
| PP14 | Milestone/código inválido | RPC rechaza; no cambia ninguna fila. |
| PP15 | Error RPC/red | UI no adelanta éxito y permite reintento seguro. |

## Riesgos y controles

### P0

- Permitir una mutación sin comprobar compra activa/ownership: mitigado con
  locks, RPC server-side y RLS.
- Crear dos casos o dos filas del mismo milestone: mitigado con unicidades y
  `ON CONFLICT`.
- Contar `REVERTED` como completado o borrar auditoría: mitigado por checks y
  proyección explícita.

### P1

- Leads históricos comprados sin caso: ensure lazy y prueba de compatibilidad.
- Reversión/reactivación de compra durante una acción: cada RPC revalida y
  bloquea el lead; no se permite una mutación posterior si la compra ya fue
  revertida.
- Lead con varios `car_models`: el caso v1 es por lead y no infiere qué modelo
  se compró. La asociación de vehículo/documentos queda fuera.
- Semántica de Fondo Vial: una etapa v1 no distingue solicitado de registrado;
  si esa diferencia afecta el negocio, debe resolverse antes de añadir
  automatización.

### P2

- Checklist de 13 filas puede aumentar la carga visual: mantenerlo sólo en
  detalle expandido y usar resumen de progreso.
- Sin historial completo de cambios: aceptado para v1; `reverted_*` conserva la
  última corrección, no un event sourcing completo.
- Hitos fuera de orden pueden malinterpretarse como avance completo: mostrar
  siempre gaps y no bloquear ni ocultar etapas pendientes.

## Tests y runtime QA requeridos

### Persistencia/contratos

- Contrato estático que compruebe tablas separadas, 13 códigos/posiciones,
  estados, unicidades, no cambios a 074 y exclusión de blockers/documentos/
  automatizaciones.
- SQL/RPC fixture para PP1–PP15, doble click, concurrencia lógica, timestamps,
  owner incorrecto, lead eliminado y recuperación tras error.
- Verificar que `PURCHASE_DECISION` sigue siendo la única fuente de entrada y
  que no se modifica `leads.status`, score, payment methods o next actions.

### UI

- Lead comprado: panel, 0/13, 1/13, 3/13 y 13/13.
- Lead no comprado: sin acciones postcompra.
- Completar/revertir/reintentar con feedback y sin optimistic false-success.
- Etapa posterior fuera de orden mantiene gaps visibles.
- Compra revertida: estado pausado; reactivación conserva caso y filas.
- Mobile y desktop: sección dentro del detalle sin romper WhatsApp,
  cotizaciones, First Contact ni seguimientos.

### Validación estándar futura

`node scripts/pp-purchase-case-contract-check.mjs`, tests dirigidos,
`npm run typecheck`, `npm run lint`, `npm run build`,
`bash scripts/ci-contract-checks.sh`, `git diff --check`, Docker local y QA
autenticada con fixtures. No usar leads reales, Evolution ni WhatsApp real.

## Compatibilidad y fuera de alcance

No tocar:

- `PURCHASE_DECISION`, filtros de compra, migration 074 ni su semántica;
- `leads.status`, score, payment methods, follow-ups, next actions;
- First Contact, catálogo, cotizaciones, Push, reminders, Evolution y auth;
- creación/edición de leads, infraestructura, NovaCredit y navegación global.

Deferidos explícitos:

- `DOCUMENT_MODEL_DEFERRED: YES` — factura, RAMV, órdenes, comprobantes,
  matrícula y PDFs tendrán tablas/metadata propias después.
- `BLOCKERS_DEFERRED: YES` — blockers serán dimensión separada, no estados de
  milestone.
- `AUTOMATIONS_DEFERRED: YES` — no Fondo Vial, RAMV, Outlook/email, portales,
  OCR, Playwright, WhatsApp ni scheduler.
- precio, inventario, stock, modelo comprado y múltiples ciclos de compra por
  lead.

## Preguntas abiertas reales

1. Si un lead contiene varios modelos, ¿qué vehículo debe anclar los futuros
   documentos y datos de matrícula? Este slice no elige ni infiere uno.
2. ¿El negocio necesita distinguir operativamente `FONDO_VIAL_SOLICITADO` de
   `FONDO_VIAL_REGISTRADO` antes de automatizar esa etapa? V1 usa una sola etapa
   para mantener el progreso 13.
3. ¿Un lead podrá representar más de una compra independiente en el futuro?
   V1 asume una sola compra/caso por lead; cambiar esa cardinalidad requeriría
   una decisión explícita.

Ninguna pregunta bloquea el tracking manual por lead definido aquí; las tres
deben resolverse antes de documentos o automatizaciones específicas.

## Opción de aprobación

`[A] Aprobar e implementar localmente`

`[E] Editar alcance`

No implementar, crear migration, aplicar cambios remotos, hacer deploy, push,
llamar Evolution ni enviar WhatsApp hasta aprobación humana explícita.
