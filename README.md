# LeadFlow

LeadFlow es una aplicación móvil-first para capturar prospectos automotrices durante eventos, calificarlos en el momento y llevarlos al siguiente contacto con contexto.

## Inicio rápido

```bash
npm install
cp .env.example .env.local
npm run dev
```

Para levantar la app y Evolution API:

```bash
docker compose up -d --build
```

Abre [http://localhost:3000](http://localhost:3000). Supabase y el PostgreSQL de Evolution son remotos; Docker solo levanta LeadFlow, Evolution API y Redis local para la sesión/cache de Baileys.

## Variables de entorno

`.env` contiene la configuración local existente y `.env.example` mantiene la misma estructura y líneas para nuevos entornos. Las variables `NEXT_PUBLIC_SELLER_*` alimentan la vCard del QR. `EVOLUTION_WEBHOOK_TOKEN` protege los eventos entrantes; `SUPABASE_SERVICE_ROLE_KEY` es un secreto de servidor y nunca debe exponerse al frontend.

## Arquitectura

- `lib/domain`: tipos de dominio y scoring puro, independiente de React.
- `lib/leads`: validación Zod, Server Action y repositorio Supabase con fallback local UX-first.
- `components`: captura táctil, dashboard, navegación y QR vCard 3.0.
- `supabase/migrations`: tabla `leads`, scoring, RLS, mensajes, múltiples acciones de seguimiento, configuración persistente y borrado lógico.
- `app/api/webhooks/evolution`: receptor Next.js de respuestas del cliente y estados de Evolution.
- `lib/leads/follow-up.ts`: calcula recordatorios al inicio del día calendario en `America/Guayaquil`.
- `lib/supabase/client.ts`: suscripción Realtime para actualizar el dashboard solo cuando cambia un lead, mensaje o seguimiento.
- `supabase/functions/send-whatsapp-welcome`: Edge Function heredada disponible para un flujo alternativo; el dashboard actual envía desde Next.js.

## Supabase

Aplica en orden `supabase/migrations/001_leadflow_core_schema.sql`, `002_leadflow_anonymous_dashboard_and_whatsapp.sql`, `003_leadflow_follow_up_and_messages.sql`, `004_leadflow_follow_up_actions.sql`, `005_leadflow_backfill_contacted_status.sql` y `006_leadflow_persistent_config_realtime_and_soft_delete.sql`. Los leads se guardan en `public.leads`, los mensajes en `public.lead_messages`, los seguimientos múltiples en `public.lead_follow_up_actions` y la configuración persistente en `public.leadflow_settings`. El dashboard anónimo solo lee/actualiza filas con `user_id is null`, que es el modo vendedor único actual.

Con la CLI autenticada, el despliegue completo es:

```bash
supabase login
SUPABASE_TELEMETRY_DISABLED=1 npx supabase db push --linked
SUPABASE_TELEMETRY_DISABLED=1 npx supabase functions deploy send-whatsapp-welcome --project-ref <project-ref>
```

El botón **Enviar** del dashboard llama una Server Action de Next.js que envía el mensaje directamente a Evolution API desde el servidor. Antes de enviar asegura el webhook de la instancia, registra el mensaje en `lead_messages` y actualiza el lead. El icono de WhatsApp conserva un fallback manual con `wa.me`.

Evolution entrega a Next los eventos `MESSAGES_UPSERT`, `MESSAGES_UPDATE` y `SEND_MESSAGE`. Una respuesta entrante marca la conversación como `ACTIVE`, guarda una vista previa y cancela las acciones pendientes porque la conversación retomó prioridad. Un envío nuevo deja la conversación en `WAITING_CUSTOMER`; los estados posteriores pueden avanzar por `SERVER_ACK`, `DELIVERY_ACK`, `READ`, `PLAYED` o `FAILED`.

Un lead permanece **Nuevo** hasta que se envía un mensaje aceptado por Evolution o el cliente responde; un intento fallido no cambia ese estado. Cada lead puede tener varias acciones de seguimiento. El vendedor puede programarlas con una nota, y desde la tarjeta puede marcarlas como **Hecha**, **Posponer +1 día** o **Ignorar**. Una acción se vuelve alerta desde las 00:00 del día ecuatoriano calculado; permanece visible hasta resolverla.

El dashboard no consulta cada cierto número de segundos: escucha cambios de Supabase Realtime y refresca únicamente cuando cambia un lead, mensaje o acción de seguimiento. Los contactos se pueden **Eliminar** desde su detalle; es un borrado lógico, por lo que dejan de aparecer, no generan recordatorios y el webhook deja de asociarles respuestas.

## Conectar el número de WhatsApp

Evolution API es el gateway HTTP que mantiene una instancia conectada a WhatsApp y expone el endpoint `message/sendText`. No es el número ni reemplaza WhatsApp: el número se vincula escaneando el QR de una instancia desde **WhatsApp → Dispositivos vinculados → Vincular un dispositivo**.

1. `docker compose up -d --build` levanta Evolution API y Redis; Evolution usa el PostgreSQL remoto de Supabase mediante `EVOLUTION_DATABASE_URL`. La API queda en `http://localhost:8081` para desarrollo local y en `http://evolution-api:8080` desde el contenedor de LeadFlow.
2. Usa la instancia indicada por `EVOLUTION_API_INSTANCE_NAME`. Créala en Evolution API desde su panel o endpoint de creación de instancias; los nombres exactos pueden variar según la versión instalada.
3. Abre [http://localhost:3000/whatsapp](http://localhost:3000/whatsapp), escanea el QR con el celular que enviará los mensajes y espera estado `open`. Si el código no escanea, **Generar QR nuevo** reinicia solo la instancia y solicita otro QR; no borra el PostgreSQL remoto.
4. Reinicia Next.js después de cambiar `.env.local`. El botón del dashboard enviará a ese número usando `POST /message/sendText/{EVOLUTION_API_INSTANCE_NAME}`.
5. El webhook de Evolution se configura automáticamente al usar **Enviar**. También puedes revisar que `EVOLUTION_WEBHOOK_URL` apunte a `/api/webhooks/evolution` y que `EVOLUTION_WEBHOOK_TOKEN` sea el mismo secreto en Next y Evolution.

`/qr` tiene otro objetivo: muestra la vCard del vendedor para que el prospecto guarde su nombre, teléfono y correo. No vincula la sesión de Evolution ni sirve para escanear WhatsApp Web.

Los celulares locales de Ecuador se normalizan automáticamente: `0984790449` se envía como `593984790449`. Para otro país se debe escribir el código internacional, por ejemplo `+57 315 204 8890`; si Evolution no encuentra una cuenta, la aplicación muestra un mensaje claro en lugar del error técnico crudo. En `/qr`, **Abrir WhatsApp** abre WhatsApp Web sin iniciar un chat específico.

En `/whatsapp`, cuando la instancia está conectada aparecen primero el perfil y la plantilla, y la vinculación/QR queda al final. Mientras WhatsApp no esté conectado no se muestran esos formularios. El perfil y la plantilla quedan guardados permanentemente en Supabase mediante la clave de servidor; los campos vacíos vuelven a usar el valor correspondiente del `.env`.

La plantilla acepta estas variables: `{{nombre}}`, `{{numero}}` y `{{carro}}` para el cliente; `{{nombre_vendedor}}`, `{{correo_vendedor}}`, `{{empresa_vendedor}}` y `{{numero_vendedor}}` para el vendedor. Las variables se validan y se reemplazan antes de enviar.

La cuenta conectada debe ser un número dedicado del vendedor. Evolution API no permite enviar desde un número que no haya sido previamente vinculado a su instancia.

Variables de la aplicación:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
EVOLUTION_API_URL
EVOLUTION_DATABASE_URL
EVOLUTION_API_KEY
EVOLUTION_API_INSTANCE_NAME
EVOLUTION_WEBHOOK_URL
EVOLUTION_WEBHOOK_TOKEN
```

## Producción

```bash
npm run lint
npm run typecheck
npm run build
docker compose up --build
```

El `Dockerfile` usa `output: "standalone"` de Next.js y el compose expone el puerto `3000` con healthcheck en `/api/health`.
