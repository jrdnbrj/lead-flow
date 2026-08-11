# Proposal and freeze boundary

Semantic interpretation belongs to the workflow LLM. It may synthesize:

- `story-execution-type.proposal.json`;
- `validation-plan.proposal.json`;
- `scope-manifest.proposal.json`.

Scripts do not infer product meaning from Markdown. They validate JSON shape, source references, internal consistency, canonical paths, required fields, forbidden categories, artifact existence/new-path declarations, and fingerprints. They then write:

- `story-execution-type.json`;
- `validation-plan.json`;
- `scope-manifest.json`.

Frozen artifacts are registered by both their canonical content fingerprint and their file SHA-256 in `frozen-artifacts.json`, together with the exact story/run/iteration/generation context. A direct edit, even one that changes the embedded fingerprint, or an unregistered copy fails later verification unless the corresponding controller gate is rerun. DEV, fixer, and reviewer contexts receive the frozen artifacts read-only.

An ambiguous classification or unresolvable scope is not silently guessed: use `NEEDS_USER_DECISION` for a genuine product/scope choice and `ESCALATED` for a safety, source, path, or integrity contradiction.
