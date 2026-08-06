# Revisión adversarial de certificación — LeadFlow

## Veredicto

**FAIL — no finalizar todavía.** El lint mecánico pasa con 0 hallazgos y los contratos de ownership, fencing y concurrencia están mucho más cerrados, pero aún pueden construirse implementaciones obedientes al texto que divergen en duplicación de Push, cancelación concurrente de efectos, reintentos de transporte, identidad de eventos y continuidad del webhook durante el corte de Auth.

**Conteo:** 0 críticos, 5 altos, 6 medios.

## Hallazgos altos

### 1. La identidad de una suscripción Push no impide endpoints activos duplicados

AD-9 promete prevenir endpoints duplicados, pero solo fija la identidad de `push_deliveries`; no define una identidad canónica ni una restricción única para `push_subscriptions`. Una implementación puede reactivar por `subscription_id`, mientras otra inserta una fila nueva ante cada llamada de `subscribe()`. Ambas incrementan `subscription_generation`, usan los RPC de ciclo de vida y cumplen el postcondition acción × suscripción activa, pero la segunda materializa dos entregas para el mismo endpoint y produce dos notificaciones.

Para cerrar el hueco, el spine debe fijar un `endpoint_fingerprint` determinístico y no reversible, su alcance de unicidad, el RPC de upsert y la regla exacta que decide rotación de generación frente a creación de una suscripción distinta. La unicidad no puede depender del endpoint cifrado aleatoriamente.

### 2. “Unsent” contradice el punto de no retorno de `begin_effect_io_v1`

AD-7 convierte el commit de `request_started_at` en el fence irreversible: después de él el efecto solo puede terminar en evidencia definitiva o `UNKNOWN`. AD-9, sin embargo, ordena que una transición terminal cancele todo delivery/effect “unsent”. Entre el commit de `begin_effect_io_v1` y el primer byte de red, el intento está literalmente no enviado pero ya cruzó el fence. Una implementación puede cancelarlo por ausencia de resultado del proveedor; otra puede conservarlo como iniciado. La primera permite que el worker envíe después de que la base registró cancelación, dejando estado y realidad externa incompatibles.

El contrato debe definir `unstarted` exclusivamente como `request_started_at IS NULL`; un intento iniciado nunca se cancela. Una transición terminal posterior debe invalidar capacidades, conservar el intento como `CLAIMED`/`UNKNOWN` hasta resultado o reconciliación y aceptar que una notificación ya autorizada puede llegar con comandos posteriormente rechazados como stale.

### 3. El fence no gobierna reintentos internos del cliente HTTP o SDK

AD-7 exige un `begin_effect_io_v1` antes de la operación de red, pero no prohíbe que una biblioteca haga dos solicitudes físicas dentro de esa única operación lógica. Un adapter con `fetch` sin retry y otro con retry automático del SDK pueden ambos llamar una vez al fence y considerarse conformes; el segundo puede duplicar WhatsApp o Push después de un timeout ambiguo.

El spine debe exigir cero reintentos automáticos de transporte después del fence, salvo cuando cada solicitud reutilice una clave de idempotencia remota documentada y verificada. Cada nueva solicitud física sin esa garantía debe requerir una nueva tentativa permitida por la máquina AD-7; timeout, desconexión o respuesta perdida después del fence terminan en `UNKNOWN`, no en retry local.

### 4. Las identidades de eventos `FACT` y `ATTEMPT` no están cerradas

AD-10 cierra los mappings de `TRANSITION`, pero deja `stable_fact_id` y la identidad de varios `ATTEMPT` como conceptos sin columna ni mapping por evento. Por ejemplo, `push_subscription_activated` puede usar `subscription_id` y suprimir reactivaciones futuras, o `(subscription_id, subscription_generation)` y registrar cada generación; `inbound_message_rejected` puede usar callback fingerprint o correlation ID; `lead_capture_failed` puede usar idempotency key o cada intento. Todas esas variantes respetan la tabla actual y producen métricas/auditorías incompatibles.

El registry debe fijar para cada `FACT` y `ATTEMPT` la entidad/operación estable, los componentes exactos de `event_key`, el stage permitido y la conducta de replay. También debe decir si la inserción inicial de una acción `RESPONSE` emite simultáneamente `next_action_created` y `response_action_upserted`, y qué eventos adicionales acompañan una reconciliación que cambia una proyección de delivery.

### 5. El corte Auth/RLS no preserva de forma vinculante callbacks recibidos durante mantenimiento

AD-3 cierra escrituras y exige probar el webhook antes de reabrir, pero no decide qué ocurre con callbacks de Evolution que llegan mientras el corte está activo. Una implementación puede responder 503 confiando en reintentos del proveedor; otra puede responder 200 sin persistir para evitar una tormenta; una tercera puede dejar entrar solo el webhook. Las tres son compatibles con “write maintenance”, pero solo algunas preservan mensajes y estados.

Antes de certificar el corte debe fijarse un protocolo verificable: pausar/quiescer el origen, confirmar una política de retry de Evolution que cubra la ventana, o persistir callbacks en una bandeja durable compatible antes del cierre. También debe definir el código HTTP durante mantenimiento, la condición de drenaje y la prueba de que ningún callback aceptado se perdió.

## Hallazgos medios

1. `external_effects.next_attempt_at` y `RETRYABLE` existen, pero no hay contrato para clasificar rechazo definitivo no aceptado frente a retryable, número máximo de intentos, backoff ni transición a revisión manual. Dos adapters pueden dejar el mismo fallo terminal, reintentarlo indefinidamente o reintentarlo una vez.

2. Un timeout del cliente al llamar `prepare_push_capabilities_v1` puede ocurrir después del commit. Como los tokens crudos no se persisten, el worker no puede reconstruir el payload cuya huella quedó sellada. El contrato debe ordenar que se abandone el intento hasta reaper —sin regenerar tokens sobre la misma tentativa— y fijar el resultado funcional de una preparación duplicada.

3. Un capability expirado registra `EXPIRED_CAPABILITY`, pero el texto no decide si queda consumido/terminal ni cuál es la identidad única de ese rechazo. Replays del mismo token pueden generar eventos repetidos o resultados diferentes sin cambiar la acción.

4. AD-3 valida que cada referencia de `leadflow_events` pertenezca al singleton, pero no exige coherencia entre referencias del mismo evento. En el piloto todos los leads tienen el mismo owner, así que un evento puede combinar `lead_id` de un lead con `action_id` o `push_delivery_id` de otro y todavía superar la validación de ownership.

5. AD-6 dice que toda mutación de acción del asesor lleva `expected_action_version`, pero no exceptúa de forma explícita la creación inicial de una acción. Un constructor puede inventar una versión esperada para create y otro omitirla; el contrato debe distinguir create de transitions sobre una identidad existente.

6. La clave única de `external_effect_attempt_observations` se describe solo como “stable provider-observation key”. Sin fijar su composición por provider y clase de observación, callbacks equivalentes pueden deduplicarse por request ID, provider status ID, payload digest o correlation ID, produciendo historiales distintos aunque el estado lógico permanezca protegido.

## Construcciones incompatibles demostradas

| Área | Implementación A | Implementación B | Resultado incompatible |
| --- | --- | --- | --- |
| Suscripción Push | Upsert por huella de endpoint | Insert por cada alta del navegador | Una vs. varias notificaciones al mismo endpoint |
| Cierre de acción | Solo cancela `request_started_at IS NULL` | Cancela cualquier intento sin resultado | Estado `UNKNOWN/ACCEPTED` vs. `CANCELED` para un envío que puede ocurrir |
| Provider I/O | Sin retries internos | SDK con retry automático tras timeout | Una vs. varias solicitudes físicas bajo un solo fence |
| Evento de reactivación | Fact ID = subscription UUID | Fact ID = subscription UUID + generation | Una activación histórica vs. una por generación |
| Mantenimiento Auth | 503 con retry comprobado | 200 sin persistencia para mantener disponibilidad | Callback preservado vs. perdido |

## Certificación

No hay un bloqueo mecánico ni un crítico nuevo. La certificación adversarial queda retenida por los cinco huecos altos anteriores. El spine puede pasar cuando cada uno se convierta en una regla verificable y el lint/review se repitan sobre la nueva versión.
