---
title: 'Add Alsvin Plus vehicle catalog assets'
type: 'feature'
created: '2026-08-21'
status: 'done'
review_loop_iteration: 0
baseline_commit: '54e9219dccba7dd6599bda4da333cb249d8dcd5d'
context:
  - /Users/jrdnbrj/Documents/git/jrdnbrj/lead-flow/lib/domain/lead.ts
  - /Users/jrdnbrj/Documents/git/jrdnbrj/lead-flow/lib/leads/repository.ts
  - /Users/jrdnbrj/Documents/git/jrdnbrj/lead-flow/supabase/migrations/039_vehicle_catalog_assets.sql
---

<frozen-after-approval reason="human-owned intent - do not modify unless human renegotiates">

## Intent

**Problem:** The new Alsvin Plus vehicle is present as a technical PDF in the local Changan catalog, but it is not selectable in LeadFlow and cannot be included in First Contact messages.

**Approach:** Add Alsvin Plus to the existing catalog, preserve the source PDF under a user-friendly storage name, derive a vehicle-focused JPEG from its cover, and register both assets using the existing `car_model_assets` contract.

## Boundaries & Constraints

**Always:** Use the commercial label `Alsvin Plus`; keep existing models and asset paths unchanged; use the public `vehiculos` bucket; keep storage paths stable and ASCII-safe; use the existing PHOTO and TECHNICAL_SHEET asset kinds; preserve the current First Contact lookup behavior; verify public asset URLs and local runtime behavior.

**Ask First:** Stop if the remote catalog or bucket cannot be verified, if the new model ID/path conflicts with an existing object, or if the source PDF does not contain a usable Alsvin Plus image.

**Never:** Do not modify historical migrations; do not replace existing assets; do not add a new asset system; do not change E1/E2/E3/E5/E6 behavior beyond making this model available; do not commit, push, or deploy unless separately requested.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| HAPPY_PATH | Alsvin Plus selected with active catalog/assets | First Contact resolves the JPEG and PDF public URLs and sends the selected resources | N/A |
| MISSING_ASSET | One remote object or asset row is absent | Existing honest NOT_AVAILABLE behavior remains; no unrelated model is used | Report exact missing object and stop before claiming complete |
| REPEAT_SETUP | Catalog/object already exists | Same IDs and paths are reused idempotently | No duplicate model or asset rows |

</frozen-after-approval>

## Code Map

- `lib/domain/lead.ts` -- selectable vehicle labels used by the capture form.
- `lib/leads/repository.ts` -- resolves active catalog assets into public URLs for First Contact.
- `supabase/migrations/042_add_alsvin_plus_catalog_assets.sql` -- forward-only catalog and asset registration.
- `scripts/` -- existing target/contract checks used for validation; no new runtime script is required.
- `/Users/jrdnbrj/Documents/changan/Ficha ALSVIN PLUS FINAL CAMPAÑA.pdf` -- source technical sheet and source image.

## Tasks & Acceptance

**Execution:**
- [x] Add `Alsvin Plus` to the domain catalog before `Otro modelo`, preserving existing order and labels.
- [x] Add migration 042 with id `alsvin-plus`, sort order 14, active catalog row, and PHOTO/TECHNICAL_SHEET rows using stable paths `alsvin-plus/changan-alsvin-plus-vehiculo.jpg` and `alsvin-plus/changan-alsvin-plus-ficha-tecnica.pdf`.
- [x] Upload the derived vehicle JPEG and normalized PDF to the existing `vehiculos` bucket without replacing other objects.
- [x] Verify remote catalog rows, storage objects, public URLs, and First Contact asset resolution.
- [x] Run lint, typecheck, build, relevant contracts, local Docker health, and diff checks.

**Acceptance Criteria:**
- Given the app is opened with the current catalog, when the advisor captures a lead, then `Alsvin Plus` appears as a selectable model.
- Given a lead selects `Alsvin Plus`, when First Contact prepares resources, then the message references `Alsvin Plus` and the PHOTO and TECHNICAL_SHEET assets resolve to the registered public files.
- Given setup is repeated, when migration/storage verification runs, then there is one active model and one active asset row per resource kind, with no changes to existing models.
- Given the new asset URL is opened, when the file is requested, then the JPEG renders as a vehicle image and the PDF downloads/opens as a readable technical sheet.

## Design Notes

Use `Changan Alsvin Plus - Vehículo.jpg` and `Changan Alsvin Plus - Ficha técnica.pdf` as user-facing file names while keeping storage paths ASCII-safe. The JPEG is a focused crop of the vehicle from the supplied PDF cover, so no external image source is introduced.

## Verification

**Commands:**
- `npm run lint` -- expected: SUCCESS.
- `npm run typecheck` -- expected: SUCCESS.
- `npm run build` -- expected: SUCCESS.
- `npm run e3:contracts` or the relevant existing E3 contract command -- expected: SUCCESS.
- `docker compose config --quiet` and local `/api/health` check -- expected: SUCCESS.
- `git diff --check` -- expected: SUCCESS.

**Manual checks:**
- Inspect the new PDF cover/crop and verify the Alsvin Plus label and vehicle are clear.
- Verify the remote model/assets and public URLs without printing secrets.

## Suggested Review Order

**Catalog entry**

- The selectable label is added immediately before the fallback model.
  [`lead.ts:31`](../../lib/domain/lead.ts#L31)

**Remote catalog registration**

- The forward-only migration creates the active Alsvin Plus model id and order.
  [`042_add_alsvin_plus_catalog_assets.sql:4`](../../supabase/migrations/042_add_alsvin_plus_catalog_assets.sql#L4)

- The migration maps each resource kind to its stable public storage path and friendly filename.
  [`042_add_alsvin_plus_catalog_assets.sql:12`](../../supabase/migrations/042_add_alsvin_plus_catalog_assets.sql#L12)
