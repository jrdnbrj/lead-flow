---
project_name: 'lead-flow'
user_name: 'Jordan'
date: '2026-09-02'
sections_completed: ['technology_stack', 'language_rules', 'framework_rules', 'testing_rules', 'quality_rules', 'workflow_rules', 'anti_patterns', 'current_state_roadmap', 'production_safety']
status: 'complete'
existing_patterns_found: 12
rule_count: 72
optimized_for_llm: true
---

# Project Context for AI Agents

_Este archivo contiene reglas y patrones críticos que los agentes de IA deben seguir al implementar código en LeadFlow. Se enfoca en detalles específicos del proyecto que podrían pasarse por alto._

La referencia compacta de producto —qué está hecho y qué sigue— está en
[`planning-artifacts/leadflow-current-state-roadmap-2026-09-02.md`](./planning-artifacts/leadflow-current-state-roadmap-2026-09-02.md).
Las reglas operativas de incidentes están en
[`docs/project-context.md`](../docs/project-context.md). Si una regla de este
documento contradice código, migraciones o runtime actual, verifícala y
actualízala antes de implementar.

---

## Technology Stack & Versions

- Next.js `16.2.12` con App Router y React `19.2.4`.
- TypeScript `^5` con `strict: true`, alias `@/*` hacia la raíz y resolución `bundler`.
- Supabase SSR `^0.12.3` y Supabase JS `^2.110.9`, con PostgreSQL remoto y migraciones SQL versionadas.
- Evolution API `v2.3.7` como gateway de WhatsApp y Redis `7-alpine` para sesión/cache.
- Tailwind CSS `^4`, Lucide React, React Hook Form, Zod `^4.4.3`, `qrcode.react` y `xlsx`.
- Node.js `22-alpine` en Docker; Next.js usa `output: "standalone"` y arranca con `node server.js` dentro del runner.
- ESLint `9` con `eslint-config-next` `16.2.12`; validaciones base: `npm run lint`, `npm run typecheck` y `npm run build`.
- Las migraciones Supabase están versionadas y actualmente llegan hasta `059`; se aplican en orden y el estado remoto se verifica antes de afirmar que están desplegadas. La configuración TEA está instalada y el repositorio usa contratos estáticos dirigidos; no existe todavía una suite general de tests en `package.json`.

## Critical Implementation Rules

### Language-Specific Rules

- Mantener `strict: true`; no introducir `any`. Para payloads externos usar `unknown`, `Record<string, unknown>` y type guards.
- Definir tipos de dominio e interfaces compartidas en `lib/domain` o módulos especializados; evitar duplicar contratos entre UI, acciones y repositorios.
- Validar entradas de formularios, Server Actions y webhooks antes de persistir o llamar servicios externos. Usar Zod con `safeParse`.
- Las operaciones mutantes deben devolver `ActionResponse<T>` con `{ success, data?, error?, warning? }`.
- Mantener la lógica pura —scoring, normalización de teléfonos, etiquetas y transformaciones— fuera de React y de los componentes de UI.
- Usar el alias `@/*` configurado en `tsconfig.json`; conservar nombres de archivos y funciones en `camelCase`/`kebab-case` según el patrón existente.
- Capturar errores desconocidos con `error instanceof Error`; no exponer mensajes crudos de proveedores cuando exista un mensaje funcional para el usuario.
- No importar secretos ni clientes admin en componentes `"use client"`; `SUPABASE_SERVICE_ROLE_KEY` y credenciales de Evolution permanecen server-side.
- Reutilizar las funciones de dominio existentes para normalizar teléfonos y estados; no implementar conversiones paralelas dentro de componentes o rutas.

### Framework-Specific Rules

- Tratar los Server Components como predeterminados; agregar `"use client"` únicamente cuando el componente necesite estado, eventos, hooks o APIs del navegador.
- Mantener las mutaciones en Server Actions con `"use server"` y validar allí nuevamente la entrada, aunque el formulario ya valide en el cliente.
- Consultar Supabase mediante el repositorio y los clientes existentes; no llamar directamente a Supabase desde componentes de UI.
- Usar el cliente server-side para Server Components/Actions, el cliente browser para Realtime y el cliente admin exclusivamente para operaciones protegidas.
- Las variables `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` deben estar disponibles durante el build Docker porque el navegador crea el cliente Realtime en tiempo de ejecución.
- Mantener las credenciales privadas —`SUPABASE_SERVICE_ROLE_KEY`, `EVOLUTION_API_KEY` y tokens de webhook— exclusivamente en el servidor.
- Los Route Handlers de Evolution deben ejecutarse en `nodejs`, validar el token `x-evolution-webhook-token` y devolver respuestas `{ success, ... }`.
- Correlacionar mensajes mediante `provider_message_id` y respetar la progresión de estados de WhatsApp; no aplicar estados antiguos sobre estados más avanzados.
- Suscribir Realtime únicamente a `leads`, `lead_messages` y `lead_follow_up_actions`; separar el estado de conexión automática del estado de refresh manual.
- No usar `next start` para este proyecto: el build standalone se ejecuta con `node .next/standalone/server.js` o `node server.js` dentro del contenedor.
- Antes de cambiar APIs o convenciones de Next.js, leer la documentación local indicada en `AGENTS.md` dentro de `node_modules/next/dist/docs/`.

### Testing Rules

- El repositorio no contiene una suite general ni script `test` en `package.json`; sí contiene contratos estáticos por épica y el gate `scripts/ci-contract-checks.sh`. No afirmar que una validación está cubierta si no se ejecutó el contrato correspondiente.
- Antes de entregar cambios, ejecutar como mínimo `npm run lint`, `npm run typecheck`, `npm run build`, `docker compose config --quiet` y `git diff --check`.
- Para cambios en scoring, normalización de teléfonos, plantillas o fechas, priorizar pruebas unitarias de la lógica pura en `lib/domain` y módulos independientes.
- Para cambios en el webhook, cubrir payload JSON inválido, token ausente/incorrecto, mensajes duplicados, mensajes entrantes, mensajes salientes y estados recibidos fuera de orden.
- Para cambios de persistencia, verificar filtros de `deleted_at`, políticas RLS, RPC de borrado lógico y compatibilidad con Supabase sin configuración local.
- Para cambios de Realtime, comprobar actualizaciones de leads, mensajes entrantes, mensajes salientes y seguimientos sin recargar la página.
- Las pruebas de integraciones externas deben usar fixtures o mocks; nunca incluir credenciales reales de Supabase, Evolution API o webhooks.
- Si se agrega una suite de pruebas, documentar su framework, ubicación y comando en este archivo; actualmente no existe una convención de tests establecida.

### Code Quality & Style Rules

- Usar la configuración existente de ESLint basada en `eslint-config-next/core-web-vitals` y TypeScript; no desactivar reglas globalmente para ocultar errores.
- No introducir Prettier u otra herramienta de formato sin una decisión explícita del proyecto; conservar el estilo actual.
- Mantener la organización por responsabilidad: `app/` para rutas y handlers, `components/` para UI, `lib/domain/` para tipos y lógica pura, `lib/leads/`, `lib/config/` y `lib/whatsapp/` para casos de uso y servicios, y `supabase/migrations/` para SQL numerado.
- Usar nombres de archivos en minúsculas con guiones, componentes en PascalCase, funciones y variables en camelCase, y tipos/interfaces en PascalCase.
- Mantener la interfaz mobile-first y reutilizar las variables visuales y clases Tailwind existentes antes de crear nuevos estilos globales.
- Documentar solo decisiones no obvias: límites de proveedor, estados de WhatsApp, zonas horarias, seguridad, fallback y compatibilidad legacy.
- Actualizar `README.md` cuando cambien comandos, variables de entorno, flujo de despliegue, migraciones o comportamiento operativo.
- Mantener `.env.example` sincronizado en estructura y líneas con la configuración esperada; nunca agregar secretos reales.
- No usar `lib/leads/mock-data.ts` como fuente de verdad de producción ni introducir una segunda persistencia local que compita con Supabase.
- No mezclar cambios de aplicación con archivos generados de `_bmad-output` sin una razón explícita.

### Development Workflow Rules

- Mantener commits en inglés con Conventional Commits; el patrón existente usa scopes como `feat(leadflow)` y `feat(whatsapp)`. No inventar tickets.
- Revisar `git status` antes de trabajar y mantener separados los cambios de aplicación, documentación, BMad y configuración local.
- Antes de entregar cambios, ejecutar `lint`, `typecheck`, `build`, `docker compose config --quiet` y `git diff --check`; reportar cualquier validación no ejecutada.
- Aplicar las migraciones Supabase en orden y verificar el estado remoto antes de afirmar que una migración fue desplegada.
- Para despliegue, pasar las variables `NEXT_PUBLIC_*` como argumentos de build Docker; las variables privadas deben llegar únicamente como entorno de ejecución.
- Ejecutar la aplicación standalone con `node .next/standalone/server.js` localmente o `node server.js` dentro del runner Docker.
- Verificar `/api/health` después de levantar el contenedor y conservar el healthcheck configurado.
- Al cambiar el esquema, actualizar la migración correspondiente, `lib/supabase/database.ts`, repositorios afectados y documentación operativa.
- Al cambiar el flujo de WhatsApp, verificar instancia, webhook, token, persistencia del mensaje y estados posteriores antes de considerar el envío completo.
- La configuración persistente del vendedor y la plantilla tiene prioridad; los campos vacíos vuelven a los valores de entorno.
- Antes de operaciones destructivas remotas, confirmar el alcance exacto y verificar por separado la postcondición —conteos, configuración y catálogo—.
- No hacer push, publicar ni modificar servicios remotos salvo que la tarea lo solicite explícitamente.

### Critical Don't-Miss Rules

- Nunca exponer `SUPABASE_SERVICE_ROLE_KEY`, `EVOLUTION_API_KEY`, `EVOLUTION_DATABASE_URL` o `EVOLUTION_WEBHOOK_TOKEN` mediante `NEXT_PUBLIC_*`, componentes cliente, logs o repositorio.
- No asumir que las variables `NEXT_PUBLIC_*` disponibles en runtime bastan para Realtime: también deben llegar al stage `builder` de Docker.
- No tratar la persistencia local, datos demo o `mock-data` como fuente de verdad cuando Supabase está configurado.
- No eliminar físicamente leads directamente desde la UI; usar el flujo de borrado lógico/RPC para excluirlos, cancelar seguimientos y evitar que el webhook los vuelva a asociar.
- No procesar grupos, broadcasts o JIDs no asociados a un teléfono válido; considerar también `remoteJidAlt` para eventos `@lid`.
- No insertar mensajes duplicados: buscar primero por `provider_message_id`.
- No aplicar estados de WhatsApp antiguos sobre estados más avanzados; `FAILED` tiene tratamiento especial.
- No marcar un lead como contactado si el envío falló; solo un envío aceptado o una respuesta del cliente debe avanzar el estado.
- No confundir un mensaje entrante con uno saliente: revisar `fromMe` antes de actualizar conversación, preview y estados.
- No calcular alertas de seguimiento con la zona horaria del servidor; usar `America/Guayaquil` y el inicio del día local.
- No enviar un modelo sin imagen: cada modelo seleccionable necesita una imagen válida o el fallback de catálogo.
- No representar un refresh manual como una reconexión de Realtime; son estados independientes y deben conservar mensajes de UI distintos.
- No eliminar `user_id`/`tenant_id`, aunque el modo actual sea vendedor único; son parte de la preparación multi-tenant.
- No modificar APIs o convenciones de Next.js basándose en memoria antigua: consultar primero la documentación local exigida por `AGENTS.md`.

---

## Usage Guidelines

**Para agentes de IA:**

- Leer este archivo antes de implementar código.
- Seguir todas las reglas aplicables y preferir la opción más restrictiva cuando exista duda.
- Reportar explícitamente las validaciones no ejecutadas o las dependencias externas no verificadas.
- Actualizar este archivo cuando aparezcan patrones de implementación nuevos y confirmados.

**Para humanos:**

- Mantener el documento enfocado en reglas específicas que no sean obvias para un agente.
- Actualizarlo cuando cambien el stack, la arquitectura, los flujos de integración o el despliegue.
- Revisar periódicamente las reglas y eliminar las que ya no aporten valor.

Última actualización: 2026-09-02
