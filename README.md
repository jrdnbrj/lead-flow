# LeadFlow

LeadFlow es una aplicación móvil-first para capturar prospectos automotrices durante eventos, calificarlos en el momento y llevarlos al siguiente contacto con contexto.

## Inicio rápido

```bash
npm install
cp .env.example .env.local
npm run dev
```

Para levantar toda la infraestructura local, incluida Evolution API:

```bash
docker compose up -d --build
```

Abre [http://localhost:3000](http://localhost:3000). La app trabaja con el esquema de Supabase en modo vendedor único; si Supabase no responde o las migraciones aún no fueron aplicadas, conserva temporalmente la captura en el navegador.

## Variables de entorno

`.env` contiene la configuración local existente y `.env.example` mantiene la misma estructura y líneas para nuevos entornos. Las variables `NEXT_PUBLIC_SELLER_*` alimentan la vCard del QR. Las variables `SUPABASE_SERVICE_ROLE_KEY` solo se usan como secreto de la Edge Function y no deben exponerse al frontend.

## Arquitectura

- `lib/domain`: tipos de dominio y scoring puro, independiente de React.
- `lib/leads`: validación Zod, Server Action y repositorio Supabase con fallback local UX-first.
- `components`: captura táctil, dashboard, navegación y QR vCard 3.0.
- `supabase/migrations`: tabla `leads`, trigger de scoring, índices y RLS.
- `supabase/functions/send-whatsapp-welcome`: webhook asíncrono hacia Evolution API; una caída de WhatsApp marca el lead como `FAILED` sin revertir la captura.

## Supabase

Aplica en orden `supabase/migrations/001_leadflow_core_schema.sql` y `supabase/migrations/002_leadflow_anonymous_dashboard_and_whatsapp.sql`. Los leads se guardan en `public.leads`, se calculan en PostgreSQL y el dashboard anónimo solo lee/actualiza filas con `user_id is null`, que es el modo vendedor único actual.

Con la CLI autenticada, el despliegue completo es:

```bash
supabase login
SUPABASE_TELEMETRY_DISABLED=1 npx supabase db push --linked
SUPABASE_TELEMETRY_DISABLED=1 npx supabase functions deploy send-whatsapp-welcome --project-ref <project-ref>
```

La Edge Function requiere una `EVOLUTION_API_URL` pública; `localhost` solo sirve para el botón de envío desde LeadFlow local. La función no puede entrar a un contenedor que solo existe en tu computador.

El botón **Enviar** del dashboard llama una Server Action de Next.js que envía el mensaje directamente a Evolution API desde el servidor y actualiza `whatsapp_status` a `SENT`. El icono de WhatsApp conserva un fallback manual con `wa.me`. La Edge Function `send-whatsapp-welcome` queda disponible para un Database Webhook opcional si quieres que el primer mensaje salga automáticamente al insertar, sin bloquear la captura.

## Conectar el número de WhatsApp

Evolution API es el gateway HTTP que mantiene una instancia conectada a WhatsApp y expone el endpoint `message/sendText`. No es el número ni reemplaza WhatsApp: el número se vincula escaneando el QR de una instancia desde **WhatsApp → Dispositivos vinculados → Vincular un dispositivo**.

1. `docker compose up -d --build` levanta Evolution API y Redis; Evolution usa el PostgreSQL remoto de Supabase mediante `EVOLUTION_DATABASE_URL`. La API queda en `http://localhost:8081` para desarrollo local y en `http://evolution-api:8080` desde el contenedor de LeadFlow.
2. Usa una instancia, por ejemplo `EVOLUTION_API_INSTANCE_NAME=leadflow`. Créala en Evolution API desde su panel o endpoint de creación de instancias; los nombres exactos pueden variar según la versión instalada.
3. Abre [http://localhost:3000/whatsapp](http://localhost:3000/whatsapp), escanea el QR con el celular que enviará los mensajes y espera estado `open`.
4. Reinicia Next.js después de cambiar `.env.local`. El botón del dashboard enviará a ese número usando `POST /message/sendText/leadflow`.
5. Para el webhook opcional, despliega `send-whatsapp-welcome` y configura en sus secretos `EVOLUTION_API_URL`, `EVOLUTION_API_KEY` y `EVOLUTION_API_INSTANCE_NAME`. Supabase provee `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` a la función desplegada.

La cuenta conectada debe ser un número dedicado del vendedor. Evolution API no permite enviar desde un número que no haya sido previamente vinculado a su instancia.

Variables de la aplicación:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
EVOLUTION_API_URL
EVOLUTION_DATABASE_URL
EVOLUTION_API_KEY
EVOLUTION_API_INSTANCE_NAME
```

## Producción

```bash
npm run lint
npm run typecheck
npm run build
docker compose up --build
```

El `Dockerfile` usa `output: "standalone"` de Next.js y el compose expone el puerto `3000` con healthcheck en `/api/health`.
