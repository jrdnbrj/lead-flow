---
stepsCompleted:
  - 1
updated: 2026-08-07
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-lead-flow-2026-08-05/prd.md
  - _bmad-output/planning-artifacts/architecture/architecture-lead-flow-2026-08-06/ARCHITECTURE-SPINE.md
  - _bmad-output/planning-artifacts/ux-designs/ux-lead-flow-2026-08-05/DESIGN.md
  - _bmad-output/planning-artifacts/ux-designs/ux-lead-flow-2026-08-05/EXPERIENCE.md
  - _bmad-output/project-context.md
  - README.md
  - package.json
  - Dockerfile
  - docker-compose.yml
  - supabase/config.toml
  - app/api/webhooks/evolution/route.ts
  - app/dashboard/page.tsx
  - app/nuevo/page.tsx
  - app/whatsapp/page.tsx
  - app/qr/page.tsx
  - components/dashboard/dashboard-client.tsx
  - components/leads/lead-capture-form.tsx
  - lib/domain/lead.ts
  - lib/leads/actions.ts
  - lib/leads/follow-up.ts
  - lib/leads/repository.ts
  - lib/leads/validation.ts
  - lib/supabase/client.ts
  - lib/supabase/database.ts
  - lib/whatsapp/service.ts
  - supabase/functions/send-whatsapp-welcome/index.ts
  - supabase/migrations/001_leadflow_core_schema.sql
  - supabase/migrations/002_leadflow_anonymous_dashboard_and_whatsapp.sql
  - supabase/migrations/003_leadflow_follow_up_and_messages.sql
  - supabase/migrations/004_leadflow_follow_up_actions.sql
  - supabase/migrations/005_leadflow_backfill_contacted_status.sql
  - supabase/migrations/006_leadflow_persistent_config_realtime_and_soft_delete.sql
  - supabase/migrations/007_changan_catalog_and_multi_car_leads.sql
  - supabase/migrations/008_soft_delete_lead_rpc.sql
  - supabase/migrations/009_complete_car_model_images.sql
---

# lead-flow - Epic Breakdown

## Overview

Este documento descompone el piloto brownfield de LeadFlow en épicas e historias revisables. El inventario de requisitos se extrajo del PRD final, la arquitectura vinculante, las spines UX finales, el contexto del proyecto, el README y el código/migraciones existentes. La sincronización corporativa sigue dentro del objetivo del piloto, pero Epic 7 es un discovery gate: no se convierte en implementación hasta superar AD-14.

## Contratos transversales de implementación

- **Dueño del ciclo de acciones:** la Épica 1 es dueña funcional de `lead_follow_up_actions`, sus transiciones, `action_version`, `expected_action_version`, `STALE_ACTION`, fuente, eventos y proyecciones. Las Épicas 2 y 5 consumen las RPC y eventos de ese contrato; no crean estados paralelos ni modifican repositorios internamente.
- **Orden de implementabilidad:** la Épica 4 es la base de acceso/Auth/RLS/eventos y debe superar su gate fundacional antes de implementar mutaciones privadas de las Épicas 1, 2, 3, 5 y 6. La Épica 1 no es la primera épica implementable aunque sea la primera superficie de valor para el asesor.
- **Entradas mutantes:** toda mutación privada de las Épicas 1, 2, 3, 5 y 6 depende del acceso/Auth/RLS/eventos de la Épica 4. Las transiciones y su evento canónico ocurren en una única RPC/transacción.
- **Resultado por recurso de primer contacto:** `ACCEPTED` nunca se reenvía; `FAILED` permite reintento manual solo del mismo recurso, operación y versión; `UNKNOWN` no se reintenta hasta reconciliar o demostrar que no ocurrió; `NOT_AVAILABLE` no crea efecto ni reintento hasta una nueva versión verificable.
- **Clasificación entrante:** la política determinista y su allowlist canónica viven en el PRD. `Sin respuesta sugerida` no crea acción; `Respuesta pendiente` crea/actualiza `Responder al cliente`; `Revisar` crea/actualiza la misma acción y conserva su etiqueta. Ninguna IA puede cerrar acciones.
- **Matching y duplicados:** el lead no eliminado más reciente por `(created_at DESC, id DESC)` es el destino operativo; múltiples candidatos emiten `inbound_lead_match_ambiguous`; los registros nunca se fusionan automáticamente.
- **Push:** la delivery canónica es por acción, `action_version`, suscripción y `subscription_generation`; una identidad admite como máximo una solicitud Push. Dos suscripciones activas válidas pueden producir una notificación cada una sin ser duplicación. Un cambio de `action_version` no autoriza por sí solo un segundo envío inmediato: la identidad nueva debe volver a cumplir materialización y scheduling. Las acciones Push usan únicamente el vocabulario cerrado de AD-15; `Elegir fecha y hora` es una operación manual autenticada de la PWA y no acepta timestamps desde un Push.
- **Cancelación de acciones:** la eliminación lógica equivale a la transición `CANCELED`; la RPC dueña incrementa `action_version`, conserva evidencia y auditoría y emite `next_action_canceled` en la misma transacción. No se crea una segunda máquina de estados.

## Requirements Inventory

### Functional Requirements

- FR-001 — MUST: Permitir guardar un lead sin próxima acción, mostrarlo como **Sin próxima acción** y no generar Push mientras no exista una acción programada.
- FR-002 — MUST: Permitir programar llamada, WhatsApp, cotización u otra acción con fecha y hora exactas en `America/Guayaquil`.
- FR-003 — MUST: Un mensaje entrante debe crear o actualizar una única acción abierta **Responder al cliente** para el lead correspondiente.
- FR-004 — MUST: La acción **Responder al cliente** debe generar su primera alerta una hora después del mensaje si permanece pendiente y no estaba explícitamente pospuesta; una acción pospuesta conserva `scheduled_for` cuando llega otro mensaje.
- FR-005 — MUST: Permitir marcar una acción como **Hecho**, **Posponer** o **Ignorar/No requiere respuesta**, también desde una notificación cuando el dispositivo lo soporte.
- FR-006 — MUST: Posponer debe conservar la acción, permitir repetición y ofrecer **En 1 hora**, **Más tarde**, **Mañana**, **En 3 días** y **Elegir fecha y hora** con resolución exacta en `America/Guayaquil`.
- FR-007 — MUST: Ignorar o **No requiere respuesta** debe cerrar solo la acción, retirar recordatorios y no cambiar el lead a Perdido o Cerrado.
- FR-008 — MUST: Varios mensajes mientras existe una acción abierta actualizan la única acción y su contexto sin duplicarla; si la acción está explícitamente pospuesta no adelantan `scheduled_for`.
- FR-009 — SHOULD: La acción de respuesta debe mostrar el mensaje entrante más reciente y conservar el historial relevante sin nota manual obligatoria.
- FR-010 — MUST: Una acción manual puede marcarse hecha sin nota; un WhatsApp enviado desde LeadFlow se resuelve cuando Evolution acepta; una respuesta nativa se resuelve mediante confirmación manual; rechazo, fallo o incertidumbre conserva la acción pendiente.
- FR-011 — MUST: Repeticiones desde notificación o red no deben producir dos cambios de estado ni dos reprogramaciones.
- FR-012 — SHOULD: Distinguir acción hecha, ignorada y pospuesta para evitar mezclar métricas.
- FR-013 — MUST: Permitir marcar manualmente como hecha una respuesta realizada desde WhatsApp nativo y distinguirla de una respuesta verificada por Evolution.
- FR-014 — MUST: Guardar un lead nunca debe enviar automáticamente el primer contacto; el asesor inicia el envío explícitamente.
- FR-015 — MUST: El primer contacto debe intentar mensaje, fotos y ficha técnica disponible; si falta un recurso, enviar lo disponible sin bloquear todo.
- FR-016 — MUST: Un envío aceptado por Evolution debe registrar resultado y no repetirse accidentalmente por doble toque, reintento o recarga.
- FR-017 — MUST: Mostrar qué recursos del primer contacto se enviaron y cuáles no estaban disponibles, y permitir reintento manual únicamente de recursos `FAILED`.
- FR-018 — MUST: Generar el Push desde servidor cuando una acción alcance su fecha/hora aunque la PWA no esté abierta.
- FR-019 — MUST: Ofrecer en la notificación Hecho, Posponer e Ignorar/No requiere respuesta cuando Android/navegador lo soporte.
- FR-020 — MUST: Separar eventos de Push generado, solicitud aceptada/rechazada, suscripción inválida, acción desde notificación, tiempos, duplicados y errores.
- FR-021 — MUST: No presentar aceptación del servicio Push como entrega física ni lectura.
- FR-022 — MUST: Reintentos, doble toque o reconexión no deben generar más de una solicitud para la identidad canónica `(action_id, action_version, subscription_id, subscription_generation)` ni aplicar dos veces una acción; suscripciones válidas distintas mantienen una identidad cada una.
- FR-023 — SHOULD: Incluir en la notificación el contexto mínimo para identificar lead y acción.
- FR-024 — MUST: Varias acciones que venzan juntas deben producir una delivery por combinación vigente de acción, versión, suscripción y generación, sin duplicar una identidad; cambiar `action_version` no dispara un envío inmediato sin volver a cumplir scheduling.
- FR-025 — COULD: Escalar por WhatsApp cuando no exista suscripción Push utilizable solo si se define posteriormente una regla explícita; no es canal principal del piloto.
- FR-026 — MUST: Limitar el piloto a una única operación controlada de sincronización corporativa.
- FR-027 — MUST: Mostrar vista previa y exigir confirmación explícita antes de sincronizar.
- FR-028 — MUST: Detectar sesión caducada, detenerse sin registro incompleto y mostrar recuperación controlada.
- FR-029 — MUST: Después de reautenticar, exigir nueva revisión y confirmación; no reintentar automáticamente.
- FR-030 — MUST: La sincronización debe ser idempotente y prevenir duplicados por doble toque, reintento o recuperación de red.
- FR-031 — MUST: Validar creación correcta en sistema corporativo y conservar identificador externo cuando exista.
- FR-032 — MUST: Registrar resultado, etapa, fecha/hora, lead e identificador externo sin almacenar credenciales en repositorio ni exponerlas al navegador.
- FR-033 — SHOULD: Detenerse ante cambios inesperados de interfaz/respuesta y requerir revisión humana.
- FR-034 — MUST: Permitir marcar manualmente **Cliente decidió comprar** desde la tarjeta sin inferirlo desde chats.
- FR-035 — MUST: Guardar fecha/hora del registro como fecha operativa, no como momento necesariamente real de decisión.
- FR-036 — DEFERRED: Hitos, bloqueos y entrega son futuros; están fuera del alcance implementable actual y no pertenecen a Epic 6.
- FR-037 — DEFERRED: La duración entre decisión y entrega es futura; está fuera del alcance implementable actual y no pertenece a Epic 6.
- FR-038 — MUST: Clasificar mensajes entrantes con reglas deterministas, converger `Respuesta pendiente` y `Revisar` en `Responder al cliente`, no crear acción para `Sin respuesta sugerida` y permitir corrección manual.
- FR-039 — MUST: Mostrar cuatro caminos después de guardar y reutilizar el componente de acciones en la misma pantalla.
- FR-040 — MUST: Advertir teléfono existente sin bloquear, permitir abrir o crear oportunidad y mantener matching determinista sin fusión.

### NonFunctional Requirements

- NFR-001 — MUST: Conservar una acción pendiente hasta marcarla hecha, pospuesta, ignorada o cancelada mediante eliminación lógica; un fallo Push no la elimina.
- NFR-002 — MUST: Hacer idempotentes acciones, notificaciones y sincronización corporativa frente a reintentos, doble toque, recarga y reconexión.
- NFR-003 — MUST: Distinguir notificación generada, solicitud aceptada/rechazada, suscripción inválida y acción observable; no afirmar entrega física ni lectura sin evidencia.
- NFR-004 — MUST: Generar la solicitud Push dentro de un margen de un minuto de la hora programada.
- NFR-005 — MUST: Mantener credenciales, tokens y estado sensible de sesión fuera del repositorio y del navegador.
- NFR-006 — MUST: Operar sincronización corporativa con sesión autorizada, vista previa, confirmación, recuperación de sesión y validación posterior.
- NFR-007 — MUST: Permitir reconstruir auditoría de lead, etapa, resultado e identificador externo sin registrar secretos.
- NFR-008 — SHOULD: Mostrar errores funcionales al asesor sin respuestas crudas de proveedores, tokens, cookies o sesión.
- NFR-009 — MUST: Resolver acciones críticas desde Android con interacción breve y sin nota obligatoria.
- NFR-010 — MUST: Mantener captura y seguimiento utilizables con una mano y sin plataforma adicional de registro.
- NFR-011 — MUST: Interpretar fechas y horas en `America/Guayaquil`.
- NFR-012 — SHOULD: Mostrar contexto mínimo del lead en notificaciones.
- NFR-013 — MUST: Generar instrumentación automáticamente desde operaciones de la aplicación.
- NFR-014 — MUST: Asociar errores de captura, WhatsApp, Push y sincronización con etapa y código funcional medible.
- NFR-015 — SHOULD: Detectar suscripciones Push inválidas/vencidas, conservar acciones y ofrecer reactivación explícita; el escalamiento WhatsApp sigue siendo COULD.

### Additional Requirements

#### Arquitectura adoptada y límites de implementación

- El producto evoluciona como modular monolith con puertos y adaptadores: Next.js recibe, módulos de capacidad poseen casos de uso/puertos, dominio posee vocabulario/políticas y Supabase, Evolution y Web Push son adaptadores reemplazables.
- AD-1: El nuevo código de `app/` y `components/` no llama directamente a Supabase ni proveedores; el Realtime actual es una excepción brownfield que debe encapsularse cuando se modifique.
- AD-2: Mantener evolución brownfield, migraciones aditivas numeradas, backfill/verificación y compatibilidad con captura, dashboard, WhatsApp, Realtime, catálogo e histórico de borrado lógico.
- AD-3: Incorporar una única cuenta Supabase Auth administrativamente provisionada, singleton `leadflow_installation`, ownership directo, RLS y cutover en fases sin romper el webhook; no hay signup público ni multiusuario.
- AD-4: PostgreSQL es autoridad transaccional de acciones, mensajes, operaciones externas y milestones; las proyecciones de próxima acción son mantenidas por RPC/trigger; fechas nuevas son instantes exactos UTC derivados de `America/Guayaquil`.
- AD-5: Una sola acción de respuesta abierta por lead, matching determinista, deduplicación por identidad de proveedor, convergencia serializada, control de versión/fuente, posposición explícita que prevalece ante mensajes nuevos y resultado funcional `STALE_ACTION` sin mutación.
- AD-6: Cuatro entradas mutantes exclusivas —sesión del asesor, capability Push más sesión, callback Evolution autenticado y scheduler secreto—; cambios compartidos mediante RPC versionadas y transición más evento en una transacción.
- AD-7: Todo efecto externo pasa por `lib/effects` y ledger durable con clave de negocio, intentos, leases, fence antes de I/O, evidencia append-only y estados `UNKNOWN` que nunca se reenvían ciegamente.
- AD-8: Primer contacto explícito, operación única por lead, snapshot de recursos, efectos solo para recursos disponibles, resultados `ACCEPTED`/`FAILED`/`UNKNOWN`/`NOT_AVAILABLE`, reparación manual solo de `FAILED` y cierre exacto de la acción solo con evidencia vinculada.
- AD-9: Push server-side mediante materialización durable por acción/suscripción, scheduler gestionado, generación antes de I/O, cifrado de suscripciones en PostgreSQL/Vault, evidencias separadas y fallback PWA autenticado.
- AD-10: `leadflow_events` es append-only, con registry canónico, claves idempotentes, versiones de agregado, payload mínimo y prohibición de secretos o payloads crudos.
- AD-11: El piloto actual registra únicamente la decisión manual de compra; blocker, delivery y duración son futuros/deferred y no son implementables ahora. Nada se infiere desde webhook, mensaje, score o clasificador.
- AD-12: Solo claves públicas llegan al navegador; secretos son server-side, las rutas son superficie pública y deben autenticar, autorizar y validar; logs y respuestas muestran códigos seguros.
- AD-13: Producción headless en Ubuntu, Compose productivo privado, ingress TLS, imágenes por digest, Supabase gestionado, scheduler monitorizado, backups/restore y gates de smoke antes de go-live.
- AD-14: La sincronización corporativa está discovery-gated: no se agregan adapter, worker, credenciales ni mutación antes de documentar flujo autorizado, mapeo, estados, postcondición, recuperación y validación segura.
- AD-15: Las acciones Push usan POST same-origin, sesión, capability opaque de un solo uso, digest server-side, comandos cerrados, control de versión/fuente, expiración y replay seguro.

#### Brownfield y calidad existente que debe conservarse

- `/nuevo` captura nombre, celular, uno o más modelos, calificación actual, nota opcional y score calculado; las migraciones 001 y 007 mantienen scoring, modelos y hasta 10 modelos.
- `/dashboard` conserva filtros, búsqueda, paginación, tarjetas, llamadas, WhatsApp, seguimiento, exportación, Realtime y actualización manual completa.
- Las migraciones 002–004 y el repositorio mantienen `lead_messages`, estados Evolution, varias acciones, trigger de resumen y RLS/policies legacy.
- Las migraciones 005–009 conservan backfill de contactado, configuración persistente, publicación Realtime, soft delete/RPC y una imagen válida o fallback para cada modelo seleccionable.
- `/whatsapp` conserva QR Evolution, conexión, perfil, plantilla, configuración persistente y resultados parciales de texto/imagen; `/qr` sigue siendo herramienta secundaria y no paso obligatorio.
- El webhook valida `x-evolution-webhook-token`, rechaza JSON inválido, distingue mensajes entrantes/salientes, usa `remoteJidAlt`, deduplica por `provider_message_id` y no aplica estados antiguos.
- El envío actual es explícito desde el dashboard, normaliza teléfonos, registra mensaje, actualiza el estado del lead solo con resultado no fallido y usa `ActionResponse` con errores funcionales.
- El repositorio no tiene suite propia ni script `test`; las pruebas futuras deben agregarse solo donde exista lógica pura o riesgo real, y las integraciones deben usar fixtures/mocks sin secretos.
- Antes de implementar cambios de Next.js se debe leer la documentación local exigida por `AGENTS.md`; las validaciones base existentes son lint, typecheck, build, compose config y diff check.

#### Decisiones deferred que no pueden anticiparse

- No implementar sincronización corporativa ni guardar credenciales hasta superar AD-14.
- No permitir reemplazo del UUID singleton en runtime; solo una migración futura revisada podría hacerlo bajo todas las condiciones de AD-3.
- No seleccionar todavía Playwright, HTTP directo ni otro runtime corporativo.
- No ejecutar automatización desatendida sobre datos corporativos reales.
- No fijar navegador Android antes de probar el dispositivo real; Push debe tener fallback PWA.
- No inventar fuente ni disponibilidad de ficha técnica; enviar solo recursos demostrablemente disponibles.
- No agregar reparación automática del primer contacto parcial sin decisión explícita del asesor.
- No definir todavía retención/borrado de mensajes y eventos más allá de preservar evidencia y soft delete.
- No cerrar producción sin ingress TLS, RPO/RTO, backup/restore y ownership operacional documentados.
- No implementar escalamiento WhatsApp de Push sin trigger, cooldown y política de costos explícitos.
- No introducir una cola general mientras el volumen de un asesor pueda resolverse con claims durables en Postgres.
- No preconstruir multi-advisor, roles, billing, SaaS ni app nativa.

### UX Design Requirements

- UX-DR1: Preservar identidad visual incremental: superficies cálidas, tinta, lima, radios y tokens existentes; no crear una paleta por feature.
- UX-DR2: Priorizar acción inmediata, identidad/contexto, estado operativo e información secundaria en ese orden.
- UX-DR3: Mantener una columna mobile-first, uso con una mano, CTA sticky y controles críticos de al menos 48dp respetando el área segura de Android.
- UX-DR4: Reorganizar el dashboard por conversaciones activas, vencido/hoy, sin próxima acción y resto; mostrar próxima acción visible en tarjeta cerrada.
- UX-DR5: Separar visualmente estado comercial, estado de conversación, canal y seguimiento; no usar score como verdad comercial.
- UX-DR6: Permitir captura progresiva y salida sin nota, próxima acción ni QR obligatorios; tras guardar mostrar cuatro caminos, con Programar acción reutilizando el componente de seguimiento en la pantalla intermedia.
- UX-DR7: Mantener navegación inferior Resumen, Nuevo lead, Mi QR y WhatsApp; no añadir menú global ni convertir QR/WhatsApp en pasos obligatorios.
- UX-DR8: Ofrecer bloque de mensaje entrante con último mensaje, hora, clasificación determinista y acciones contextuales; Respuesta pendiente y Revisar muestran Responder al cliente, Sin respuesta sugerida no crea acción y el asesor puede corregir sin nota obligatoria.
- UX-DR9: Usar grupo estable Hecho/Posponer/Ignorar; explicar el efecto de Ignorar y ofrecer En 1 hora, Más tarde, Mañana, En 3 días y Elegir fecha y hora; conservar estado si falla la mutación.
- UX-DR10: Representar primer contacto como comando explícito con bloqueo de doble toque y resultado por recurso `ACCEPTED`, `FAILED`, `UNKNOWN` y `NOT_AVAILABLE`; permitir reintento manual solo de `FAILED` y comunicar completo, parcial, fallido e incierto honestamente.
- UX-DR11: Diseñar estados de Push no solicitado, permitido, rechazado, inválido/vencido, incompatible y reactivable, sin bloquear captura ni WhatsApp manual.
- UX-DR12: Mostrar Push con nombre, tipo y contexto mínimo; sus acciones deben confirmar/reconciliar estado sin prometer entrega física ni lectura. Posponer ofrece los cuatro comandos temporales cerrados; Elegir fecha y hora solo existe en la PWA autenticada.
- UX-DR13: Diseñar sincronización con preview, confirmación, progreso de una etapa, recuperación por sesión caducada, nueva confirmación y resultado verificado con ID externo.
- UX-DR14: Mantener estados independientes para Realtime activo/no disponible y refresh manual; conservar lectura cuando no hay conexión y deshabilitar solo lo que requiere servidor.
- UX-DR15: Aplicar WCAG 2.2 AA mínimo: TalkBack, labels, errores asociados, foco visible, zoom, texto grande, reduced motion y foco inicial/retorno en diálogos.
- UX-DR16: Mantener comportamiento responsive en Android estrecho/ancho, escritorio, PWA instalada y navegador sin acciones Push, con fallback autenticado.
- UX-DR17: Usar voz directa con verbos y errores accionables; nunca mostrar `401`, payloads crudos, “venta cerrada” por una compra registrada ni éxito sin evidencia.
- UX-DR18: Mostrar advertencia no bloqueante cuando el teléfono normalizado ya existe, con nombre, vehículo y estado anterior, y permitir abrir el lead existente o crear una nueva oportunidad sin fusionar registros.

### FR Coverage Map

La cobertura es de valor observable. Los requisitos transversales de seguridad, eventos, UX y pruebas se implementan dentro de las historias de cada épica; no se convierten en épicas técnicas independientes.

- FR-001: Épica 1 — guardar sin nota ni próxima acción y mostrar **Sin próxima acción**.
- FR-002: Épica 1 — programar acciones con fecha/hora exactas en `America/Guayaquil`.
- FR-003: Épica 2 — clasificar el mensaje y converger cuando corresponde en una única acción **Responder al cliente**.
- FR-004: Épica 2 — primera alerta de respuesta una hora después del mensaje.
- FR-005: Épica 1 y Épica 5 — resolver desde el seguimiento y sus proyecciones Push/internas.
- FR-006: Épica 1 y Épica 5 — posposición repetible y atajos horarios compartidos, con resolución exacta server-side.
- FR-007: Épica 1 y Épica 5 — ignorar/No requiere respuesta sin alterar el estado comercial.
- FR-008: Épica 2 — deduplicación de mensajes, acciones y notificaciones de respuesta.
- FR-009: Épica 2 — último mensaje y contexto sin nota obligatoria.
- FR-010: Épica 1 para acciones manuales y Épica 3 para aceptación exacta de WhatsApp.
- FR-011: Épicas 1, 2, 3 y 5 — transiciones idempotentes frente a red, doble toque y reintentos.
- FR-012: Épica 1 — distinguir Hecho, Ignorado y Pospuesto.
- FR-013: Épica 2 — confirmación manual desde WhatsApp nativo diferenciada de Evolution.
- FR-014: Épica 3 — primer contacto siempre explícito.
- FR-015: Épica 3 — enviar recursos disponibles sin bloquear por faltantes.
- FR-016: Épica 3 — impedir duplicados de un contacto aceptado.
- FR-017: Épica 3 — resumen por recurso con `ACCEPTED`, `FAILED`, `UNKNOWN` y `NOT_AVAILABLE`, y reintento manual limitado a `FAILED`.
- FR-018: Épica 5 — generar Push desde servidor al vencer la acción.
- FR-019: Épica 5 — comandos Hecho, No requiere respuesta y posposición en Push.
- FR-020: Épica 5 — separar eventos de generación, servicio, suscripción y acción observable.
- FR-021: Épica 5 — no afirmar entrega física ni lectura.
- FR-022: Épica 5 — idempotencia de notificaciones y comandos.
- FR-023: Épica 5 — contexto mínimo de lead y acción.
- FR-024: Épica 5 — una delivery por identidad canónica vigente y por suscripción válida, sin duplicar una identidad.
- FR-025: Épica 5 — frontera COULD; el escalamiento WhatsApp no se implementa sin política aprobada.
- FR-026–FR-033: Épica 7 — objetivo del piloto gobernado por discovery gate AD-14; solo discovery hasta superar el gate y luego retorno a planificación para historias de implementación.
- FR-034: Épica 6 — registrar manualmente **Cliente decidió comprar**.
- FR-035: Épica 6 — guardar fecha/hora operativa del registro.
- FR-036–FR-037: Future/deferred — no tienen épica implementable actual; solo vuelven a planificación si el producto reabre el segundo bloque.
- FR-038: Épica 2 — clasificación determinista, etiqueta `Revisar` y corrección manual.
- FR-039: Épica 1 — cuatro caminos posteriores al guardado y componente de acción reutilizado.
- FR-040: Épica 2 — aviso de teléfono existente y matching operativo sin fusión.

## Epic List

Se proponen seis épicas de valor y una épica de discovery gate. El orden numérico expresa dominios de valor, no una secuencia de implementación. La primera base implementable es la Épica 4: su gate fundacional de Auth/RLS/eventos habilita después las mutaciones privadas de las Épicas 1, 2, 3, 5 y 6. La Épica 1 puede seguir siendo la primera superficie de valor revisada después de ese gate; no se declara como primera épica implementable.

### Epic 1: Captura rápida y próxima acción confiable

**Objetivo:** permitir guardar un lead sin nota ni próxima acción y continuar desde una pantalla intermedia que ofrezca cuatro caminos claros: ir al dashboard, compartir contacto/QR, programar acción o enviar primer contacto por WhatsApp.

**Valor para el asesor:** captura rápida durante la atención y control del siguiente paso sin obligar a completar formularios ni pasar por `/qr`.

**Alcance observable:**

- Una historia de auditoría revisa `/dashboard`, `/nuevo`, `/whatsapp` y `/qr` para retirar frases, labels, estados vacíos, errores y CTAs que sugieran CRM multiusuario, SaaS o herramienta corporativa pesada; no implica que Epic 1 sea el primer trabajo implementable.
- La limpieza conserva el diseño y comportamiento brownfield, con alcance verificable y sin rediseño general.
- Guardar muestra una pantalla intermedia con cuatro caminos: **Ir al dashboard**, **Compartir contacto/QR**, **Programar acción** y **Enviar primer contacto por WhatsApp**; no redirige automáticamente a `/qr`.
- **Programar acción** despliega en esa misma pantalla el componente reutilizado del dashboard.
- El asesor puede crear, editar, agregar, completar, posponer, ignorar y eliminar acciones; eliminar requiere confirmación, equivale a `CANCELED`, emite `next_action_canceled` en la misma transacción, cancela proyecciones Push/capabilities no iniciadas, conserva auditoría y evidencia, y no permite que una carrera posterior reemplace la acción cancelada.
- Los atajos incluyen `En 1 hora`, `Más tarde`, `Mañana`, `En 3 días` y `Elegir fecha y hora`. `En 1 hora` es ahora más una hora exacta; `Más tarde` es hoy a las 16:00 antes de esa hora local y mañana a las 09:00 desde las 16:00; `Mañana` es mañana a las 09:00; `En 3 días` es tres días calendario después a las 09:00; `Elegir fecha y hora` usa el valor explícito del asesor.
- Las fechas nuevas son instantes exactos resueltos server-side desde `America/Guayaquil`. Los comandos Push cerrados soportados por AD-15 no aceptan timestamps del cliente; `Elegir fecha y hora` solo está disponible como mutación manual autenticada en la PWA.
- Antes de generar historias, este alcance se particiona en cortes revisables: limpieza/captura y pantalla intermedia; contrato del ciclo de acciones; resolución de horarios y cancelación; y regresiones Realtime/refresh.

**Trazabilidad:** FR-001–FR-002, FR-005–FR-007, FR-010 para acciones manuales, FR-011–FR-012 y FR-039; NFR-001–NFR-002 y NFR-009–NFR-012; AD-1, AD-2, AD-4 y AD-6; UX-DR1–UX-DR7, UX-DR9 y UX-DR14–UX-DR17; Flow 1 y Flow 2.

**Dependencias:** rutas y componentes existentes, migraciones 003/004/006/008, catálogo vigente, Realtime, refresh manual y el gate fundacional de la Épica 4 antes de cualquier mutación privada. La auditoría UX puede preparar el alcance, pero ninguna historia mutante de esta épica se implementa antes de que Epic 4 habilite Auth/RLS/eventos.

**Riesgos:** definir una hora rápida que ya pasó sin persistir un instante inválido, mezclar el componente de acciones con el dashboard, regresiones de captura/Realtime y eliminar evidencia accidentalmente.

**Comportamiento preservado:** campos actuales de captura, score, multi-modelo, nota opcional, estados existentes, filtros, paginación, borrado lógico de leads, Realtime, refresh manual, QR como herramienta opcional y configuración WhatsApp.

**Criterio de terminado de la épica:** el asesor completa el flujo de captura y decisión desde Android sin navegación obligatoria a QR; las acciones tienen estados y tiempos exactos; el mismo componente funciona desde pantalla intermedia y dashboard; las mutaciones fallidas conservan el estado anterior; y las pantallas auditadas ya no sugieren un producto fuera del piloto.

### Epic 2: Responder al cliente sin perder el trabajo pendiente

**Objetivo:** clasificar cada mensaje entrante con reglas deterministas en `Sin respuesta sugerida`, `Respuesta pendiente` o `Revisar`, y converger de forma segura en una única acción de respuesta cuando exista oportunidad de contestar.

**Valor para el asesor:** priorizar oportunidades sin perder preguntas comerciales ni crear tareas duplicadas.

**Alcance observable:**

- `Sin respuesta sugerida` solo coincide con la allowlist exacta del PRD: agradecimientos y confirmaciones cerradas explícitas, o únicamente los emojis permitidos. Texto adicional, URL, número, pregunta o expresión no listada no puede entrar en esta categoría.
- `Respuesta pendiente` requiere una señal determinista de pregunta, solicitud o intención comercial del vocabulario aprobado en el PRD y crea/actualiza `Responder al cliente`.
- `Revisar` cubre todo mensaje ambiguo o sin confianza suficiente; también crea/actualiza `Responder al cliente`, pero conserva la etiqueta visible `Revisar`.
- La IA no es obligatoria ni puede cerrar acciones; como máximo queda como futura sugerencia sin autoridad de mutación.
- El asesor corrige con un toque mediante `No requiere respuesta` o `Sí requiere respuesta`, sin formulario.
- Un teléfono existente muestra advertencia no bloqueante con nombre, vehículo y estado anterior, con opción de abrir el registro o crear otra oportunidad.
- Los registros se relacionan por teléfono normalizado sin combinarse automáticamente; la oportunidad más reciente es visualmente principal y las anteriores conservan historial. Para matching de mensajes, el lead no eliminado más reciente es el destino operativo y varios candidatos emiten `inbound_lead_match_ambiguous`.
- `Sí requiere respuesta` deja el resultado visible `Respuesta pendiente` y mantiene/crea la única acción `Responder al cliente` en `PENDING`, salvo que una posposición explícita conserve `POSTPONED`; `No requiere respuesta` deja el resultado visible `No requiere respuesta` y cierra la acción actual como `IGNORED`, retirando recordatorios. La clasificación automática y la corrección manual quedan como evidencias separadas; la IA no cierra acciones.
- Un mensaje nuevo actualiza mensaje fuente, preview, contexto y `action_version`. Si la acción `Responder al cliente` está explícitamente `POSTPONED`, conserva exactamente `scheduled_for`; si no está pospuesta, se programa una hora después del mensaje entrante correspondiente.
- Webhook, mensajes nuevos y comandos manuales usan deduplicación, versión, mensaje fuente y transiciones atómicas.

**Trazabilidad:** FR-003–FR-004, FR-008–FR-009, FR-013, FR-038 y FR-040; NFR-001–NFR-003, NFR-007–NFR-008 y NFR-013–NFR-014; AD-4, AD-5, AD-6 y AD-10; UX-DR5, UX-DR8–UX-DR9, UX-DR17–UX-DR18; Flow 5.

**Dependencias:** Épica 4 para Auth/RLS/eventos; después, la Épica 1 como dueña del ciclo de acciones; webhook Evolution y `lead_messages` existentes.

**Riesgos:** clasificación ambigua, mensajes fuera de orden, carreras entre webhook y asesor, varios leads con el mismo teléfono y regresión de estados.

**Comportamiento preservado:** token del webhook, rechazo de JSON inválido, `remoteJidAlt`, distinción entrante/saliente, deduplicación por proveedor, progresión de estados, matching de leads no eliminados y persistencia de mensajes.

**Criterio de terminado de la épica:** la allowlist y el vocabulario de clasificación tienen casos positivos y negativos verificables; cada mensaje queda clasificado y trazable; `Sin respuesta sugerida` no crea trabajo; `Respuesta pendiente` y `Revisar` convergen en una única acción; el asesor puede corregir en un toque; ningún registro se fusiona automáticamente y las carreras no duplican ni cierran la acción equivocada.

### Epic 3: Primer contacto por WhatsApp, explícito y honesto

**Objetivo:** iniciar el primer contacto solo por decisión explícita del asesor y mostrar un resumen común de recursos en la pantalla posterior al guardado y en el dashboard.

**Valor para el asesor:** saber qué se envió, qué faltó y qué puede reintentarse sin repetir un contacto aceptado.

**Alcance observable:**

- La pantalla posterior al guardado ofrece `Enviar primer contacto por WhatsApp` como cuarto botón.
- El envío muestra `Enviando`, bloquea doble toque, ofrece feedback sutil y se deshabilita cuando el contacto fue aceptado.
- El resumen común cubre mensaje, imagen y ficha técnica, con icono y estado funcional `ACCEPTED`, `FAILED`, `UNKNOWN` o `NOT_AVAILABLE`.
- `ACCEPTED` nunca se reenvía. `FAILED` muestra reintento manual únicamente para ese recurso, operación y versión. `UNKNOWN` queda pendiente de reconciliación o prueba de no efecto. `NOT_AVAILABLE` no crea efecto ni reintento hasta que exista una nueva versión verificable.
- La ficha técnica solo se considera disponible si existe una fuente verificable; de lo contrario se muestra `NOT_AVAILABLE`.

**Regla adoptada:** la reparación manual está permitida solo para recursos `FAILED`, identificada por operación, tipo y versión. No permite reparación automática, reenvío de recursos `ACCEPTED`, reintento de `UNKNOWN` sin reconciliación o prueba de no efecto, ni efecto/reintento de `NOT_AVAILABLE` sin una nueva versión verificable.

**Trazabilidad:** FR-010 para aceptación exacta de WhatsApp, FR-014–FR-017; NFR-001–NFR-003 y NFR-014; SM-003 y SM-006; AD-7, AD-8, AD-10 y AD-12; UX-DR10 y UX-DR17; Flow 6.

**Dependencias:** Épica 4 para Auth/RLS/eventos; Épica 1 para el contrato de acciones y el camino de entrada; Evolution API, plantilla/perfil persistentes, catálogo e imágenes existentes.

**Riesgos:** efectos externos inciertos, doble envío servidor, fallo parcial de media, ficha técnica sin fuente verificable y estados del proveedor fuera de orden.

**Comportamiento preservado:** comando explícito, normalización de teléfono, plantillas persistentes, envío server-side, fallback de catálogo, estados Evolution, feedback funcional y regla de que un fallo no marca el lead como contactado.

**Criterio de terminado de la épica:** un contacto aceptado no se repite, cada recurso conserva evidencia individual, solo un recurso `FAILED` puede reintentarse manualmente, `UNKNOWN` no se reintenta a ciegas, `NOT_AVAILABLE` no genera efecto, y guardar el lead nunca envía WhatsApp automáticamente.

### Epic 4: Acceso privado y confianza operativa

**Objetivo:** asegurar el acceso del único asesor, ownership de los datos y trazabilidad de operaciones sin exponer secretos ni afirmar resultados no observables.

**Valor para el asesor:** confianza en la privacidad, continuidad y honestidad operativa del sistema.

**Trazabilidad:** NFR-005–NFR-008 y NFR-013–NFR-014; AD-3, AD-6, AD-10 y AD-12; UX-DR15 y UX-DR17.

**Dependencias:** esquema actual con `user_id`/`tenant_id`, Supabase Auth, RLS, webhook Evolution y migraciones aditivas.

**Riesgos:** cutover Auth/RLS, callbacks concurrentes, datos ocultos por ownership incorrecto, secretos filtrados y divergencia entre Next.js, Edge y PostgreSQL.

**Comportamiento preservado:** flujo de captura, dashboard, WhatsApp, Realtime, webhook y borrado lógico durante las fases compatibles; sin multiusuario, roles ni signup público.

**Criterio de terminado de la épica:** cada fase tiene evidencia revisable: (A) UUID singleton validado, backup, login/logout, ownership en nuevas escrituras y webhook dual-compatible; (B) mantenimiento de UI, lock de cutover, backfill, cero filas null/orphan/mismatched, RLS autenticado, revocación de políticas anónimas y webhook compatible; después, smoke tests de lectura, escritura reversible, Realtime, webhook, eventos canónicos, secretos server-side y errores funcionales demuestran acceso privado, compatibilidad y auditoría completa.

### Epic 5: Recordatorios Push accionables fuera de la PWA

**Objetivo:** recordar acciones desde Android y mantener una sección interna `Notificaciones pendientes` como proyección de las mismas acciones de seguimiento.

**Valor para el asesor:** resolver trabajo sin abrir la lista general y recuperar visibilidad cuando Push falle.

**Alcance observable:**

- Registrar la cadena canónica: la materialización emite `push_delivery_scheduled`; solo una delivery vencida que cruza el fence pre-I/O emite `push_generated`; el resultado del proveedor emite `push_service_result`. Ninguno de estos eventos afirma entrega física o lectura.
- El límite de 60 segundos aplica a iniciar la solicitud Push desde el servidor respecto a la hora programada; no afirma que el asesor deba verla o actuar en ese plazo.
- La lista interna muestra las mismas acciones abiertas `PENDING` o `POSTPONED`, futuras o vencidas, con lead, acción, fecha, contexto y evidencia Push separada. No se limita a deliveries generadas y nunca afirma recepción física o lectura.
- Dashboard, notificación Android y lista interna permiten `Hecho`, `No requiere respuesta`, `En 1 hora`, `Más tarde`, `Mañana` y `En 3 días`. `En 1 hora` es ahora más una hora exacta; `Más tarde` es hoy a las 16:00 antes de esa hora local o mañana a las 09:00 desde las 16:00; `Mañana` es mañana a las 09:00; `En 3 días` es tres días calendario después a las 09:00. `Elegir fecha y hora` solo existe en la PWA autenticada.
- Cada delivery se identifica por acción, `action_version`, suscripción y `subscription_generation`; esa identidad admite como máximo una solicitud Push. Cambiar de superficie no crea otra delivery; dos suscripciones válidas pueden recibir una cada una.
- Cambiar `action_version` crea una identidad distinta solo si la materialización vuelve a encontrar una acción abierta vigente y `scheduled_for` vencida; el cambio de versión por sí solo no autoriza un segundo envío inmediato. No se afirma entrega física ni lectura.
- Resolver o posponer en cualquier superficie actualiza el mismo registro; una acción pospuesta sale de la lista y reaparece al llegar su nueva fecha.
- Si Push falla, la acción queda pendiente en dashboard y la lista no la presenta como enviada exitosamente.

**Trazabilidad:** FR-006 y FR-018–FR-025; NFR-001–NFR-004, NFR-012 y NFR-015; SM-005; AD-4, AD-7, AD-9, AD-12, AD-13 y AD-15; UX-DR9, UX-DR11–UX-DR12, UX-DR14 y UX-DR16; Flow 4.

**Dependencias:** Épica 4 para sesión/ownership/eventos y Épica 1 para acciones y tiempos, además de Supabase Cron, Edge Function, Vault y dispositivo Android real.

**Riesgos:** scheduler fuera de ventana, carreras entre acción y suscripción, capabilities replayables, estados `UNKNOWN`, permisos y compatibilidad de navegador.

**Comportamiento preservado:** dashboard como fallback, Realtime y refresh manual como estados independientes, acciones pendientes ante fallo, PWA autenticada y ausencia de afirmaciones de entrega/lectura.

**Criterio de terminado de la épica:** una proyección interna y cada delivery por suscripción representan la misma acción/versionado, cada identidad canónica genera como máximo una solicitud, los comandos cerrados de AD-15 son idempotentes, todos los atajos resuelven server-side en `America/Guayaquil`, el servidor inicia la solicitud dentro de 60 segundos, las evidencias se distinguen y ningún fallo de Push cierra u oculta la acción.

### Epic 6: Registrar la decisión de compra sin construir el segundo bloque

**Objetivo:** registrar manualmente `Cliente decidió comprar` y mostrar después `Compra registrada` con fecha/hora operativa.

**Valor para el asesor:** marcar la frontera comercial sin añadir otro CRM ni alterar el seguimiento.

**Trazabilidad:** FR-034–FR-035; SM-008; AD-4, AD-10 y AD-11; UX-DR5, UX-DR17 y Flow 8.

**Dependencias:** Épica 4 para Auth/RLS/eventos, Épica 1, tarjeta/detalle del lead y persistencia PostgreSQL.

**Riesgos:** inferencia desde chat, doble registro, confusión con `CERRADO` y alteración accidental de acciones.

**Comportamiento preservado:** estados comerciales actuales, separación entre conversación y compra, acciones existentes y futuras, borrado lógico y ausencia de pagos, financiación, matrícula o entrega.

**Criterio de terminado de la épica:** el registro es manual, idempotente y único por lead; el segundo clic devuelve el registro existente sin duplicar; es visible como `Compra registrada`, conserva fecha/hora operativa, mantiene las acciones existentes y futuras, no cambia el estado comercial, no elimina/cancela/oculta/bloquea acciones, no crea hitos, blockers ni delivery, no calcula duración del segundo bloque y no inicia procesos posteriores.

### Epic 7: Discovery gate para sincronización corporativa — sin implementación aún

**Objetivo:** mantener FR-026–FR-033 dentro del objetivo del piloto y completar el discovery gate necesario para decidir si una única operación corporativa puede implementarse de forma reversible y verificable.

**Valor para el asesor:** evitar registros corporativos duplicados o inciertos cuando todavía no existe evidencia suficiente del flujo real.

**Alcance observable:** el discovery debe documentar flujo autorizado, mapeo de campos, estados activos/finales, postcondición, recuperación de sesión, tratamiento de incertidumbre y plan reversible de validación. Mientras AD-14 no esté superado, no se crean historias de implementación ni se agregan adapter, worker, scraping, Playwright, credenciales o mutaciones corporativas.

**Trazabilidad:** FR-026–FR-033; NFR-002 y NFR-005–NFR-008; SM-007; AD-7, AD-12 y AD-14; UX-DR13 y Flow 7.

**Dependencias:** descubrimiento con el asesor del flujo real, mapeo de campos, estados autorizados, postcondición, recuperación y plan reversible de validación.

**Riesgos:** sesión caducada, interfaz desconocida, duplicados, credenciales reales, cambios inesperados y resultado incierto.

**Comportamiento preservado:** no se agregan adapter, worker, scraping, Playwright, credenciales ni mutaciones corporativas antes de superar AD-14.

**Criterio de terminado de la épica:** el gate solo se considera superado cuando el descubrimiento y el plan seguro cumplen AD-14 y son aprobados. En ese momento Epic 7 vuelve a planificación antes de crear historias de implementación; hasta entonces el objetivo corporativo permanece vigente, pero no se ejecuta. La implementación futura deberá conservar preview, confirmación nueva tras reautenticación, detención ante incertidumbre, idempotencia y verificación con ID externo.
