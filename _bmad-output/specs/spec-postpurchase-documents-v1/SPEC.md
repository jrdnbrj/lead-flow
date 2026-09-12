---
id: SPEC-postpurchase-documents-v1
title: "Postcompra — Documentos del caso v1"
type: brownfield-mini-spec
status: ready-for-approval
created: 2026-09-11
baseline_commit: e494c89
companions:
  - brownfield.md
  - implementation-contract.md
  - ../../project-context.md
sources: []
---

> Contrato canónico: este archivo y `brownfield.md` / `implementation-contract.md` definen el único alcance aprobado para este slice.

# Postcompra — Documentos del caso v1

## Why

El asesor necesita mantener un expediente documental por compra, sin mezclarlo
con `leads` ni crear un gestor documental global. El caso postcompra existente
ya es el agregado 1:1 estable; este slice le agrega documentos privados,
consultables y trazables, dejando automatizaciones futuras fuera.

## Capabilities

- **CAP-1**
  - **intent:** El asesor puede subir manualmente un documento permitido al `purchase_case` activo de un lead comprado.
  - **success:** El archivo privado y su metadata quedan asociados al caso correcto; la subida no cambia milestones, score, lead ni `PURCHASE_DECISION`.
- **CAP-2**
  - **intent:** El asesor puede listar, abrir y descargar los documentos activos de su caso.
  - **success:** Un owner distinto no puede leer metadata, objeto ni acceso temporal; un caso revertido sigue siendo legible.
- **CAP-3**
  - **intent:** El asesor puede reemplazar documentos de tipo único y agregar documentos de tipo múltiple.
  - **success:** Los tipos únicos tienen exactamente un `ACTIVE`; el anterior queda trazable como `REPLACED` y los tipos múltiples admiten varios activos.
- **CAP-4**
  - **intent:** El asesor puede retirar un documento sin romper la trazabilidad del expediente.
  - **success:** `DELETED` deja de aparecer y no obtiene nuevas URLs; la fila y el objeto privado conservan asociación auditable.
- **CAP-5**
  - **intent:** El asesor puede consultar el expediente dentro de Postcompra y modificarlo sólo mientras la compra está activa.
  - **success:** `REVERTED` permite lectura y bloquea mutaciones; al reactivar se reutiliza el mismo caso y documentos.

## Constraints

- Anclar todo a `purchase_cases`; no asociar documentos directamente a `leads` salvo las relaciones ya existentes.
- Reutilizar el panel Postcompra sin nueva tab, rediseño global ni gestor documental.
- Bucket privado dedicado, sin URLs públicas permanentes, sin binarios en PostgreSQL y sin service role en cliente.
- Ownership, validación de caso y estado `PURCHASED` se comprueban server-side/RPC; RLS debe impedir cross-owner.
- Subir un documento nunca completa ni modifica automáticamente un milestone.
- La tabla y bucket son forward-only; no modificar migrations históricas ni hacer backfill.

## Non-goals

- OCR, Document AI, IA, clasificación o extracción de datos.
- Generación de Fondo Vial, RAMV, órdenes, matrícula, emails, WhatsApp o browser automation.
- Event sourcing, DMS global, drafts/revisiones complejas, aprobación, blockers o workflow documental.
- Destrucción física garantizada de archivos: v1 define `Eliminar` como soft delete privado y trazable.

## Success signal

En un lead comprado, el asesor sube una factura, la ve y la descarga desde el panel; reemplaza un RAMV sin perder el anterior, agrega varios comprobantes, y no puede modificar el expediente cuando la compra está revertida. Los 13 milestones permanecen idénticos antes y después.

## Assumptions

- Los tipos iniciales y el límite de 10 MiB son una política v1 reversible, no un catálogo administrativo.
- `purchase-documents` se verificará en preflight para evitar colisión con buckets existentes.

## Open Questions

- No hay preguntas de producto bloqueantes para v1. Si el negocio exige borrado físico por privacidad, deberá aprobarse como slice de retención separado.
