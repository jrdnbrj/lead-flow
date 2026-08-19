---
title: 'Consistencia de contactos y ajustes compactos del asesor'
type: 'bugfix'
created: '2026-08-18'
status: 'done'
review_loop_iteration: 0
baseline_commit: 'b1112ff'
context:
  - /Users/jrdnbrj/Documents/git/jrdnbrj/lead-flow/_bmad-output/project-context.md
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** El dashboard conserva pequeños problemas de lectura y consistencia: prioridades seleccionadas pueden quedar ilegibles, eliminar un lead puede dejar recordatorios visibles, el flujo de teléfono duplicado crea primero un lead y pregunta después, el compartir contacto falla en algunos dispositivos, y varias superficies todavía muestran copy técnico o controles innecesarios.

**Approach:** Corregir estos puntos en la UI y los límites server-side existentes, sin migraciones ni cambios a E1/E2/E3/E5/E6 salvo los necesarios para que la eliminación y la decisión de duplicado reflejen el estado real. Mantener mobile-first y validar con navegador.

## Boundaries & Constraints

**Always:** Mantener un solo asesor, ownership, RPCs y estados actuales; no duplicar leads accidentalmente; `Abrir lead existente` no crea otro registro y `Crear nueva oportunidad` sí crea uno deliberadamente; recordatorios sólo se muestran para leads activos; conservar First Contact honesto y ocultarlo en dashboard antes de un intento; usar datos reales en el modal; mantener touch targets y no cambiar Push.

**Ask First:** Cualquier migration, cambio de contrato remoto, borrado físico, fusión automática de leads o cambio de semántica Push.

**Never:** No modificar migrations históricas, no borrar los duplicados existentes automáticamente, no enviar WhatsApp, no implementar tipos nuevos de notificación, no hacer redesign amplio.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| DUPLICATE_PHONE | Teléfono ya activo al guardar | Se pregunta antes de crear; Abrir navega al lead existente sin crear; Nueva oportunidad crea exactamente un registro adicional | Si la consulta falla, no crear y mostrar reintento |
| DELETE_REMINDER | Lead eliminado con acciones abiertas | Se confirma la eliminación y sus recordatorios dejan de aparecer | Si la verificación falla, mostrar error y no falso éxito |
| SHARE_VCARD | Web Share disponible, archivo no aceptado | Se intenta archivo y se usa fallback de texto sólo si es posible | Cancelación no es error grave; fallo real es visible |
| FIRST_CONTACT_IDLE | Lead sin operación | Dashboard no muestra el bloque de resultados | El CTA superior existente sigue permitiendo iniciar |
| RESOURCE_RESULT | Resultado aceptado o retry sólo en un recurso | Tarjetas compactas, centradas y con botón sólo donde corresponde | Estados FAILED/UNKNOWN/NOT_AVAILABLE permanecen honestos |

</frozen-after-approval>

## Code Map

- `components/dashboard/dashboard-client.tsx` -- filtros, espacio de actualización, estado visible, detalle del lead y First Contact.
- `components/leads/lead-capture-form.tsx` -- preflight de teléfono duplicado, capitalización y decisiones de creación.
- `lib/leads/actions.ts` y `lib/leads/repository.ts` -- eliminación verificada y lookup de leads activos.
- `components/qr/qr-card.tsx`, `components/leads/lead-contact-actions.tsx`, `lib/contacts/browser-actions.ts` -- compartir vCard.
- `app/whatsapp/page.tsx`, `components/whatsapp/whatsapp-connection-section.tsx`, `components/whatsapp/seller-profile-form.tsx` -- copy y controles de conexión/perfil.
- `app/dashboard/page.tsx`, `app/globals.css`, `components/leads/first-contact-summary.tsx` -- foco de lead, estados compactos y estilos.

## Tasks & Acceptance

**Execution:**
- [x] Corregir contraste de prioridades y separación bajo actualización automática; mantener el resto de filtros intacto.
- [x] Cambiar el flujo de teléfono duplicado a preflight antes de crear y hacer funcional `Abrir lead existente`; no limpiar duplicados históricos automáticamente.
- [x] Verificar soft-delete antes de confirmar éxito para impedir recordatorios huérfanos visibles.
- [x] Hacer robusto el compartir vCard y simplificar copy/controles de WhatsApp según la decisión del asesor.
- [x] Añadir fecha/hora y score al modal, texto claro para parte de pago y capitalización incremental del nombre.
- [x] Ocultar First Contact idle en dashboard y compactar/centrar sus resultados sin cambiar contratos.
- [x] Ejecutar validaciones estáticas y browser QA en desktop y viewport móvil.

**Acceptance Criteria:**
- Given una prioridad seleccionada, when se renderiza el filtro, then texto y fondo tienen contraste legible en todos los estados.
- Given un teléfono activo, when se guarda el formulario, then no aparece un nuevo lead hasta elegir una decisión; Abrir existente expande ese lead y Nueva oportunidad crea sólo uno.
- Given un lead eliminado, when se recarga dashboard, then no aparece su contacto ni sus recordatorios.
- Given un dispositivo con Web Share, when compartir contacto falla al compartir archivo, then se intenta el fallback permitido y la cancelación no se reporta como fallo técnico.
- Given un lead sin First Contact, when se expande en dashboard, then no se muestra el resumen; después del intento se muestran los tres estados y retry sólo donde aplica.
- Given browser desktop y viewport móvil, then no hay overflow nuevo, los botones siguen usables y WhatsApp/QR/First Contact conservan su comportamiento.

## Verification

**Commands:**
- `npm run typecheck` -- expected: SUCCESS.
- `npm run lint` -- expected: SUCCESS without new errors.
- `npm run build` -- expected: SUCCESS.
- `bash scripts/ci-contract-checks.sh` -- expected: SUCCESS.
- `git diff --check` -- expected: SUCCESS.

**Manual checks:**
- Browser: priority filters, delete/reload/pending notifications, duplicate phone decisions, QR share path, WhatsApp page, lead details, name entry, First Contact idle/results, and responsive mobile layout.

## Suggested Review Order

**Duplicate and lead navigation**

- Preflight duplicate phones before any insert; explicit choice controls creation.
  [`lead-capture-form.tsx:62`](../../components/leads/lead-capture-form.tsx#L62)

- Existing-lead links compute the correct page and preserve independent expansion.
  [`dashboard-client.tsx:90`](../../components/dashboard/dashboard-client.tsx#L90)

- Server lookup and soft-delete verification define active-contact consistency.
  [`repository.ts:351`](../../lib/leads/repository.ts#L351)
  [`repository.ts:706`](../../lib/leads/repository.ts#L706)

**Advisor-facing contact and WhatsApp surfaces**

- vCard sharing keeps a file path and safe text fallback without exposing internals.
  [`browser-actions.ts:9`](../../lib/contacts/browser-actions.ts#L9)

- WhatsApp copy and controls stay focused on the advisor's usable connection state.
  [`page.tsx:101`](../../app/whatsapp/page.tsx#L101)

**Dashboard presentation and First Contact**

- Compact resource results remain readable and retryable without changing contracts.
  [`first-contact-summary.tsx:46`](../../components/leads/first-contact-summary.tsx#L46)

- Dashboard detail, filters, First Contact visibility, and refresh behavior stay local.
  [`dashboard-client.tsx:227`](../../components/dashboard/dashboard-client.tsx#L227)

- Query navigation expands the selected lead while retaining the current server boundary.
  [`page.tsx:11`](../../app/dashboard/page.tsx#L11)
