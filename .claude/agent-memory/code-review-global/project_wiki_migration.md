---
name: Wiki Migration Architecture
description: V2Note is migrating from Strike/Bond/Cluster pipeline to Wiki Page compile model — core data flow change affecting digest, search, and frontend
type: project
---

Cognitive Wiki migration (spec 119) replaces Strike atom decomposition with Wiki Page compilation.

**Why:** Strike decomposition loses causal chains and narrative context. Wiki compile preserves full reasoning.

**How to apply:**
- digest.ts no longer creates Strike/Bond; it only extracts intend (todo/goal) and marks records pending_compile
- Daily compile (3AM) reads pending records and compiles to wiki pages
- todo-projector.ts still receives fake StrikeEntry objects during the transition (tech debt)
- record table needs an `embedding` column added via migration (not yet created as of 2026-04-09)
- `todo.strike_id` will point to non-existent strikes during transition; spec says replace with `source_record_id` but actual column is `record_id`
- 5 callers of digestRecords: ingest.ts, proactive/engine.ts, advisor-context.ts, builtin.ts, cognitive-stats.ts
