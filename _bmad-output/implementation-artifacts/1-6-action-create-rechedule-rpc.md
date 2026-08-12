# E1-S6: RPC de creación y reprogramación de acciones

Status: done

## Acceptance Criteria

- `create_lead_follow_up_action_v1` valida owner, lead activo, fecha, nota e idempotency key.
- Crea acciones manuales en versión 1 y reprograma acciones abiertas incrementando la versión.
- Usa lock order lead → action.
- Actualiza la proyección mediante la transacción/trigger existente.
- Emite `next_action_created` o `next_action_postponed` en la misma transacción.
- Replays devuelven el resultado persistido sin duplicar acción ni evento.
- No incluye Push, inbound ni adapters de E1-S8.

## Validation

- Contract/static assertions: PASS
- Typecheck: PASS
- `git diff --check`: PASS

## Runtime Validation

DEFERRED_RUNTIME_VALIDATION: ejecución de migración, Auth/RLS remoto y base de datos remota.
