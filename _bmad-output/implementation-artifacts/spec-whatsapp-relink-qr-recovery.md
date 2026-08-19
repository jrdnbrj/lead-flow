---
title: 'Recover WhatsApp QR after unlinking'
type: 'bugfix'
created: '2026-08-19'
status: 'done'
baseline_commit: '5d02447fd261228ed4b6b30850044d9cc4c29fff'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Después de desvincular WhatsApp, Evolution puede eliminar la instancia `chat-instance`. La pantalla muestra “Estado no disponible” y “Generar QR nuevo” intenta reiniciar una instancia inexistente, por lo que nunca aparece un QR nuevo.

**Approach:** Detectar de forma explícita una instancia ausente, crearla con la configuración existente y solicitar el QR en la misma navegación. Reutilizar el mismo camino al desvincular/recrear y volver a dejar configurado el webhook, sin exponer secretos ni cambiar el contrato del producto.

## Boundaries & Constraints

**Always:** Mantener `chat-instance`, `WHATSAPP-BAILEYS`, la configuración existente de Evolution y el webhook server-side. La operación debe ser idempotente cuando la instancia ya existe, mostrar estados comprensibles y limpiar el polling al conectar.

**Ask First:** Si Evolution rechaza la creación por un estado ambiguo, una sesión concurrente o requiere pairing manual distinto al QR, detenerse y reportar el estado real antes de borrar o recrear datos.

**Never:** No borrar otras instancias, no cambiar Supabase, no tocar E1/E2/E3/E6/Push, no exponer Evolution públicamente, no imprimir API keys ni modificar el número del asesor.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| CONNECTED | `chat-instance` abierta | La página muestra conectado y no genera QR | Sin reinicio innecesario |
| MISSING_INSTANCE | Estado 404/instancia inexistente | Se crea `chat-instance`, se configura webhook y aparece QR | Mensaje claro si creación falla |
| CLOSED | Instancia existente cerrada | Se conecta/reinicia y muestra QR | Permitir reintento sin pantalla stale |
| PAIRING | QR válido | QR visible y polling termina en conectado | No duplicar creación ni requests concurrentes |

</frozen-after-approval>

## Code Map

- `app/whatsapp/page.tsx` -- carga el estado, crea/reanuda la instancia y solicita el QR.
- `lib/whatsapp/service.ts` -- normaliza estados Evolution y encapsula creación/configuración de instancia.
- `lib/whatsapp/actions.ts` -- logout/desvinculación autenticada y fallback de limpieza.
- `components/whatsapp/whatsapp-connection-section.tsx` -- estado visible, polling y botón de QR.

## Tasks & Acceptance

**Execution:**
- [x] `lib/whatsapp/service.ts` -- añadir detección segura de instancia inexistente y helper idempotente de creación/configuración -- centralizar el boundary de Evolution.
- [x] `app/whatsapp/page.tsx` -- usar el helper cuando falte la instancia antes de pedir/reintentar el QR -- recuperar el flujo tras desvincular.
- [x] `lib/whatsapp/actions.ts` -- reutilizar el helper en el fallback de logout sin borrar otras instancias -- evitar estados zombie.
- [x] `components/whatsapp/whatsapp-connection-section.tsx` -- verificar que el polling existente conserva feedback y se detiene en `open` -- no requirió cambios porque el componente ya implementaba ese comportamiento.

**Acceptance Criteria:**
- Given no existe `chat-instance`, when el asesor abre `/whatsapp` o pulsa “Generar QR nuevo”, then la instancia se crea una sola vez y aparece un QR válido.
- Given una instancia cerrada, when el asesor reintenta, then el QR aparece sin mostrar “Estado no disponible” permanente.
- Given el QR se escanea, when Evolution pasa a `open`, then la pantalla muestra conectado y detiene el polling.
- Given la instancia ya está abierta, when se visita `/whatsapp`, then no se reinicia ni se duplica la instancia.
- Given la creación falla, when se muestra el error, then el asesor recibe una acción entendible y no se ocultan credenciales ni datos técnicos.

## Design Notes

La evidencia de producción mostró `404` en `connectionState/chat-instance` y `fetchInstances: []` después de la desvinculación. El arreglo debe tratar “instancia ausente” de manera diferente a “Evolution no disponible”; de lo contrario, cualquier error transitorio podría intentar crear una instancia inesperadamente.

## Verification

**Commands:**
- `npm run typecheck` -- expected: PASS
- `npm run lint` -- expected: PASS sin nuevos errores
- `npm run build` -- expected: PASS
- `bash scripts/ci-contract-checks.sh` -- expected: PASS
- `git diff --check` -- expected: PASS

**Manual checks:**
- En runtime controlado: desconectar, abrir `/whatsapp`, generar QR, comprobar QR visible, escanear y confirmar estado conectado; verificar no duplicación de instancias.

## Suggested Review Order

**Instance recovery boundary**

- Detecta instancia ausente y limita la recreación a una acción explícita.
  [`page.tsx:45`](../../app/whatsapp/page.tsx#L45)

- Reconciliación segura de estados 404, 409 y conexión abierta.
  [`page.tsx:75`](../../app/whatsapp/page.tsx#L75)

**Evolution instance lifecycle**

- Clasifica ausencia, coordina creación única y exige webhook listo.
  [`service.ts:76`](../../lib/whatsapp/service.ts#L76)

- Protege creación concurrente y evita aceptar conflictos ambiguos.
  [`service.ts:107`](../../lib/whatsapp/service.ts#L107)

- Reutiliza la recuperación al desvincular una sesión zombie.
  [`actions.ts:37`](../../lib/whatsapp/actions.ts#L37)

**Supporting verification**

- El polling existente detiene consultas al llegar a conectado.
  [`whatsapp-connection-section.tsx:43`](../../components/whatsapp/whatsapp-connection-section.tsx#L43)
