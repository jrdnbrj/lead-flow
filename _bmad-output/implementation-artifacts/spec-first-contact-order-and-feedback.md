---
title: 'First Contact order and compact feedback'
type: 'feature'
created: '2026-08-17'
status: 'in-review'
baseline_commit: '2180639'
review_loop_iteration: 0
context: ['{project-root}/_bmad-output/project-context.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Descargar un contacto ejecuta correctamente la descarga, pero deja un mensaje persistente innecesario que rompe la composición. La tarjeta de Primer contacto tiene reintentos poco claros y el envío actual procesa los recursos en el orden incidental de la lista, por lo que el mensaje puede salir después de fotos o ficha técnica.

**Approach:** Simplificar el feedback de descarga a un estado breve de preparación/error y compactar la tarjeta de Primer contacto con estados alineados por recurso y un reintento de ancho completo cuando corresponda. Hacer explícito y determinista el orden MESSAGE → PHOTOS → TECHNICAL_SHEET: si el mensaje no queda ACCEPTED, no se envían los recursos posteriores; si queda ACCEPTED, se intenta cada recurso disponible por separado y se conserva el resultado independiente de cada uno.

## Boundaries & Constraints

**Always:** Mantener los contratos E3, idempotencia, ledger/fence, estados ACCEPTED/FAILED/UNKNOWN/NOT_AVAILABLE y reintento sólo para FAILED. No exponer secretos. El mensaje es el primer efecto y bloquea fotos/ficha sólo cuando no fue aceptado.

**Ask First:** Si la implementación exige cambios de schema, migrations o cambios en contratos canónicos remotos.

**Never:** No modificar migrations históricas, no crear un segundo ledger, no enviar WhatsApp durante validaciones, no cambiar Push, no resolver la fuente de fotos/ficha técnica en este cambio, no realizar operaciones remotas.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| CONTACT_DOWNLOAD | Usuario pulsa Guardar contacto | Se prepara/descarga el vCard sin mostrar “Contacto listo para guardar” | Mostrar sólo error si falla |
| MESSAGE_ACCEPTED | MESSAGE disponible y proveedor acepta | Se persiste MESSAGE y luego se intentan PHOTOS y TECHNICAL_SHEET disponibles | Cada recurso conserva su resultado |
| MESSAGE_NOT_ACCEPTED | MESSAGE devuelve FAILED o UNKNOWN | No se intentan recursos posteriores | La UI muestra el resultado honesto y permite sólo los reintentos válidos |
| RESOURCE_FAILED | Recurso posterior falla | Los demás resultados no se sobrescriben | Reintento visible y compacto para ese recurso |

</frozen-after-approval>

## Code Map

- `components/leads/lead-contact-actions.tsx` -- descarga del vCard del lead y feedback visible.
- `components/qr/qr-card.tsx` -- descarga del vCard del asesor y feedback visible.
- `components/leads/first-contact-summary.tsx` -- tarjeta de recursos, estados y reintento.
- `lib/first-contact/command.ts` -- ejecución secuencial y orden de efectos de First Contact.
- `lib/first-contact/order.ts` -- orden canónico y regla de corte después del mensaje.
- `lib/first-contact/provider.ts` -- adapter del proveedor y resultados por recurso.
- `lib/first-contact/types.ts` -- estados y etiquetas visibles de recursos.

## Tasks & Acceptance

**Execution:**
- [x] `components/leads/lead-contact-actions.tsx` -- eliminar el mensaje de éxito de descarga y conservar indicador de carga/error -- evitar feedback redundante sin perder accesibilidad.
- [x] `components/qr/qr-card.tsx` -- aplicar la misma política de feedback a la descarga del contacto del asesor -- mantener comportamiento de descarga.
- [x] `components/leads/first-contact-summary.tsx` -- mejorar la composición de cada recurso, alinear estado a la derecha y hacer el reintento un control inferior de ancho completo -- conservar legibilidad y touch targets.
- [x] `lib/first-contact/command.ts` -- ejecutar MESSAGE antes que cualquier recurso adicional y cortar la cadena si no queda ACCEPTED -- preservar ledger, idempotencia y resultados parciales.
- [x] `lib/first-contact/command.ts` / `lib/first-contact/provider.ts` -- cubrir la regla de orden con validación aislada usando fake provider -- evitar envíos reales durante pruebas.

**Acceptance Criteria:**
- Given una descarga de contacto exitosa, when termina, then no aparece “Contacto listo para guardar” y el control vuelve a estado normal.
- Given una tarjeta de First Contact, when un recurso tiene estado, then el estado queda alineado con su título y el botón de reintento ocupa una fila inferior clara sólo para FAILED.
- Given MESSAGE ACCEPTED, when existen recursos disponibles, then PHOTOS y TECHNICAL_SHEET se intentan después del mensaje.
- Given MESSAGE FAILED o UNKNOWN, when termina el comando, then no se llama al proveedor para PHOTOS ni TECHNICAL_SHEET.
- Given un recurso posterior FAILED, when se reintenta, then sólo ese recurso se vuelve a procesar mediante el contrato existente.

## Design Notes

El orden debe depender de `resourceKind`, no de la posición accidental recibida desde la base. Un resultado MESSAGE no aceptado es una condición de corte porque el usuario pidió que el material posterior sólo se intente después de entregar el mensaje principal.

## Verification

**Commands:**
- `npm run typecheck` -- expected: SUCCESS.
- `npm run lint` -- expected: SUCCESS sin errores nuevos.
- `npm run build` -- expected: SUCCESS.
- `git diff --check` -- expected: SUCCESS.

**Manual checks:**
- Abrir `/qr` y el flujo post-captura; confirmar que la descarga no deja el mensaje redundante.
- Abrir una tarjeta con First Contact; confirmar composición, estados y reintento.
- Usar fake provider/contract test para comprobar MESSAGE primero y corte ante FAILED/UNKNOWN; no enviar WhatsApp real.
