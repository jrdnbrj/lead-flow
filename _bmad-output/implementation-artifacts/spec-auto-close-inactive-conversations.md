---
title: 'Cierre automático de conversaciones inactivas'
type: 'feature'
created: '2026-09-11'
status: 'done'
baseline_commit: 'acfddea'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Las conversaciones que permanecen en `ACTIVE` más de cinco días sin actividad siguen apareciendo como activas aunque ya no requieran atención. Deben cerrarse automáticamente, pero nunca mientras exista una acción de seguimiento abierta.

**Approach:** Agregar una operación server-side idempotente de mantenimiento que cierre sólo conversaciones elegibles y reutilizar el scheduler interno existente como disparador periódico. La operación bloqueará primero el lead, comprobará acciones abiertas y actualizará el estado en una transacción corta.

## Boundaries & Constraints

**Always:** Usar `last_activity_at` como actividad autoritativa; considerar activas únicamente acciones `PENDING` o `POSTPONED`; aplicar exactamente 5 × 24 horas desde la última actividad; ignorar leads eliminados y estados distintos de `ACTIVE`; mantener ownership singleton y lock order lead → action; una nueva respuesta o acción concurrente debe conservar prioridad sobre el cierre. Al reabrir manualmente, registrar ese momento como actividad para no cerrar inmediatamente la conversación.

**Ask First:** Ninguna decisión adicional: el disparador será el scheduler interno existente, sin crear otro cron ni depender de una visita del asesor al dashboard.

**Never:** No cambiar `leads.status`, acciones, Push, WhatsApp/reminders, Evolution, mensajes, scoring, paginación, UI de creación, esquema de estados ni migraciones históricas. No cerrar por `updated_at`, por antigüedad del lead, por ausencia de mensajes inferida ni si `last_activity_at` es nulo.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| STALE_NO_ACTIONS | `ACTIVE`, `last_activity_at <= now - 5d`, sin `PENDING/POSTPONED` | Persistir `CLOSED` | Contar/loguear fallo; no false-success |
| STALE_OPEN_ACTION | Misma antigüedad, una acción abierta | No cambiar conversación | Se reevalúa en el siguiente ciclo |
| RECENT | Actividad menor a 5 días | No cambiar | N/A |
| NULL_ACTIVITY | `ACTIVE`, actividad nula | No cambiar | Fail closed |
| CONCURRENT_ACTIVITY | Respuesta o acción mientras se evalúa | La actualización concurrente prevalece; no dejar cierre incorrecto | Lock order consistente; retry del scheduler |

</frozen-after-approval>

## Code Map

- `supabase/migrations/079_auto_close_inactive_conversations.sql` -- RPC service-role, validación, lock y actualización atómica.
- `app/api/internal/whatsapp-reminders/dispatch/route.ts` -- invocación del mantenimiento desde el scheduler autenticado; no altera el envío de recordatorios.
- `lib/leads/repository.ts` -- al reabrir, registrar `last_activity_at` y conservar ownership server-side.
- `scripts/auto-close-conversation-contract-check.mjs` -- contrato estático y simulación de límites.
- `scripts/ci-contract-checks.sh` -- incluir el contrato en el gate existente.

## Tasks & Acceptance

**Execution:**
- [x] `supabase/migrations/079_auto_close_inactive_conversations.sql` -- crear RPC forward-only con grant exclusivo a `service_role` -- cerrar sólo leads elegibles sin mutar acciones.
- [x] `app/api/internal/whatsapp-reminders/dispatch/route.ts` -- llamar el RPC una vez por ciclo, antes del trabajo de provider -- mantener el mantenimiento independiente del envío.
- [x] `lib/leads/repository.ts` -- tratar reapertura como actividad reciente -- evitar cierre inmediato tras una acción explícita del asesor.
- [x] `scripts/auto-close-conversation-contract-check.mjs`, `scripts/ci-contract-checks.sh` -- proteger la regla y regresiones.

**Acceptance Criteria:**
- Given una conversación `ACTIVE` con última actividad de hace más de 5 días y sin acciones `PENDING/POSTPONED`, when corre el scheduler, then queda `CLOSED`.
- Given cualquier acción `PENDING` o `POSTPONED`, when corre el scheduler, then la conversación no se cierra.
- Given actividad reciente, `last_activity_at` nulo, lead eliminado o estado no `ACTIVE`, when corre el scheduler, then no hay cambio.
- Given nueva actividad o creación de acción concurrente, when compite con el mantenimiento, then no queda una conversación cerrada indebidamente.
- Given el asesor reabre una conversación, when corre el siguiente ciclo, then permanece abierta durante cinco días desde esa reapertura.
- Given el RPC falla, when termina el ciclo, then el scheduler registra el fallo sin tocar Evolution ni enviar mensajes.

## Design Notes

La migración debe usar una función `SECURITY DEFINER` con `search_path` explícito, revocar acceso público y conceder sólo a `service_role`. El RPC bloquea el lead antes de consultar acciones, igual que los comandos actuales de seguimiento; así se evita que una acción creada después de la comprobación deje un lead cerrado con seguimiento abierto. No habrá backfill: el primer ciclo procesa sólo datos que ya cumplan la regla.

## Verification

**Commands:**
- `node scripts/auto-close-conversation-contract-check.mjs` -- PASS para límites, acciones abiertas, ownership y concurrencia modelada.
- `npm run typecheck`, `npm run lint`, `npm run build`, `bash scripts/ci-contract-checks.sh`, `git diff --check` -- sin regresiones.
- `docker compose up -d --build leadflow` y `/api/health` -- Docker local healthy.

## Suggested Review Order

**Mantenimiento persistente y concurrencia**

- La RPC limita el cierre por dueño, antigüedad, estado y ausencia de acciones abiertas.
  [`079_auto_close_inactive_conversations.sql:7`](../../supabase/migrations/079_auto_close_inactive_conversations.sql#L7)

- El lock del lead conserva el orden usado por los comandos de seguimiento existentes.
  [`079_auto_close_inactive_conversations.sql:29`](../../supabase/migrations/079_auto_close_inactive_conversations.sql#L29)

**Disparador y actividad manual**

- El scheduler ejecuta mantenimiento sin bloquear ni alterar el envío de recordatorios.
  [`route.ts:178`](../../app/api/internal/whatsapp-reminders/dispatch/route.ts#L178)

- Reabrir una conversación renueva su actividad para evitar cierre inmediato.
  [`repository.ts:1261`](../../lib/leads/repository.ts#L1261)

**Contratos y regresión**

- El contrato cubre límites temporales, acciones abiertas, estados y leads eliminados.
  [`auto-close-conversation-contract-check.mjs:11`](../../scripts/auto-close-conversation-contract-check.mjs#L11)

- El nuevo guard queda incluido en la suite de contratos CI.
  [`ci-contract-checks.sh:42`](../../scripts/ci-contract-checks.sh#L42)
