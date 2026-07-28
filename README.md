# LeadFlow

LeadFlow es una aplicación móvil-first para capturar prospectos automotrices durante eventos, calificarlos en el momento y llevarlos al siguiente contacto con contexto.

## Inicio rápido

```bash
npm install
cp .env.example .env.local
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000). La app funciona en modo demo con leads de muestra y guarda capturas nuevas en el navegador mientras Supabase no tenga una sesión autenticada.

## Variables de entorno

`.env` contiene la configuración local existente y `.env.example` mantiene la misma estructura y líneas para nuevos entornos. Las variables `NEXT_PUBLIC_SELLER_*` alimentan la vCard del QR. Las variables `SUPABASE_SERVICE_ROLE_KEY` solo se usan como secreto de la Edge Function y no deben exponerse al frontend.

## Arquitectura

- `lib/domain`: tipos de dominio y scoring puro, independiente de React.
- `lib/leads`: validación Zod, Server Action y repositorio Supabase con fallback local UX-first.
- `components`: captura táctil, dashboard, navegación y QR vCard 3.0.
- `supabase/migrations`: tabla `leads`, trigger de scoring, índices y RLS.
- `supabase/functions/send-whatsapp-welcome`: webhook asíncrono hacia Evolution API; una caída de WhatsApp marca el lead como `FAILED` sin revertir la captura.

## Supabase

Aplica `supabase/migrations/001_leadflow_core_schema.sql` y configura un Database Webhook de `INSERT` sobre `public.leads` que invoque `send-whatsapp-welcome`. Define en la función:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
EVOLUTION_API_URL
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
