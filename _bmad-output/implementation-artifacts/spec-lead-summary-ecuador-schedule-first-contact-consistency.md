---
title: 'Resumen de lead, horario Ecuador y estado de primer contacto'
type: 'bugfix'
created: '2026-08-21'
status: 'done'
baseline_commit: 'f6484d2'
review_loop_iteration: 0
context: ['{project-root}/_bmad-output/project-context.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Después de guardar un lead falta una lectura compacta de todos los datos capturados. Además, los atajos de seguimiento pueden persistir instantes que no corresponden a la hora de Ecuador, mientras la interfaz debe mostrar siempre `America/Guayaquil`. Finalmente, un lead puede mostrar el envío de WhatsApp como aceptado aunque no exista la operación E3 que permite ver resultados y reintentar.

**Approach:** Añadir un resumen compacto reutilizable en post-captura, centralizar la conversión de horas locales de Ecuador a instantes UTC y mostrar hora junto a la fecha del dashboard. Hacer visible un estado de recuperación de First Contact cuando hay evidencia de intento pero falta la operación, con etiquetas honestas y un reintento explícito sin ocultar la incertidumbre de entrega.

## Boundaries & Constraints

**Always:** Mantener E1, E2, E3 y E6; usar `America/Guayaquil` para interpretar y presentar horas; guardar instantes UTC sólo como representación técnica; conservar idempotencia y ownership; no afirmar entrega al cliente cuando sólo existe aceptación del proveedor; mantener touch targets y diseño compacto.

**Ask First:** Cualquier nueva migration, backfill o mutación remota necesaria para reparar registros históricos; cualquier cambio de contrato RPC o del ledger de efectos.

**Never:** No modificar Push, VAPID, Evolution, migrations históricas ni producción; no borrar datos de Pablo; no crear una segunda máquina de estados; no convertir `SERVER_ACK` en confirmación de entrega.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| CAPTURE_SUMMARY | Lead recién guardado con cualquier combinación válida de formulario | La ventana muestra nombre, teléfono, modelos, momento, pago, parte de pago y nota en una composición compacta | Campos opcionales ausentes se muestran como “Sin nota” o se omiten sin inventar datos |
| LATER_BEFORE_16 | Hora local Ecuador entre 00:00 y 15:59 | Programa el mismo día a las 16:00 Ecuador | El instante persistido puede ser UTC, pero la UI muestra Ecuador |
| LATER_AFTER_16 | Hora local Ecuador entre 16:00 y 23:59 | Programa exactamente una hora después, incluso cruzando medianoche | La fecha cambia correctamente al día siguiente cuando corresponde |
| FIRST_CONTACT_ORPHAN | Hay `SERVER_ACK`, `SENT`, `FAILED` o mensaje saliente pero no hay operación E3 | Se muestra Primer contacto con estado “No confirmado”/equivalente y acción para intentar de nuevo | No se afirma entrega ni se oculta la ausencia de operación |

</frozen-after-approval>

## Scope resolution after implementation review

The review proved that the existing E3 RPCs did not allow `UNKNOWN` effects to
enter the already-authorized retry path. The PM/PO decision delegated the
choice for migration 041; the implementation therefore adds the
forward-only `041_e3_retry_uncertain_resources.sql` migration locally. It has
not been applied remotely.

## Code Map

- `components/leads/lead-capture-form.tsx` -- conserva el lead guardado y compone la vista post-captura.
- `components/leads/lead-capture-summary.tsx` -- resumen compacto de los campos capturados.
- `lib/leads/follow-up.ts` -- política pura de horarios y formateo en `America/Guayaquil`.
- `components/dashboard/dashboard-client.tsx` -- fecha/hora del dashboard, botón de envío y fallback visible de First Contact.
- `components/leads/first-contact-summary.tsx` -- estados, recuperación y reintentos de recursos.
- `lib/leads/repository.ts` -- evidencia persistida de operación, mensajes y estados del lead.
- `lib/leads/actions.ts` / `lib/first-contact/command.ts` -- límites de reintento y ejecución canónica.

## Tasks & Acceptance

**Execution:**
- [x] `components/leads/lead-capture-summary.tsx` y `components/leads/lead-capture-form.tsx` -- mostrar todos los valores capturados sin duplicar acciones -- dar contexto inmediato después de guardar.
- [x] `lib/leads/follow-up.ts` -- corregir conversión local Ecuador→UTC y reglas de `Más tarde` -- evitar desfases de cinco horas y fechas incorrectas.
- [x] `components/dashboard/dashboard-client.tsx` -- mostrar fecha/hora Ecuador y habilitar recuperación cuando hay intento sin operación E3 -- evitar falso “Enviado” bloqueante.
- [x] `components/leads/first-contact-summary.tsx` -- representar operación ausente o incierta con estado honesto y reintento seguro -- conservar estados E3 existentes.
- [x] `lib/leads/follow-up.ts` -- añadir validación determinista de atajos -- cubrir medianoche, 15:59, 16:00 y 23:59 Ecuador.

**Acceptance Criteria:**
- Given un lead guardado, when se muestra la pantalla post-captura, then el asesor puede consultar todos los datos ingresados sin abrir otra pantalla grande.
- Given `Más tarde` a las 08:00, 12:00 o 15:45 Ecuador, when se programa, then queda a las 16:00 del mismo día Ecuador.
- Given `Más tarde` a las 16:00 o 23:59 Ecuador, when se programa, then queda una hora después en Ecuador y cruza de día correctamente.
- Given un lead con mensajes salientes pero sin operación First Contact, when se expande en dashboard, then aparece el panel con estado no confirmado y una acción de recuperación.
- Given `SERVER_ACK`, when se muestra al asesor, then el texto distingue aceptación por WhatsApp de entrega al cliente.
- Given cualquier fecha de seguimiento visible, when aparece en dashboard o notificaciones, then se presenta en horario Ecuador con fecha y hora.

## Design Notes

Ecuador no usa horario de verano en esta aplicación. La conversión se centraliza en una función pura: la UI trabaja con fecha/hora Ecuador y la persistencia mantiene ISO UTC. Un lead huérfano de E3 no se reconstruye inventando resultados de fotos o ficha; se muestra “No confirmado” y se ofrece recuperación controlada.

## Verification

**Commands:**
- `npm run typecheck` -- expected: SUCCESS.
- `npm run lint` -- expected: SUCCESS sin errores nuevos.
- `npm run build` -- expected: SUCCESS.
- `docker compose build leadflow && docker compose up -d leadflow` -- expected: contenedor local saludable.
- `git diff --check` -- expected: SUCCESS.

**Manual checks:**
- Crear lead local y verificar resumen compacto de todos los campos.
- Probar `Más tarde` a 15:59, 16:00 y 23:59 usando reloj controlado o función pura.
- Abrir un lead con First Contact existente y otro con estado de envío sin operación; verificar estados y reintento sin envío real durante QA.

## Suggested Review Order

**Recovery safety and First Contact state**

- The dashboard distinguishes retryable resources from confirmed resources and requires confirmation for orphan recovery.
  [`dashboard-client.tsx:312`](../../components/dashboard/dashboard-client.tsx#L312)

- The First Contact panel exposes missing-operation evidence without claiming delivery and permits fenced retries.
  [`first-contact-summary.tsx:14`](../../components/leads/first-contact-summary.tsx#L14)

- UNKNOWN resources become retryable through the existing ownership, version, and idempotency boundary.
  [`041_e3_retry_uncertain_resources.sql:7`](../../supabase/migrations/041_e3_retry_uncertain_resources.sql#L7)

**Ecuador time policy**

- Seller-local date parts are converted to UTC only at the persistence boundary.
  [`follow-up.ts:12`](../../lib/leads/follow-up.ts#L12)

- The dashboard receives one server timestamp so its visible Ecuador clock hydrates consistently.
  [`page.tsx:18`](../../app/dashboard/page.tsx#L18)

**Post-capture summary**

- The saved lead retains the complete persisted record for compact post-capture review.
  [`lead-capture-form.tsx:86`](../../components/leads/lead-capture-form.tsx#L86)

- The summary presents captured commercial fields without adding another workflow surface.
  [`lead-capture-summary.tsx:18`](../../components/leads/lead-capture-summary.tsx#L18)
