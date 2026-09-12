# Brownfield discovery

## Estado real observado

- `supabase/migrations/075_purchase_case_milestones.sql` define `purchase_cases`
  1:1 por `lead_id` y `purchase_case_milestones` con 13 posiciones. Las RPCs
  de lectura/mutación validan ownership y `PURCHASE_DECISION` activa; no hay
  documentos ni relación documental existente.
- `PURCHASE_DECISION` y `purchase_cases` se conservan al revertir la compra.
  `get_purchase_case_v1` proyecta `PAUSED`; el panel permite lectura y bloquea
  acciones de cambio mientras está pausado.
- `components/leads/post-purchase-panel.tsx` es un componente cliente ya
  integrado en el detalle expandido del dashboard. Es el punto de menor
  fricción para una sección `Documentos` compacta.
- `lib/leads/actions.ts` y `lib/leads/repository.ts` concentran las fronteras
  server-side del caso y usan RPCs autenticadas; el cliente no escribe tablas.

## Patrones reutilizables y límites

- `supabase/migrations/068_quote_files.sql` muestra tabla de metadata, bucket
  `quotations` privado y policies vinculadas al owner. No se copia su dominio:
  `quote_files` es histórico de PDFs de cotización y usa sólo PDF.
- `lib/quotes/repository.ts` usa service role únicamente en servidor para
  upload/download y signed URLs; `app/api/quotes/files/[id]/route.ts` valida al
  asesor y sirve preview/descarga con nombre seguro.
- `app/api/catalog/*` usa el bucket público `vehiculos`; no es aceptable para
  documentos postcompra privados.
- No existe actualmente input/upload de archivos ni bucket documental de
  postcompra. La implementación necesitará una route multipart o boundary
  equivalente; Server Actions no deben recibir archivos grandes sin revisar
  el límite real de Next.
- `lib/supabase/admin.ts` desactiva persistencia de sesión del admin client y
  mantiene la key privada server-side. Las nuevas mutaciones deben conservar
  ese límite y no confiar en `owner_id` enviado por navegador.

## Archivos probables de implementación

- Nueva migration `081_purchase_case_documents_v1.sql` y tipos generados en
  `lib/supabase/database.ts`.
- Nuevo módulo de dominio/repositorio bajo `lib/postpurchase-documents/` y
  acciones/route autenticadas bajo `app/api/postpurchase/documents/`.
- `components/leads/post-purchase-panel.tsx` para montar la sección compacta;
  un componente hijo separado puede contener la interacción de archivos.
- Contrato estático y pruebas dirigidas para cardinalidad, ownership,
  reversión, compensación de Storage y no-mutación de milestones.

## Verificaciones previas a implementación

1. Comprobar migrations locales/remotas y que `purchase_cases`/RLS/RPCs estén
   disponibles; no aplicar nada en esta spec.
2. Inventariar buckets remotos y confirmar que `purchase-documents` no existe
   con otro propósito; si colisiona, elegir un nombre dedicado.
3. Confirmar límites de multipart de la versión local de Next y validar PDF,
   JPEG, PNG y WEBP por firma básica, no sólo por MIME del navegador.
4. Probar lectura en caso `PURCHASED` y `REVERTED`, rechazo de owner ajeno y
   que ninguna operación cambia los 13 milestones.
