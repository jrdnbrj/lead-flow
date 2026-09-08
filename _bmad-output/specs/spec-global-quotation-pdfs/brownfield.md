# Brownfield discovery

## Estado y evidencia

- HEAD observado: `ff4dcfd feat(quotes): add local credit card quotation tool`.
- `origin/main` observado: `fab6a3d`; la rama actual es `main`.
- Worktree previo: `README.md` modificado, `docker-compose.local.yml` eliminado,
  `docker-compose.yml` modificado y `spec-financial-quotation/` sin trackear.
  Son cambios previos/no relacionados y deben preservarse.
- Migraciones locales observadas: 001–067; no existe migration de cotizaciones.
  La alineación remota no se consultó en esta ejecución porque el alcance es
  sólo especificación y prohíbe tocar Supabase remoto.

## Navegación actual

`components/layout/app-shell.tsx` define cuatro elementos para desktop y
móvil, en este orden:

1. `/dashboard` — Resumen
2. `/nuevo` — Nuevo lead
3. `/qr` — Mi QR
4. `/whatsapp` — WhatsApp

El mismo componente ya tiene un dropdown de usuario, disponible en desktop y
móvil, con Catálogo de autos, Push Diagnostics y Cerrar sesión. El incremento
debe cambiar sólo el array de navegación y agregar WhatsApp al dropdown; no
crear una nueva bottom tab ni rediseñar el shell.

Ruta recomendada: `/cotizacion`, protegida con el mismo
`requireAdvisorOrRedirect` usado por `/catalogo` y `/push-diagnostics`.

## Cotizador actual

`components/leads/card-quote-tool.tsx` es un cliente contextual que se monta
en el dashboard cuando el lead tiene `TARJETA_CREDITO`. Muestra un selector de
modelo para leads con varios modelos, aunque el modelo no participa en el
cálculo. Esa UI debe convertirse en una experiencia global o extraer su parte
de cálculo sin duplicar lógica; la selección de lead/modelo quedará sólo en el
subflujo documental.

`lib/financial/card-quote.ts` ya contiene los tipos, modalidades, factores,
plazos válidos, validación, cálculo y formateo. Es pura, server/client-safe y
no persiste ni llama a red. No cambiar sus reglas matemáticas. Actualmente no
hay PDF, historial, metadata ni precio de catálogo.

## Datos y ownership actuales

- `Lead.carModels` es `string[]`; la creación y edición de leads ya soporta
  varios modelos y no tiene precio.
- `car_models` contiene identidad/nombre/orden/estado, pero no precio maestro.
- El catálogo usa `car_model_assets`, `car_model_color_assets` y legacy
  `car_model_images`; sus archivos viven en el bucket público `vehiculos`.
- `lib/auth/advisor.ts` concentra `requireAdvisor` y
  `requireAdvisorOrRedirect`. Las nuevas acciones y rutas deben conservar ese
  límite de sesión/ownership.
- No existe una tabla `quote_files`, un bucket de cotizaciones ni políticas
  asociadas en las migraciones inspeccionadas.

## PDF y Storage existentes

`components/catalog/pdf-viewer.tsx` ya carga PDF con `pdfjs-dist` y renderiza
las páginas verticalmente, con zoom y estados de carga/error. Es la base de la
preview de cotizaciones.

Las routes del catálogo ya muestran un patrón útil: una route autenticada puede
obtener un asset y devolverlo con `Content-Disposition`. Para cotizaciones se
necesita una route equivalente, pero sobre bucket privado, validando el
`quote_file_id` y ownership antes de hacer streaming. No se debe entregar una
URL pública permanente.

No se observó una dependencia server-side de generación PDF. `xlsx` no es un
renderer PDF; `pdfjs-dist` sólo sirve para leer/renderizar. La recomendación
para implementación es `pdf-lib` server-only, con una plantilla determinista.

## Evolution y efectos externos

`lib/whatsapp/service.ts` ya expone `sendWhatsappMessage`, `sendWhatsappMedia`
y `sendWhatsappDocument`, usando `EVOLUTION_API_INSTANCE_NAME`, que es la
instancia de clientes. El documento actual de First Contact usa el mismo
servicio, pero E3 está semánticamente especializado en `FIRST_CONTACT` y sus
items/keys; no debe reciclarse para convertirlo en un sistema de cotizaciones.

El envío futuro debe reutilizar `sendWhatsappDocument`, guardar el resultado
en un ledger aislado de cotizaciones y registrar el mensaje outbound conforme a
los patrones existentes. Esta discovery no ejecutó IO de Evolution ni envió
WhatsApp.

## Archivos y boundaries probables

- Navegación: `components/layout/app-shell.tsx`.
- Entrada global: `app/cotizacion/page.tsx` (nuevo) y componente global bajo
  `components/quotes/` (nuevo o extracción mínima).
- Lógica existente: `lib/financial/card-quote.ts` (reutilizar; sólo ampliar
  versión constante si el contrato futuro lo requiere).
- Acciones/repositorio: `lib/quotes/actions.ts`, `lib/quotes/repository.ts` y
  `lib/quotes/pdf.ts` (nuevos, server-only).
- Vista/descarga: `app/api/quotes/files/[id]/route.ts` (nuevo) y reutilización
  de `components/catalog/pdf-viewer.tsx`.
- Schema/types: nueva migration forward-only y actualización de
  `lib/supabase/database.ts` según la convención real.
- Evolution sólo en el slice de envío futuro: reutilizar
  `lib/whatsapp/service.ts`; no tocar First Contact/reminders.

Los nombres son límites probables, no autorización para refactorizar archivos
no relacionados.

## Verificaciones futuras obligatorias

Antes de implementar: confirmar migraciones locales/remotas; inventariar
Storage privado; confirmar el formato de acceso autenticado; comprobar que el
asset de marca a usar está autorizado; y verificar con tests que el cotizador
actual no cambió. Todo runtime remoto y cualquier envío quedan fuera de esta
spec.
