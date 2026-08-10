# Story 4.5a: Registry canónico e infraestructura de append de eventos

Status: ready-for-dev

## Story

Como sistema auditable,
quiero un vocabulario de eventos, envelopes y una infraestructura única de append,
para que las futuras mutaciones puedan instrumentarse sin inventar contratos por capability.

## Dependencies

- E4-S2: identidad singleton disponible para el owner obligatorio de eventos.
- AD-10: contrato canónico de `leadflow_events`, registry, clases, mappings e identidades.

## Scope and ownership boundary

E4-S5a entrega únicamente el registry, el envelope schema v1, los contratos de payload,
la receta de identidad/event key, la semántica de replay/conflicto, el append port,
las garantías append-only mínimas y el mecanismo de emitibilidad.

No instrumenta mutaciones existentes ni implementa lógica de negocio de leads, acciones,
inbound, WhatsApp, Push, external effects, compra o sincronización corporativa. Los RPCs
dueños de cada capability conservan la autoridad de construir su identidad y, en E4-S5b
o en la story de la capability correspondiente, combinar su mutación con el append en
una misma transacción.

El baseline brownfield actual no contiene `leadflow_event_registry`, `leadflow_events`,
`lib/events` ni writers de eventos. Crear esta infraestructura no llama writers existentes,
no cambia sus resultados y no obliga a emitir eventos de capabilities aún no implementadas.

## Acceptance Criteria

1. Existe una tabla database-owned `leadflow_event_registry`, sembrada por migración,
   con exactamente los nombres y contratos schema v1 definidos en este archivo. Cada
   fila contiene como mínimo `event_type`, `schema_version`, `event_class`, `emit_status`,
   `owner_capability`, `allowed_stage`, `payload_contract` e `identity_recipe`. El
   registry es la única fuente de vocabulario, payload e identidad; no se crea un segundo
   registry en TypeScript, SQL o una capability.

2. El seed contiene exactamente una fila para cada nombre adoptado por AD-10:
   `lead_created`, `lead_capture_failed`, `next_action_created`, `next_action_done`,
   `next_action_postponed`, `next_action_ignored`, `next_action_canceled`,
   `inbound_message_received`, `inbound_message_rejected`,
   `inbound_lead_match_ambiguous`, `response_action_upserted`,
   `first_contact_requested`, `first_contact_result`, `push_delivery_scheduled`,
   `push_generated`, `push_service_result`, `push_subscription_activated`,
   `push_subscription_deactivated`, `push_subscription_invalid`, `push_action_taken`,
   `push_action_rejected`, `push_duplicate_suppressed`, `external_effect_claimed`,
   `external_effect_io_started`, `external_effect_result_recorded`,
   `external_effect_retry_scheduled`, `external_effect_canceled`,
   `external_effect_reconciled`, `purchase_decision_recorded` y `audit_correction`.
   `corporate_sync_*` no tiene fila wildcard ni concreta, no es aceptable por el append
   y solo podrá definirse después del gate AD-14 mediante una actualización arquitectónica.

3. `leadflow_events` usa schema v1 y el envelope cerrado siguiente:
   - `id uuid` generado por la base de datos, único;
   - `event_key text` no nulo y único;
   - `user_id uuid` no nulo, derivado exclusivamente de
     `leadflow_installation.advisor_user_id`;
   - `event_type` no nulo, con FK/check contra un registro existente y habilitado;
   - `schema_version smallint not null default 1`, igual a la versión del registry;
   - `occurred_at timestamptz not null`, siempre UTC;
   - `source` no nulo, con uno de `PWA`, `WEBHOOK`, `PUSH`, `SCHEDULER`, `SYSTEM`,
     `LEADFLOW_WHATSAPP_ACCEPTED` o `NATIVE_WHATSAPP_CONFIRMED`;
   - `stage` no nulo y limitado al `allowed_stage` de la fila del registry;
   - `actor_kind` no nulo, con uno de `ADVISOR`, `WEBHOOK`, `SCHEDULER`, `SYSTEM`;
   - `actor_id uuid` nulo solo para `WEBHOOK`, `SCHEDULER` y `SYSTEM`; para
     `ADVISOR` es obligatorio y debe coincidir con el singleton;
   - `correlation_id uuid` nulo y no único;
   - `idempotency_key text` nulo salvo cuando el contrato del evento lo exige;
   - `result` nulo o uno de los enums definidos por el evento;
   - `error_code` nulo o código funcional seguro con formato
     `^[A-Z][A-Z0-9_]{1,63}$`;
   - `aggregate_type`, `aggregate_id` y `aggregate_version` nulos para FACT/ATTEMPT;
     en TRANSITION son obligatorios y deben coincidir exactamente con el mapping del
     registry, con `aggregate_version` entero positivo;
   - `payload jsonb` objeto no nulo, con el shape exacto del registry y sin claves
     adicionales.

   Las combinaciones `source`/`actor_kind` permitidas son `PWA/ADVISOR`,
   `WEBHOOK/WEBHOOK`, `PUSH/ADVISOR`, `SCHEDULER/SCHEDULER`, `SYSTEM/SYSTEM`,
   `LEADFLOW_WHATSAPP_ACCEPTED/WEBHOOK` y `NATIVE_WHATSAPP_CONFIRMED/ADVISOR`.
   Un secreto, cookie, token, credencial, header sensible, raw provider payload,
   request completo, response completo o material equivalente nunca puede aparecer
   en ninguna columna, payload, error o log del append.

4. El registry schema v1 queda cerrado por la siguiente matriz. `REGISTERED_DISABLED`
   es el estado inicial de todas las filas sembradas; E4-S5a no activa ningún evento.
   `owner_capability` es una referencia declarativa a la capability/story dueña de la
   mutación, no una segunda autoridad de ownership ni una autorización para emitir.

| event_type | class | owner_capability | emit_status inicial | allowed_stage | aggregate contract |
| --- | --- | --- | --- | --- | --- |
| `lead_created` | FACT | Epic 1 / captura | REGISTERED_DISABLED | CAPTURE | null |
| `lead_capture_failed` | ATTEMPT | Epic 1 / captura | REGISTERED_DISABLED | CAPTURE | null |
| `next_action_created` | FACT | Epic 1 / acciones | REGISTERED_DISABLED | ACTIONS | null |
| `next_action_done` | TRANSITION | Epic 1 / acciones | REGISTERED_DISABLED | ACTIONS | `FOLLOW_UP_ACTION`, `lead_follow_up_actions.id`, resulting `action_version` |
| `next_action_postponed` | TRANSITION | Epic 1 / acciones | REGISTERED_DISABLED | ACTIONS | `FOLLOW_UP_ACTION`, `lead_follow_up_actions.id`, resulting `action_version` |
| `next_action_ignored` | TRANSITION | Epic 1 / acciones | REGISTERED_DISABLED | ACTIONS | `FOLLOW_UP_ACTION`, `lead_follow_up_actions.id`, resulting `action_version` |
| `next_action_canceled` | TRANSITION | Epic 1 / acciones | REGISTERED_DISABLED | ACTIONS | `FOLLOW_UP_ACTION`, `lead_follow_up_actions.id`, resulting `action_version` |
| `inbound_message_received` | FACT | Epic 2 / inbound | REGISTERED_DISABLED | INBOUND | null |
| `inbound_message_rejected` | FACT | Epic 2 / inbound | REGISTERED_DISABLED | INBOUND | null |
| `inbound_lead_match_ambiguous` | FACT | Epic 2 / inbound | REGISTERED_DISABLED | INBOUND | null |
| `response_action_upserted` | TRANSITION | Epic 2 / inbound | REGISTERED_DISABLED | INBOUND | `FOLLOW_UP_ACTION`, `lead_follow_up_actions.id`, resulting `action_version` |
| `first_contact_requested` | FACT | Epic 3 / first contact | REGISTERED_DISABLED | FIRST_CONTACT | null |
| `first_contact_result` | TRANSITION | Epic 3 / first contact | REGISTERED_DISABLED | FIRST_CONTACT | `LEAD_CONTACT_OPERATION`, `lead_contact_operations.id`, resulting `operation_version` |
| `push_delivery_scheduled` | FACT | Epic 5 / Push | REGISTERED_DISABLED | PUSH | null |
| `push_generated` | TRANSITION | Epic 5 / Push | REGISTERED_DISABLED | PUSH | `PUSH_DELIVERY`, `push_deliveries.id`, resulting `delivery_version` |
| `push_service_result` | TRANSITION | Epic 5 / Push | REGISTERED_DISABLED | PUSH | `PUSH_DELIVERY`, `push_deliveries.id`, resulting `delivery_version` |
| `push_subscription_activated` | TRANSITION | Epic 5 / Push | REGISTERED_DISABLED | PUSH | `PUSH_SUBSCRIPTION`, `push_subscriptions.id`, resulting `subscription_version` |
| `push_subscription_deactivated` | TRANSITION | Epic 5 / Push | REGISTERED_DISABLED | PUSH | `PUSH_SUBSCRIPTION`, `push_subscriptions.id`, resulting `subscription_version` |
| `push_subscription_invalid` | TRANSITION | Epic 5 / Push | REGISTERED_DISABLED | PUSH | `PUSH_SUBSCRIPTION`, `push_subscriptions.id`, resulting `subscription_version` |
| `push_action_taken` | TRANSITION | Epic 5 / Push | REGISTERED_DISABLED | PUSH | `FOLLOW_UP_ACTION`, `lead_follow_up_actions.id`, resulting `action_version` |
| `push_action_rejected` | FACT | Epic 5 / Push | REGISTERED_DISABLED | PUSH | null |
| `push_duplicate_suppressed` | FACT | Epic 5 / Push | REGISTERED_DISABLED | PUSH | null |
| `external_effect_claimed` | TRANSITION | AD-7 Effects ledger | REGISTERED_DISABLED | EXTERNAL_EFFECT | `EXTERNAL_EFFECT`, `external_effects.id`, resulting `effect_version` |
| `external_effect_io_started` | ATTEMPT | AD-7 Effects ledger | REGISTERED_DISABLED | EXTERNAL_EFFECT | null |
| `external_effect_result_recorded` | TRANSITION | AD-7 Effects ledger | REGISTERED_DISABLED | EXTERNAL_EFFECT | `EXTERNAL_EFFECT`, `external_effects.id`, resulting `effect_version` |
| `external_effect_retry_scheduled` | TRANSITION | AD-7 Effects ledger | REGISTERED_DISABLED | EXTERNAL_EFFECT | `EXTERNAL_EFFECT`, `external_effects.id`, resulting `effect_version` |
| `external_effect_canceled` | TRANSITION | AD-7 Effects ledger | REGISTERED_DISABLED | EXTERNAL_EFFECT | `EXTERNAL_EFFECT`, `external_effects.id`, resulting `effect_version` |
| `external_effect_reconciled` | TRANSITION | AD-7 Effects ledger | REGISTERED_DISABLED | EXTERNAL_EFFECT | `EXTERNAL_EFFECT`, `external_effects.id`, resulting `effect_version` |
| `purchase_decision_recorded` | FACT | Epic 6 / purchase decision | REGISTERED_DISABLED | PURCHASE | null |
| `audit_correction` | FACT | Epic 4 / audit | REGISTERED_DISABLED | AUDIT | null |

   Las referencias `aggregate_type`, `aggregate_id` y `aggregate_version` de la
   matriz no son seleccionables por el caller: el registry las deriva del event_type.
   `next_action_canceled` sigue siendo la única transición canónica `CANCELED`.

5. El contrato de payload schema v1 es un objeto cerrado. Los timestamps requeridos
   por PRD se representan por `occurred_at` del envelope; `aggregate_version` representa
   el `action_version`, `operation_version`, `delivery_version`, `subscription_version`
   o `effect_version` indicado por AD-10. Para cada fila, toda clave fuera de Required,
   Optional y de los nombres globales del envelope está prohibida y produce rechazo
   antes del append.

   Tipos comunes: `uuid` es UUID RFC 4122; `timestamp` es ISO/timestamptz UTC;
   `safe_code` cumple `^[A-Z][A-Z0-9_]{1,63}$`; `safe_text` es UTF-8 NFC sin
   caracteres de control y máximo 256 caracteres; `digest_hex` es SHA-256 en 64
   hexadecimales minúsculos; `positive_int` es entero mayor que cero.
   `configuration_digest` se calcula sobre la fila vigente de
   `leadflow_settings` con el orden fijo `id`, `whatsapp_message_template`,
   `seller_name`, `seller_phone`, `seller_email`, `seller_company`, `updated_at`,
   usando la canonicalización length-prefixed de esta story y SHA-256 hex lowercase;
   solo se guarda el digest, nunca esos valores.

| event_type | Required payload | Optional payload | Enums/constraints adicionales |
| --- | --- | --- | --- |
| `lead_created` | `lead_id: uuid`, `models: array<safe_text>`, `phone_validation_result: safe_code` | `lead_source: safe_code` | `models` tiene 1–10 elementos; `lead_source` solo se incluye si está disponible; no se copia el teléfono |
| `lead_capture_failed` | `{}` | `{}` | `idempotency_key` y `stage=CAPTURE` son obligatorios en envelope; `error_code` es obligatorio |
| `next_action_created` | `lead_id: uuid`, `action_type: CALL\|WHATSAPP\|QUOTE\|OTHER\|RESPONSE`, `scheduled_for: timestamp`, `origin: MANUAL\|SUGGESTED` | `{}` | `scheduled_for` es UTC exacto |
| `next_action_done` | `lead_id: uuid`, `action_id: uuid`, `action_type: CALL\|WHATSAPP\|QUOTE\|OTHER\|RESPONSE`, `origin: AUTOMATIC\|MANUAL_CONFIRMATION` | `{}` | versión en `aggregate_version`; `source` conserva `LEADFLOW_WHATSAPP_ACCEPTED` o `NATIVE_WHATSAPP_CONFIRMED` cuando corresponda |
| `next_action_postponed` | `lead_id: uuid`, `action_id: uuid`, `prior_scheduled_for: timestamp`, `new_scheduled_for: timestamp` | `{}` | versión en `aggregate_version`; ambas fechas UTC |
| `next_action_ignored` | `lead_id: uuid`, `action_id: uuid`, `action_type: CALL\|WHATSAPP\|QUOTE\|OTHER\|RESPONSE` | `{}` | fecha/hora en `occurred_at` |
| `next_action_canceled` | `lead_id: uuid`, `action_id: uuid`, `reason: safe_code` | `{}` | actor y fuente se representan en envelope; versión en `aggregate_version` |
| `inbound_message_received` | `lead_id: uuid`, `provider_message_id: safe_text`, `association_status: safe_code`, `classification: NO_SUGGESTION\|PENDING\|REVIEW` | `{}` | no incluye body ni raw provider payload |
| `inbound_message_rejected` | `{}` | `{}` | fingerprint en identity; `error_code` es obligatorio; no puede incluir `lead_id` si no hubo asociación |
| `inbound_lead_match_ambiguous` | `{}` | `{}` | fingerprint en identity; no puede incluir lista de candidatos ni raw callback |
| `response_action_upserted` | `lead_id: uuid`, `action_id: uuid`, `scheduled_for: timestamp`, `classification: NO_SUGGESTION\|PENDING\|REVIEW`, `deduplicated: boolean` | `review_label: Revisar` | `review_label` solo existe cuando `classification=REVIEW`; versión en `aggregate_version` |
| `first_contact_requested` | `lead_id: uuid`, `requested_resources: array<MESSAGE\|PHOTOS\|TECHNICAL_SHEET>`, `configuration_digest: digest_hex` | `{}` | array sin duplicados; no guarda template, configuración ni recursos crudos |
| `first_contact_result` | `lead_id: uuid`, `resource_results: array<{resource: MESSAGE\|PHOTOS\|TECHNICAL_SHEET, result: ACCEPTED\|FAILED\|UNKNOWN\|NOT_AVAILABLE, provider_message_id?: safe_text}>` | `{}` | `resource_results` es la única fuente del resultado; `result` del envelope es NULL/ausente; `provider_message_id` es obligatorio dentro del recurso cuando ese recurso es `ACCEPTED` y el proveedor entrega un ID verificable, y permanece ausente/null para `FAILED`, `UNKNOWN` o `NOT_AVAILABLE` cuando no existe un ID verificable; no se inventan IDs |
| `push_delivery_scheduled` | `lead_id: uuid`, `action_id: uuid`, `action_version: positive_int`, `subscription_id: uuid`, `subscription_generation: positive_int`, `scheduled_for: timestamp`, `materialized_at: timestamp` | `{}` | identidad canónica exacta de AD-9; no afirma entrega física ni lectura |
| `push_generated` | `lead_id: uuid`, `action_id: uuid`, `action_version: positive_int`, `subscription_id: uuid`, `subscription_generation: positive_int`, `scheduled_for: timestamp`, `delivery_type: safe_code` | `{}` | versión en `aggregate_version`; no incluye payload Push ni tokens |
| `push_service_result` | `action_id: uuid`, `action_version: positive_int`, `subscription_id: uuid`, `subscription_generation: positive_int`, `provider: safe_code` | `{}` | `result` del envelope es `ACCEPTED\|REJECTED\|UNKNOWN`; `error_code` solo si corresponde |
| `push_subscription_activated` | `{}` | `{}` | `aggregate_id` es `push_subscriptions.id`; versión en `aggregate_version` |
| `push_subscription_deactivated` | `{}` | `{}` | `aggregate_id` es `push_subscriptions.id`; versión en `aggregate_version` |
| `push_subscription_invalid` | `cause: safe_code` | `{}` | `aggregate_id` es `push_subscriptions.id`; versión en `aggregate_version` |
| `push_action_taken` | `action_id: uuid`, `command: DONE\|IGNORE\|POSTPONE_PLUS_ONE_HOUR\|POSTPONE_LATER\|POSTPONE_TOMORROW\|POSTPONE_IN_THREE_DAYS` | `{}` | versión en `aggregate_version`; actor humano en envelope |
| `push_action_rejected` | `capability_row_id: uuid` | `{}` | `result` del envelope es `STALE_ACTION\|EXPIRED_CAPABILITY` |
| `push_duplicate_suppressed` | `action_id: uuid`, `action_version: positive_int`, `subscription_id: uuid`, `subscription_generation: positive_int`, `reason: safe_code` | `{}` | identity incluye `delivery_identity_digest`, calculado sobre la tupla canónica de AD-9 |
| `external_effect_claimed` | `{}` | `{}` | `result=CLAIMED`; aggregate según AD-7/AD-10 |
| `external_effect_io_started` | `effect_id: uuid`, `attempt_no: positive_int` | `{}` | identity incluye literal `BEGIN_IO`; no usa aggregate fields |
| `external_effect_result_recorded` | `{}` | `provider: safe_code` | `result=ACCEPTED\|REJECTED_TERMINAL\|UNKNOWN`; `FAILED`, `REJECTED`, `RETRYABLE` y `CANCELED` no son válidos en este event_type; `error_code` solo si corresponde |
| `external_effect_retry_scheduled` | `{}` | `{}` | `result=RETRYABLE`; no puede resetear evidencia previa |
| `external_effect_canceled` | `{}` | `{}` | `result=CANCELED`; aggregate según AD-7/AD-10 |
| `external_effect_reconciled` | `{}` | `provider: safe_code` | `result=ACCEPTED\|REJECTED_TERMINAL`; aggregate según AD-7/AD-10 |
| `purchase_decision_recorded` | `lead_id: uuid`, `milestone_id: uuid`, `origin: MANUAL` | `{}` | identity usa `milestone_id`; no infiere decisión desde chat/webhook/score |
| `audit_correction` | `correction_id: uuid`, `superseded_event_id: uuid` | `{}` | no modifica el evento superseded; ambos UUID deben existir según la política de corrección |

   En todos los payloads, cualquier clave adicional, texto sin necesidad contractual,
   teléfono, nombre, nota libre, body de mensaje, token, cookie, header, credencial,
   URL firmada, secreto, request/response completo o payload crudo de proveedor queda
   prohibido. Los valores de error y provider son códigos/identificadores seguros,
   nunca respuestas crudas.

6. La identidad y `event_key` son reproducibles. El registry almacena la tupla ordenada
   indicada abajo; el caller no puede sustituir, agregar ni reordenar componentes.

| event_type | Ordered identity components after `event_type` |
| --- | --- |
| `lead_created` | `lead_id: uuid` |
| `lead_capture_failed` | `idempotency_key: text`, `stage: CAPTURE` |
| `next_action_created` | `action_id: uuid` |
| `next_action_done`, `next_action_postponed`, `next_action_ignored`, `next_action_canceled`, `response_action_upserted`, `push_action_taken` | `aggregate_type` fijo `FOLLOW_UP_ACTION`, `aggregate_id: uuid`, `aggregate_version: positive_int` |
| `inbound_message_received` | `message_id: uuid` (`lead_messages.id`) |
| `inbound_message_rejected`, `inbound_lead_match_ambiguous` | `evolution_instance_canonical: safe_text`, `fingerprint_kind: PROVIDER_MESSAGE_ID\|RAW_BODY_SHA256`, `fingerprint_value: safe_text\|digest_hex` |
| `first_contact_requested` | `operation_id: uuid` (`lead_contact_operations.id`) |
| `push_delivery_scheduled` | `delivery_id: uuid` (`push_deliveries.id`) |
| `push_generated`, `push_service_result` | `aggregate_type` fijo `PUSH_DELIVERY`, `aggregate_id: uuid`, `aggregate_version: positive_int` |
| `push_subscription_activated`, `push_subscription_deactivated`, `push_subscription_invalid` | `aggregate_type` fijo `PUSH_SUBSCRIPTION`, `aggregate_id: uuid`, `aggregate_version: positive_int` |
| `push_action_rejected` | `capability_row_id: uuid`, `result: STALE_ACTION\|EXPIRED_CAPABILITY` |
| `push_duplicate_suppressed` | `delivery_identity_digest: digest_hex` |
| `external_effect_claimed`, `external_effect_result_recorded`, `external_effect_retry_scheduled`, `external_effect_canceled`, `external_effect_reconciled` | `aggregate_type` fijo `EXTERNAL_EFFECT`, `aggregate_id: uuid`, `aggregate_version: positive_int` |
| `external_effect_io_started` | `effect_id: uuid`, `attempt_no: positive_int`, `marker: BEGIN_IO` |
| `purchase_decision_recorded` | `milestone_id: uuid` (`lead_milestones.id`) |
| `audit_correction` | `correction_id: uuid`, `superseded_event_id: uuid` |

   Para los callbacks Evolution, el fingerprint se calcula antes de construir el
   `event_key` y tiene una receta cerrada. `evolution_instance` se convierte a
   `evolution_instance_canonical` aplicando Unicode NFC y retirando únicamente
   espacios ASCII U+0020 al inicio y al final; se conserva exactamente el case y
   todo carácter interno, no se aplica lowercasing, aliasing, transliteración ni
   otra normalización. Después de esa operación el valor debe ser UTF-8 no vacío,
   sin caracteres de control y con el contrato `safe_text`; cualquier otra entrada
   se rechaza.

   Si `provider_message_id` existe, es válido cuando, tras aplicar Unicode NFC y
   retirar únicamente espacios ASCII U+0020 al inicio y al final, queda no vacío,
   UTF-8, sin caracteres de control y dentro de `safe_text`. Su representación
   canónica conserva case y caracteres internos exactamente y se usa como
   `fingerprint_kind=PROVIDER_MESSAGE_ID` y
   `fingerprint_value=provider_message_id_canonical`.

   Si `provider_message_id` falta, es nulo o no es válido, el receptor captura los
   bytes exactos del raw request body antes de parsear JSON. Debe poder interpretar
   esos bytes como UTF-8; calcula SHA-256 directamente sobre esos bytes, sin
   parsear y reserializar JSON, sin ordenar claves y sin aplicar un cuerpo
   normalizado. El digest hexadecimal lowercase de 64 caracteres se usa como
   `fingerprint_kind=RAW_BODY_SHA256` y `fingerprint_value=raw_body_sha256_hex`.
   El raw body y el provider ID no se persisten en el payload.

   Por tanto, los identity components exactos del callback, en este orden y antes
   de la receta común de `event_key`, son:
   `event_type`, `schema_version=1`, `evolution_instance_canonical`,
   `fingerprint_kind` y `fingerprint_value`. QA puede reproducir el fingerprint y
   el `event_key` con la misma instancia, provider ID válido o los mismos bytes
   UTF-8 del raw body; dos bodies JSON byte-diferentes producen digests distintos
   aunque su contenido parseado sea equivalente.

   La canonicalización es única para todos los eventos:

   1. Validar que no falte ningún componente requerido. Ausencia y `null` no son
      equivalentes: un componente no nullable ausente rechaza el append; solo un
      componente declarado nullable puede usar el marcador `NULL`.
   2. Normalizar nombres de enum a su token ASCII uppercase exacto. Normalizar UUID a
      RFC 4122 lowercase con guiones y sin braces. Normalizar texto a Unicode NFC y
      UTF-8, sin trim implícito ni cambio de case adicional al normalizador definido
      por la capability; para callbacks se aplican exclusivamente las reglas
      explícitas de `evolution_instance_canonical` y
      `provider_message_id_canonical` anteriores. Serializar enteros en decimal
      ASCII sin ceros iniciales.
   3. Construir, en el orden de la tabla, campos length-prefixed:
      `name=<UTF8-byte-length>:<canonical-value>;`. Para `NULL`, usar exactamente
      `name=4:NULL;`. No se usan objetos JSON, orden de propiedades implícito ni
      delimitadores ambiguos.
   4. Construir el material UTF-8 exacto:
      `leadflow-event-key/v1|event_type=<event_type>|schema_version=1|<components>`.
   5. Calcular SHA-256 sobre esos bytes y codificar en hex lowercase de 64 caracteres.
      Ese string es `event_key`; no se aceptan otras codificaciones, hashes o prefijos.

   El `delivery_identity_digest` de `push_duplicate_suppressed` usa la misma receta
   sobre la tupla ordenada `(action_id, action_version, subscription_id,
   subscription_generation)` con framing `leadflow-delivery-identity/v1` antes de
   aplicar SHA-256 hex lowercase.

7. El append port/RPC aplica estas tres semánticas con una única constraint de
   `event_key` y sin UPDATE del evento previo:

   - identidad nueva: valida registry, estado `ENABLED`, envelope, payload, identidad
     y owner; inserta exactamente una fila;
   - replay equivalente: misma `event_key` y todos los campos inmutables/payload
     contractualmente equivalentes; devuelve el `id` y envelope existente, sin nueva
     fila ni UPDATE;
   - conflicto: misma `event_key` pero cualquier campo inmutable, resultado, error,
     aggregate, actor, timestamp o payload contractualmente incompatible; devuelve un
     resultado funcional determinista `EVENT_KEY_CONFLICT`, no inserta otra fila y no
     modifica el evento existente.

   Un replay con diferente `correlation_id` no cambia la equivalencia: correlation es
   trazabilidad y no identidad. La comparación de equivalencia usa la representación
   canónica schema v1, no el orden accidental del JSON recibido.

8. Registry y emitibilidad están separados. `REGISTERED_DISABLED` significa que el
   nombre, clase, schema, payload e identidad son conocidos pero el append debe
   rechazarlo con `EVENT_TYPE_DISABLED`. `ENABLED` significa que la capability dueña
   ya autorizó la emisión después de satisfacer sus dependencias. La transición de
   estado exige el `owner_capability`/story ref registrado y no puede ser ejecutada
   por un owner distinto; E4-S5a solo define este mecanismo y deja todas las filas
   en `REGISTERED_DISABLED`.

   Ninguna fila de Push, external effects, purchase, acciones/reglas aún no
   implementadas o WhatsApp futuro queda `ENABLED` en esta story. La capability/story
   dueña debe habilitar su propio evento en su migración/RPC, sin alterar la identidad
   ni payload contractuales del registry. `corporate_sync_*` no se registra, no tiene
   estado habilitable y sigue bloqueado por AD-14.

9. El perímetro mínimo de escritura es server-side: browser/client y `anon` no pueden
   insertar ni invocar directamente el append port; solo un RPC/append port server-side
   autorizado por el owning capability puede crear eventos y deriva `user_id` desde
   `leadflow_installation`. Los roles runtime no tienen UPDATE ni DELETE sobre
   `leadflow_events`; una corrección histórica solo agrega `audit_correction`.

   E4-S5a fija este contrato mínimo de escritura y no aplica la matriz final de
   lectura/RLS/grants. E4-S7 define la matriz completa de actores y grants, incluyendo
   lectura; E4-S8 aplica el enforcement final del cutover. Hasta esas stories no se
   abre lectura runtime al browser/anon ni se convierte el registry en una superficie
   pública. No se adelantan RLS final, cutover, backfill ni revocaciones pertenecientes
   a esas stories.

10. La infraestructura es brownfield-compatible: la migración es aditiva, no modifica
    tablas, policies ni writers actuales de leads, mensajes, acciones o settings, y
    ninguna capability existente empieza a emitir eventos por efecto de crear el
    registry. Las futuras stories pueden conectar sus owning RPCs al append port sin
    duplicar recetas ni crear máquinas de estado paralelas.

## Tasks / Subtasks

- [ ] Crear migración aditiva para registry, envelope, constraints, índices y el mínimo
      perímetro de escritura append-only.
- [ ] Sembrar exactamente las filas schema v1 y dejarlas en `REGISTERED_DISABLED`.
- [ ] Crear `lib/events` con un único contrato TypeScript/SQL, validator de payload y
      canonicalizador de identity components/event_key.
- [ ] Implementar el append port/RPC con validación registry, rechazo disabled,
      unicidad, replay equivalente y `EVENT_KEY_CONFLICT` sin UPDATE.
- [ ] Añadir fixtures de FACT, ATTEMPT y TRANSITION que cubran cada clase, cada forma
      de aggregate, payload inválido, secreto/raw payload, evento no registrado,
      `REGISTERED_DISABLED`, replay y conflicto.
- [ ] Documentar que `corporate_sync_*` no tiene fila ni ruta de habilitación.

## Dev Notes

- Las transiciones de acciones usan `FOLLOW_UP_ACTION` y la versión resultante;
  `push_generated`/`push_service_result` usan `PUSH_DELIVERY` y `delivery_version`;
  las transiciones de suscripción usan `PUSH_SUBSCRIPTION` y
  `subscription_version`; external effects usa `EXTERNAL_EFFECT` y `effect_version`.
- `next_action_canceled` es el evento canónico de la transición `CANCELED`; no crear
  otra máquina de estados ni un evento paralelo de eliminación.
- La cadena Push conserva la autoridad arquitectónica:
  `push_delivery_scheduled → push_generated → push_service_result`. Esta story no
  afirma entrega física ni lectura.
- `lead_capture_failed` usa la combinación exacta de command `idempotency_key` y
  `stage=CAPTURE` del mapping AD-10; no genera un idempotency key aleatorio.
- `inbound_message_rejected` e `inbound_lead_match_ambiguous` usan el fingerprint
  seguro definido arriba: `PROVIDER_MESSAGE_ID` con el provider ID canónico válido,
  o `RAW_BODY_SHA256` sobre los bytes UTF-8 exactos del raw request body cuando el
  ID falta, es nulo o es inválido. Nunca se parsea/reserializa el cuerpo para el
  hash y nunca se persiste el cuerpo en el evento.
- El registry es infraestructura. La instrumentación de cada capability y la
  activación de sus eventos se implementarán en sus épicas/stories dueñas.

### Testing Requirements

- Verificar exactamente una fila por cada nombre AD-10, cero filas `corporate_sync_*`
  y todos los estados iniciales `REGISTERED_DISABLED`.
- Verificar por fixture que cada clase admite/rechaza exactamente los campos de
  aggregate indicados; FACT/ATTEMPT con aggregate o TRANSITION sin aggregate fallan.
- Verificar schema v1, stage, source/actor pair, campos requeridos, enums, additional
  properties, códigos seguros y prohibiciones de secretos/raw payload.
- Verificar que `source` acepte únicamente los tokens canónicos definidos en el
  envelope y que `action_type` acepte `CALL`, `WHATSAPP`, `QUOTE`, `OTHER` y
  `RESPONSE`, rechazando aliases o traducciones.
- Verificar `first_contact_result` con estados por recurso, `result` del envelope
  nulo/ausente y sin agregación global; verificar el `provider_message_id` condicional
  de cada recurso y que `push_service_result` rechace un provider ausente.
- Verificar que `external_effect_result_recorded` acepte solo
  `ACCEPTED`, `REJECTED_TERMINAL` y `UNKNOWN`, y rechace los estados asignados a
  otras transiciones.
- Reproducir `event_key` desde cada tuple con UTF-8, UUID lowercase, enums, null y
  length-prefix; el resultado debe coincidir byte por byte con la fila.
- Reproducir los fingerprints de callback con la misma instancia y el mismo
  provider ID válido o los mismos bytes del raw request body; verificar que no se
  parsea/reserializa JSON y que un ID inválido cae determinísticamente a
  `RAW_BODY_SHA256`.
- Verificar identidad nueva, replay equivalente sin segunda fila y conflicto
  `EVENT_KEY_CONFLICT` sin UPDATE ni cambio de la fila previa.
- Intentar insertar desde browser/anon, invocar un event disabled y usar
  `corporate_sync_test`: cada caso debe rechazar sin persistencia.
- Verificar que la creación de la infraestructura no llama writers brownfield ni
  cambia filas de las tablas existentes.

### Scope Guardrails

- No modificar la lógica de clasificación, matching, convergencia, WhatsApp, Push,
  external effects, compra o sincronización corporativa.
- No implementar instrumentación completa de mutations; esa frontera es E4-S5b y las
  capabilities dueñas.
- No implementar RLS final, cutover, backfill, login, webhook refactor, Push worker,
  Effects ledger, compra ni adapter/worker corporativo.
- No hacer emitibles eventos de capacidades futuras para fabricar PASS.
- No añadir tablas, eventos o infraestructura de Epic 7 antes de AD-14.

### References

- [Source: _bmad-output/planning-artifacts/architecture/architecture-lead-flow-2026-08-06/ARCHITECTURE-SPINE.md#AD-10]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-lead-flow-2026-08-06/ARCHITECTURE-SPINE.md#AD-6]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-lead-flow-2026-08-06/ARCHITECTURE-SPINE.md#AD-7]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-lead-flow-2026-08-06/ARCHITECTURE-SPINE.md#AD-9]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-lead-flow-2026-08-06/ARCHITECTURE-SPINE.md#AD-12]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-lead-flow-2026-08-06/ARCHITECTURE-SPINE.md#AD-14]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-lead-flow-2026-08-06/ARCHITECTURE-SPINE.md#Structural-Seed]
- [Source: _bmad-output/planning-artifacts/prds/prd-lead-flow-2026-08-05/prd.md#6-Instrumentación-sin-carga-administrativa]
- [Source: _bmad-output/planning-artifacts/epics.md#Instrumentación]
- [Source: _bmad-output/project-context.md#Critical-Implementation-Rules]
- [Source: supabase/migrations/001_leadflow_core_schema.sql]
- [Source: supabase/migrations/003_leadflow_follow_up_and_messages.sql]
- [Source: supabase/migrations/004_leadflow_follow_up_actions.sql]
- [Source: supabase/migrations/006_leadflow_persistent_config_realtime_and_soft_delete.sql]
- [Source: supabase/migrations/008_soft_delete_lead_rpc.sql]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
