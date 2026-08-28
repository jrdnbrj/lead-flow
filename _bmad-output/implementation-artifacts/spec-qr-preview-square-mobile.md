---
title: 'QR preview stays square on narrow screens'
type: 'bugfix'
created: '2026-08-28'
status: 'done'
review_loop_iteration: 0
route: 'one-shot'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The enlarged advisor QR preview is horizontally compressed on narrow screens because the responsive canvas width shrinks while its fixed height remains large. This makes the code visibly distorted and less reliable to scan.

**Approach:** Keep the existing QR preview and visual design, but give the modal QR a responsive square container and make the canvas fill that square so its proportions remain 1:1 at every viewport width.

## Boundaries & Constraints

**Always:** Preserve the QR value, encoding settings, scan margin, modal controls, desktop sizing intent, and the normal inline QR/download behavior.

**Ask First:** None.

**Never:** Do not change the vCard payload, QR generation library, routes, sharing behavior, authentication, production deployment, or unrelated styling.

</frozen-after-approval>

## Code Map

- `components/qr/qr-card.tsx` -- renders the advisor QR and enlarged preview modal.

## Tasks & Acceptance

**Execution:**
- [ ] `components/qr/qr-card.tsx` -- constrain the modal QR to a responsive square wrapper and make the canvas fill it -- prevent horizontal or vertical distortion without changing QR content.

**Acceptance Criteria:**
- Given a narrow mobile viewport, when the enlarged QR preview opens, then the rendered QR area remains square and fully visible without horizontal compression.
- Given a desktop viewport, when the enlarged QR preview opens, then the QR remains readable and centered with the existing modal controls.
- Given the regular QR card, when the user downloads the QR, then the existing canvas reference and download behavior remain unchanged.

## Suggested Review Order

1. `components/qr/qr-card.tsx` -- verify the responsive square wrapper is limited to the enlarged preview and does not alter the regular QR.
