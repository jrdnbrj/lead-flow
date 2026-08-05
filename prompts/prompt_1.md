# PROMPT MAESTRO DE ARQUITECTURA Y IMPLEMENTACIÓN - LEADFLOW

## 1. CONTEXTO Y VISIÓN DEL PRODUCTO
Estamos construyendo **LeadFlow**, una plataforma desacoplada y escalable orientada a la aceleración de ventas en eventos, ferias y salas de exhibición automotrices.

### El Caso de Uso de Alto Rendimiento:
El usuario principal es un vendedor top-performer cuyo objetivo comercial es pasar de 70 a **150 ventas anuales**. Actualmente, los cuellos de botella operativos son:
1. **Captura lenta y con fricción de prospectos** durante eventos de alto tráfico.
2. **Falta de calificación objetiva (Scoring)** en tiempo real.
3. **Pérdida de tracción en el primer contacto** (no lograr que el cliente guarde el contacto del vendedor).
4. **Doble digitación manual** para migrar datos desde notas personales hacia el CRM legacy de la compañía.

---

## 2. REQUISITOS DE ARQUITECTURA Y BUENAS PRÁCTICAS

Diseña e implementa la solución siguiendo principios de **Clean Architecture / Modularity**:

1. **Escalabilidad y Desacoplamiento:**
   - La lógica de negocio (scoring, reglas de clasificación) debe estar aislada de los componentes UI.
   - El esquema de base de datos debe ser escalable (preparado conceptualmente para soportar múltiples organizaciones o vendedores en el futuro mediante `tenant_id` o `user_id`).

2. **Resiliencia e Integraciones (WhatsApp):**
   - El envío de mensajes de WhatsApp vía **Evolution API** debe ser asíncrono y resiliente a fallos. Si la API de WhatsApp está fuera de línea, la transacción del lead NO debe rebotar ni fallar. Usa filas de reintento (`retries`) o webhooks/Edge Functions decoupled con manejo explícito de errores.

3. **Manejo de Estado y TypeScript Estricto:**
   - Cero tipos `any`. Define interfaces/types centralizados para Dominio, DTOs y Payload de Webhooks.
   - Manejo centralizado de estados de carga, estados offline/PWA y errores.

4. **Patrón Repository / Server Actions / Route Handlers:**
   - Estructura las llamadas a Supabase utilizando Server Actions de Next.js o servicios parametrizados que abstraigan el cliente de Supabase (`@supabase/ssr`).

---

## 3. ESPECIFICACIÓN DEL STACK TÉCNICO

- **Framework:** Next.js (App Router, React 19/18, TypeScript).
- **Styling & UI:** Tailwind CSS, Lucide Icons, Shadcn/UI (o componentes accesibles equivalentes), `qrcode.react`, `xlsx` (o `exceljs`).
- **Base de Datos & Backend:** Supabase (PostgreSQL, RLS policies habilitadas, Database Functions, Triggers, Edge Functions en Deno).
- **Integraciones:** Evolution API (Self-hosted WhatsApp API).
- **Despliegue & DevOps:** Docker multi-stage optimizado, `docker-compose.yml`, soporte para PWA (`next-pwa` o Web Manifest estandarizado).

---

## 4. ENTREGABLES Y ESTRUCTURA DE CÓDIGO A GENERAR

### A. Capa de Base de Datos y Supabase (`/supabase`)
1. **Migración SQL (`/supabase/migrations/001_leadflow_core_schema.sql`):**
   - Tabla `leads` con tipos enumerados o restricciones de verificación.
   - Campos recomendados: `id`, `user_id`/`vendedor_id`, `created_at`, `full_name`, `phone`, `car_model`, `timeframe`, `payment_method`, `trade_in_car` (vehículo como parte de pago), `score`, `temperature` (HIGH, MEDIUM, LOW), `notes`, `whatsapp_status` (PENDING, SENT, FAILED), `status` (NUEVO, CONTACTADO, COTIZADO, PERDIDO, CERRADO).
   - **Trigger / Stored Procedure de Scoring Automático:** Algoritmo de ponderación basado en el perfil del comprador que calcule el `score` e inyecte la `temperature` antes de guardar.
   - **Políticas RLS (Row Level Security):** Define políticas para lectura/escritura seguras.

2. **Edge Function (`/supabase/functions/send-whatsapp-welcome/index.ts`):**
   - Recibe evento vía Database Webhook tras un nuevo `INSERT`.
   - Lee variables de entorno (`EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE_NAME`).
   - Construye el payload en formato JSON para Evolution API (`/message/sendText`).
   - Implementa `try/catch`, logging estructurado y actualización de estado (`whatsapp_status = 'SENT'` o `'FAILED'`).

---

### B. Aplicación Frontend & PWA (Next.js App Router)

1. **PWA & Layout (`/app/layout.tsx`, `/public/manifest.json`):**
   - Soporte para pantalla completa en móviles, vista táctil app-like y Bottom Navigation Bar fija.

2. **Modulo 1: Captura Express (`/app/nuevo/page.tsx`):**
   - Formulario enfocado en usabilidad de una sola mano y velocidad táctil (< 30s).
   - Componentes interactivos tipo "Chips / Radio Buttons grandes" para selección de modelo, plazo de compra y forma de pago.
   - Validación reactiva con Zod y React Hook Form.
   - Redirección con estado al completar la captura hacia la vista QR.

3. **Modulo 2: Generación de QR vCard (`/app/qr/page.tsx`):**
   - Renderizado dinámico de código QR que contiene el estándar **vCard 3.0** (`BEGIN:VCARD ... END:VCARD`) configurado con las variables de entorno del vendedor (`NEXT_PUBLIC_SELLER_*`).
   - UI explicativa para invitar al cliente a escanear en el acto.

4. **Modulo 3: Dashboard de Seguimiento y Filtros (`/app/dashboard/page.tsx`):**
   - Métricas clave en cabecera (Total Leads, % Alta Prioridad 🔥, Pendientes de seguimiento).
   - Filtros dinámicos por Prioridad (Alta / Media / Baja) y Estado del Pipe.
   - Listado tipo tarjetas con acciones inmediatas:
     - Disparo directo a llamada telefónica (`tel:`).
     - Disparo directo a WhatsApp Web/App con mensaje predeterminado (`wa.me`).
   - **Módulo de Exportación:** Función de utilidad que transforme la lista filtrada a un archivo `.xlsx` estandarizado para la integración masiva con el CRM legacy.

---

### C. DevOps y Containerización (`Dockerfile`, `docker-compose.yml`)

1. **`Dockerfile` Production-Ready:**
   - Configuración Multi-stage (deps, builder, runner) aprovechando el output `standalone` de Next.js para minimizar el tamaño de la imagen Alpine.
2. **`docker-compose.yml`:**
   - Inyección de variables de entorno desde `.env.local`.
   - Healthcheck configurado y puerto expuesto correctamente (3000).

---

## INSTRUCCIONES DE EJECUCIÓN PARA CODEX

1. Revisa las variables de entorno configuradas en el entorno local (`.env.local`).
2. Diseña los componentes reutilizables dentro de `/components` y la lógica de dominio en `/lib` o `/services`.
3. Aplica TypeScript estricto y asegúrate de que todos los Server Actions / API Routes retornen respuestas con el patrón `{ success: boolean, data?: T, error?: string }`.
4. Genera los archivos en su totalidad, sin marcadores de posición ("placeholders") o comentarios recortados. ¡Inicia la construcción de **LeadFlow**!
