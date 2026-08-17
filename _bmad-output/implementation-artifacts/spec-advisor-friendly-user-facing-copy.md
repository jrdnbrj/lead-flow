---
title: 'Advisor-friendly user-facing copy'
type: 'refactor'
created: '2026-08-17'
status: 'done'
baseline_commit: '57958fb7b9d195c7d6e69e6452cfedd67831da8e'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

# Advisor-friendly user-facing copy

## Intent

**Problem:** The application exposes internal infrastructure names and technical setup errors to a nontechnical advisor, including Supabase, Evolution, service-role configuration, and provider/server details.

**Approach:** Replace advisor-visible technical wording across active screens and action responses with concise Spanish that explains what happened and what the advisor can do next. Keep internal names in imports, environment variables, logs, webhook routes, and provider contracts where they are not rendered to the advisor.

## Boundaries & Constraints

**Always:** Preserve behavior, error semantics, security boundaries, provider integrations, and technical identifiers; messages must be honest, actionable, and nontechnical.

**Ask First:** A message whose meaning cannot be translated without changing product behavior or hiding a required human decision.

**Never:** Rename infrastructure variables/modules/routes, remove operational diagnostics, expose secrets, or redesign screens.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| WhatsApp unavailable | Connection or send request cannot complete | Explain that WhatsApp is unavailable and suggest retrying or reporting it | Keep technical cause internal |
| Configuration unavailable | Server-side setup is incomplete | Explain that the action cannot be completed now; suggest retry/reporting | Never mention variable names or infrastructure |
| Save/read failure | Persistence or refresh fails | Explain that information could not be saved/updated | Preserve form/context and offer retry |
| Push unavailable | Browser/runtime cannot enable reminders | Explain that reminders are unavailable or blocked in this browser | No raw runtime/provider error |

</frozen-after-approval>

## Code Map

- `app/login/page.tsx` -- login configuration fallback shown to the user
- `app/whatsapp/page.tsx` -- WhatsApp connection page and fallback errors
- `components/whatsapp/` -- seller settings, connection, and unlink messages
- `components/leads/push-notifications.tsx` -- advisor-facing reminder errors
- `lib/whatsapp/service.ts` and `lib/whatsapp/actions.ts` -- shared WhatsApp error text returned to UI
- `lib/config/` and `lib/leads/` -- action/repository responses that may surface technical details

## Tasks & Acceptance

**Execution:**
- [x] Replace technical infrastructure references in advisor-visible copy while preserving internal identifiers and behavior.
- [x] Normalize generic save, refresh, connection, login, WhatsApp, and reminder failures to actionable Spanish.
- [x] Search active UI paths for remaining technical names and classify intentional internal-only occurrences.
- [x] Validate typecheck, lint, build, diff hygiene, Docker runtime, and visible browser copy.

**Acceptance Criteria:**
- Given the advisor uses active screens and actions, when configuration, connection, persistence, or reminder failures occur, then the visible message contains no Supabase, Evolution, service-role, API-key, database, webhook, RPC, provider, or raw secret terminology.
- Given internal code needs infrastructure identifiers, when the app executes, then those identifiers remain unchanged and available to server/runtime boundaries.
- Given a technical failure is shown, when the advisor reads it, then the message states the user action available: retry, check connection, or report the issue.

## Verification

**Commands:**
- `npm run typecheck` -- expected: SUCCESS
- `npm run lint` -- expected: SUCCESS
- `npm run build` -- expected: SUCCESS
- `git diff --check` -- expected: SUCCESS
- `rg -n -i 'supabase|evolution|service.?role|api.?key|webhook|database|postgres|rpc' app components lib` -- expected: remaining matches are internal-only

**Manual checks:**
- Open `/login`, `/dashboard`, `/qr`, and `/whatsapp` in the current runtime and confirm advisor-visible copy is nontechnical and actionable.
