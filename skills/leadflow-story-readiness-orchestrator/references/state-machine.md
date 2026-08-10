# State machine and loop limits

The parent coordinates `SELECT_STORY → VALIDATE → TRIAGE`. A PASS from `TRIAGE` (including only non-blocking findings) goes to the deterministic ready gate. Technical blockers go through one story-only repair and revalidation. Product decisions stop at `NEEDS_USER_DECISION`. Equal-authority contradictions and unapproved high-risk acceptance go to `ESCALATED`.

Two failed review/fix cycles trigger exactly one `FULL_STORY_AUDIT`, one consolidated repair, and one `FINAL_REVALIDATION`. A failed final revalidation is terminal `ESCALATED`. No stage may reopen an already terminal PASS unless a story or recorded input fingerprint changed or an explicit override is recorded.
