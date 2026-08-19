# Edge Case Hunter Review — WhatsApp QR Recovery

Review the current working-tree diff against baseline commit `5d02447fd261228ed4b6b30850044d9cc4c29fff` using the `bmad-review-edge-case-hunter` skill.

Scope:
- `_bmad-output/implementation-artifacts/spec-whatsapp-relink-qr-recovery.md`
- `app/whatsapp/page.tsx`
- `lib/whatsapp/service.ts`
- `lib/whatsapp/actions.ts`

Walk the cases: missing instance, existing closed instance, concurrent QR requests, Evolution 404/409/500, QR expiry, already-open instance, provider unavailable, and webhook configuration failure. Report only actionable findings with evidence and severity.
