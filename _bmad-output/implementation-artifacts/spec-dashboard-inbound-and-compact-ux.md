---
title: 'Actualizar dashboard y compactar la cola de trabajo'
type: 'feature'
created: '2026-08-17'
status: 'done'
review_loop_iteration: 0
baseline_commit: 'd37483c'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Los mensajes inbound pueden quedar fuera de la experiencia visible del dashboard y la pantalla de trabajo conserva demasiado espacio, texto y controles duplicados. Además, la nota y los datos capturados del lead no tienen una lectura rápida desde la tarjeta.

**Approach:** Auditar primero la ruta webhook → persistencia → lectura del dashboard → Realtime/refresh. Corregir sólo el boundary que impida mostrar el mensaje actual y después compactar header, notificaciones, tarjeta, seguimiento y detalle del lead sin cambiar contratos E1/E2/E3/E6.

## Boundaries & Constraints

**Always:** Mantener autenticación, ownership, RPCs y contratos de datos; actualizar automáticamente cuando exista evento Realtime y permitir `Actualizar` como fallback; preservar el estado expandido durante cambios de seguimiento; mostrar teléfono, nota y metadata real del formulario; usar controles accesibles y feedback honesto.

**Ask First:** Cambios de schema/migrations, cambios de comportamiento de negocio, cambios de integración Evolution/Supabase remota o cualquier operación destructiva.

**Never:** No enviar WhatsApp, no tocar migraciones históricas, no modificar Push, no rediseñar otras superficies, no ocultar errores ni inventar datos.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| INBOUND_REFRESH | Nuevo `lead_messages` inbound persistido | Dashboard muestra preview, fecha y estado tras evento o `Actualizar` | Si Realtime falla, `Actualizar` vuelve a consultar y conserva mensaje |
| FOLLOW_UP_CHANGE | Tarjeta expandida, acción modificada | La tarjeta permanece expandida y refleja la acción | Error visible; estado previo permanece |
| LEAD_DETAILS | Lead con nota y metadata | Icono abre modal compacto con nota, modelos, compra, pago y retoma | Campos vacíos muestran estado claro |
| EMPTY_NOTE | Lead sin nota | Modal no afirma que existe una nota | Mostrar “Sin nota” |

</frozen-after-approval>

## Code Map

- `components/dashboard/dashboard-client.tsx` -- lectura, Realtime, refresh, header y tarjeta de lead.
- `components/leads/pending-notifications.tsx` -- cola de notificaciones y acciones compactas.
- `lib/leads/repository.ts` -- composición de mensajes inbound y relaciones del lead.
- `app/api/webhooks/evolution/route.ts` -- entrada y persistencia de mensajes del provider.
- `supabase/migrations/016_epic2_inbound_persistence_and_response.sql` -- contrato vigente de persistencia inbound; sólo se modifica si la evidencia demuestra una incompatibilidad.
- `app/globals.css` -- ajustes mínimos de densidad y controles, reutilizando la escala existente.

## Tasks & Acceptance

**Execution:**
- [x] Confirmar con browser/logs/lectura actual si el inbound se persiste y por qué el dashboard no lo refleja; aplicar el fix mínimo en el boundary responsable.
- [x] Mantener Realtime acotado, con cleanup y fallback manual funcional; evitar refreshes duplicados.
- [x] Retirar CTA global Capturar lead/WhatsApp y hero/subtitle solicitados; conservar sólo Actualizar y Exportar.
- [x] Compactar header, tabs/filtros, notificaciones, estados de tarjeta, seguimiento y First Contact sin reducir legibilidad ni touch targets.
- [x] Añadir acción iconográfica y modal compacto para nota y metadata real del formulario.
- [x] Verificar que cambios de seguimiento no cierren la tarjeta expandida.

**Acceptance Criteria:**
- Given un inbound válido persistido, when ocurre el evento Realtime o se pulsa Actualizar, then el dashboard muestra el mensaje y su estado actual sin depender de una navegación manual.
- Given una tarjeta expandida, when se crea, pospone, completa o ignora una acción, then permanece expandida y muestra el resultado/error correspondiente.
- Given el dashboard cargado, then sólo aparecen Actualizar y Exportar como acciones globales y el header no muestra el hero eliminado.
- Given un lead con datos capturados, when se abre su icono de detalle, then un modal compacto muestra nota, modelos, momento de compra, pago, retoma, teléfono y nombre.
- Given browser desktop y viewport móvil, then no hay overflow horizontal nuevo, los controles siguen accesibles y los estados E1/E2/E3/E6 permanecen visibles.

## Verification

**Commands:**
- `npm run typecheck` -- expected: SUCCESS.
- `npm run lint` -- expected: SUCCESS with no new errors.
- `git diff --check` -- expected: SUCCESS.
- `docker compose build --no-cache leadflow` -- expected: SUCCESS.
- `docker compose up -d leadflow` -- expected: service healthy.

**Manual checks:**
- Browser: inbound visible after refresh/realtime, dashboard compact, pending notifications compact, modal de detalle, and follow-up expansion preserved.
