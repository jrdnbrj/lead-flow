---
title: 'Inbound, First Contact y post-captura'
type: 'bugfix'
created: '2026-08-19'
status: 'done'
baseline_commit: '27dcf13'
---

## Intent

Corregir el flujo real después de capturar un lead: las respuestas entrantes
de WhatsApp deben persistir y reflejarse al actualizar el dashboard, los
mensajes multimedia deben tener una vista legible, el primer contacto debe
continuar en el servidor aunque el navegador se cierre y el estado de recursos
sin fuente debe ser `NOT_AVAILABLE`, no un fallo de envío.

## Boundaries

- Mantener los contratos y RPC existentes de E1, E2, E3 y E6.
- No enviar mensajes reales durante QA.
- No crear migraciones ni tocar Push.
- Configurar el webhook Evolution en el límite server-side existente.
- Mantener retry sólo para recursos `FAILED`.
- En post-captura conservar Guardar contacto, Compartir, WhatsApp y
  seguimiento; quitar duplicados de QR, dashboard y copy redundante.

## Acceptance

- El webhook de Evolution queda habilitado con la URL y token existentes; un
  inbound válido persiste, actualiza el lead y aparece después de Actualizar o
  recargar.
- El dashboard no muestra `Mensaje sin texto` para multimedia saliente nueva;
  usa una descripción breve y entendible.
- MESSAGE se procesa primero; después de aceptarlo, PHOTOS y
  TECHNICAL_SHEET disponibles pueden procesarse en paralelo con el ledger
  existente. Un recurso no disponible no se envía ni se reintenta.
- Compartir usa una única llamada nativa `navigator.share` con información de
  contacto legible, sin descargar falsamente un archivo.
- La pantalla post-captura muestra `Lead guardado`, acciones del lead,
  seguimiento y Primer contacto compacto, sin QR duplicado, dashboard
  duplicado, `Sin próxima acción` ni el texto final redundante.

## Verification

- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `bash scripts/ci-contract-checks.sh`
- `git diff --check`
- Browser QA en dashboard, post-captura y `/qr`.
- Verificación remota no destructiva del webhook y health público después del
  despliegue.
