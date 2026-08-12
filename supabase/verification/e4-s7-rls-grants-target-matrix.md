# E4-S7 RLS, grants y actores — matriz objetivo

Versión: 1.0
Fecha: 2026-08-11
Alcance: preparación de Phase B; esta story no revoca grants ni modifica policies.

## Actores

| Actor | Phase A observado | Phase B objetivo |
|---|---|---|
| `anon` | Compatibilidad temporal donde las migraciones 001–009 la conceden | Sin SELECT/INSERT/UPDATE/DELETE en datos privados |
| `authenticated` | Ownership por `auth.uid()` donde existe | Solo el grafo del singleton y sus relaciones |
| server privilegiado | Operaciones server-side existentes | Solo entrypoints internos y RPCs versionados |
| webhook token | Callback sin sesión humana | Deriva owner desde configuración, nunca del payload |
| scheduler autenticado | No ampliado por E4-S7 | Solo contratos explícitos; fuera de alcance si no existe |

## Matriz cerrada

| Objeto | Operación | anon | authenticated | server | webhook | scheduler | Phase B |
|---|---|---:|---:|---:|---:|---:|---|
| `leads` | SELECT/INSERT/UPDATE/DELETE | NO | owner | interno | NO directo | NO | privado por `auth.uid()` |
| `lead_messages` | SELECT/INSERT/UPDATE | compatibilidad observada | owner | interno | token + owner derivado | NO | privado |
| `lead_follow_up_actions` | SELECT/INSERT/UPDATE/DELETE | compatibilidad observada | owner | interno | NO directo | NO | privado |
| `leadflow_settings` | SELECT/UPDATE | NO | singleton owner | interno | NO directo | NO | privado |
| `leadflow_events` | INSERT-only contractual | NO | NO | append autorizado | token vía capability | scheduler explícito | sin mutación directa |
| `car_models` | SELECT activos | SÍ | SÍ | SÍ | NO | NO | única lectura pública de catálogo |
| `car_model_images` | SELECT activos | SÍ | SÍ | SÍ | NO | NO | única lectura pública de catálogo |
| `soft_delete_lead(uuid)` | EXECUTE | temporal observado | temporal observado | interno | NO | NO | E4-S8 revoca anon/authenticated |

`public`, `anon` y `authenticated` no ejecutan RPCs privilegiados en el objetivo Phase B. Cualquier operación no listada es FAIL cerrado o explícitamente fuera de alcance. Realtime autenticado queda sujeto a la matriz y no se abre a `anon`.

## Ownership

El root es `leads.user_id`; `lead_messages.lead_id` y `lead_follow_up_actions.lead_id` heredan ownership. `leadflow_settings` y configuración singleton usan la identidad de instalación. El webhook usa `EVOLUTION_WEBHOOK_TOKEN` y deriva `advisor_user_id` server-side.

## Fuera de alcance

E4-S7 no revoca permisos, no hace backfill, no activa `AUTH_REQUIRED`, no aplica locks de cutover y no crea capacidades futuras. E4-S8 es el único lugar para enforcement final.
