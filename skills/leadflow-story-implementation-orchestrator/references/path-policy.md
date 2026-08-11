# Canonical path policy

`scope-manifest.json` uses normalized paths relative to the project root. The freeze script resolves the actual current PRD, Architecture Spine, UX documents, `epics.md`, every other implementation story, readiness runtime, known env/secrets, and Git metadata from the checkout. No conceptual placeholder is valid in a frozen manifest.

Every path belongs to exactly one category:

```text
DEV_WRITABLE
FIXER_WRITABLE
CONTROLLER_ONLY
READ_ONLY_CONTEXT
NORMATIVE_FORBIDDEN
SECRET_FORBIDDEN
```

Writable categories cannot overlap with `NORMATIVE_FORBIDDEN` or `SECRET_FORBIDDEN`. Every allowed prefix freezes its `path`, `category`, and `justification`; the actor cannot reinterpret that category. DEV/fixer may write only their matching writable categories. Controller artifacts are written by controller scripts only. Existing dirty files are protected by a full pre-run content snapshot, not by `git status` alone.

The enforcement rejects absolute paths, `..` traversal, null bytes, symlink escapes, paths outside the worktree, undeclared new paths, unknown paths, and category conflicts. The current story file may be explicitly allowed for the limited BMad status/task/record projection; other stories and all normative sources remain forbidden.
