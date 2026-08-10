# Authority and decision handling

Apply this order: active explicit decisions in `decision-ledger.jsonl`, PRD, Architecture Spine, UX, epic/story scope, project-context, and relevant brownfield code. A later decision must explicitly reference the decision it supersedes. A conflict between equal-authority sources is `ARCHITECTURAL_CONTRADICTION`; do not resolve it silently.

`pending-decision.json` is a request, not a decision. It may contain a recommendation and at most two alternatives, but it cannot create a `PRODUCT_DECISION` ledger entry. Only an explicit user response causes `resolve_pending_decision.py` to append that entry and close the request through state.

The LLM may classify and recommend. It may not create a product decision, alter upstream artifacts, or bypass a deterministic gate.
