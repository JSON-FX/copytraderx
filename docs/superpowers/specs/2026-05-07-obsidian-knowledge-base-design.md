# Obsidian Knowledge Base — Design

**Date:** 2026-05-07
**Status:** Approved
**Owner:** jayson@voltcontent.com

## Goal

Stand up an Obsidian vault as the canonical knowledge base for CopyTraderX, so future Claude sessions (and the human) have a stable place to find domain terms, architecture, shipped features, and decisions — without re-reading the entire codebase each time.

## Non-goals

- Replacing `docs/superpowers/specs/` (dated design docs) or `docs/superpowers/plans/` (implementation plans). Those stay in the repo.
- Versioning vault content in git. The vault lives outside the repo and is owned by Obsidian.
- Auto-generating notes from commits. Updates happen on demand via `/update-kb`.
- Migrating the existing `Welcome.md` content. It will be left in place or removed during seeding.

## Decisions

1. **Vault is canonical.** All evergreen knowledge lives in the vault. The repo only points to it.
2. **Layered folder structure** (numbered prefixes) over flat or per-subsystem layouts.
3. **Manual updates** via a project-level `/update-kb` skill, not automatic on every commit.
4. **CLAUDE.md is read-on-start, write-on-command.** It points at the vault, tells Claude when to read, and forbids inline writes.

## Vault location

`/Users/jsonse/Documents/Obsidian/CopyTraderX/`

Vault already exists with only a `Welcome.md`. Seeding writes new folders alongside it.

## Folder structure

```
CopyTraderX/
├── 00-Index/
│   └── CopyTraderX.md                  # Project entry point
├── 10-Domain/
│   ├── Glossary.md
│   ├── Roles & Permissions.md
│   └── License Lifecycle.md
├── 20-Architecture/
│   ├── Stack.md
│   ├── Data Model.md
│   ├── Auth & Middleware.md
│   └── EA ↔ License Server.md
├── 30-Features/
│   ├── _Features Index.base
│   ├── Licenses/
│   ├── Users/
│   ├── Propfirm Rules/
│   └── Journal/
├── 40-Decisions/
│   ├── _ADR Index.base
│   └── 2026-05-07 — Vault is canonical KB.md
└── 90-References/
    └── External Links.md
```

Numbered prefixes (`00`, `10`, `20`, …) give a stable sort in Obsidian's file tree and make "how zoomed in" obvious at a glance.

## Note conventions

### Feature notes (`30-Features/<Subsystem>/<Name>.md`)

Frontmatter:

```yaml
---
status: shipped            # planned | in-progress | shipped | revoked
area: users                # licenses | users | propfirm-rules | journal | auth
shipped: 2026-05-06        # ISO date or null
spec: docs/superpowers/specs/2026-05-06-admin-client-roles-design.md
plan: docs/superpowers/plans/2026-05-06-roles-admin-users.md
pr: 42                     # GitHub PR number or null
related:
  - "[[Roles & Permissions]]"
  - "[[Users]]"
---
```

Body: 1-paragraph purpose, what changed (bulleted), follow-ups, gotchas. No re-statement of the spec — link to it.

### ADRs (`40-Decisions/YYYY-MM-DD — <Title>.md`)

Frontmatter:

```yaml
---
status: accepted           # accepted | superseded | rejected
date: 2026-05-07
supersedes: null           # or "[[…]]"
---
```

Body: Context, Decision, Consequences (3 short sections).

### Subsystem hubs (`30-Features/<Subsystem>/_Hub.md` or folder note)

A short index pointing to the feature notes in that subsystem and to relevant `10-Domain/` and `20-Architecture/` notes.

## Bases

Two `.base` files act as live indexes:

- **`30-Features/_Features Index.base`** — table view: status, area, shipped date, links to spec/plan/PR.
- **`40-Decisions/_ADR Index.base`** — table view: date, status, supersedes.

Bases are filtered by frontmatter, so they update automatically as notes are added/edited.

## `/update-kb` skill

Lives at `.claude/skills/update-kb/SKILL.md`. Project-level, committed to the repo.

Behavior when invoked:

1. **Discover** — diff `docs/superpowers/specs/` and `docs/superpowers/plans/` against the latest `shipped` dates in `30-Features/**`. List candidates.
2. **For each new/changed item**, ask the user which subsystem it belongs to (or accept a hint from the spec filename). Then create or update a feature note.
3. **Glossary check** — scan the spec for terms not present in `10-Domain/Glossary.md`; propose additions, never auto-add.
4. **ADR prompt** — ask if there's a non-obvious decision worth recording. If yes, create an ADR.
5. **Index refresh** — if a new subsystem hub was needed, link it from `00-Index/CopyTraderX.md`.
6. **Report** — print the list of files created/updated. The vault is not git-tracked, so no commit happens.

Constraints:

- Read-then-confirm-then-write. No bulk autonomous edits.
- Uses the existing `obsidian:obsidian-markdown` and `obsidian:obsidian-bases` skills (kepano/obsidian-skills) for syntax.
- Never deletes vault notes. If a feature is revoked, flips its `status` frontmatter and adds a one-line note.

## CLAUDE.md changes

Add a single section near the top:

```markdown
## Knowledge Base

Project knowledge base (Obsidian vault):
`/Users/jsonse/Documents/Obsidian/CopyTraderX/`

**Read it** at the start of any non-trivial work — especially:
- Brainstorming a new feature (check `30-Features/` for related work, `10-Domain/` for terms)
- Touching auth, roles, licenses, or propfirm rules (check the relevant subsystem hub)
- Naming things — defer to `10-Domain/Glossary.md`

**Don't write to it inline.** Vault updates happen via `/update-kb` after a
feature is shipped. If you notice the vault is out of date during a session,
flag it — don't fix it silently.
```

Stack/architecture details are NOT inlined into CLAUDE.md — they live in `20-Architecture/Stack.md` so they don't get loaded into every session unless needed.

## Initial seeding (one-time, part of the implementation plan)

1. Create folder skeleton + `00-Index/CopyTraderX.md`.
2. Seed `10-Domain/Glossary.md` from terms in existing specs and `lib/` (license, tier, account-type, propfirm-rule, role, journal, IMPX key, liveness, expiry).
3. Seed `20-Architecture/` from `README.md`, `app/` and `lib/` structure, `middleware.ts`. Keep each note <200 words.
4. Backfill `30-Features/` from the 6 existing specs:
   - `2026-04-25-admin-ui-design.md` → Licenses
   - `2026-04-25-license-activation-design.md` → Licenses
   - `2026-04-25-license-polling-and-inactive-label-design.md` → Licenses
   - `2026-04-28-account-type-gate-design.md` → Propfirm Rules (or Licenses — confirm during seeding)
   - `2026-05-02-journal-integration-design.md` → Journal
   - `2026-05-06-admin-client-roles-design.md` → Users
5. Create the two `.base` files.
6. Write the first ADR: `2026-05-07 — Vault is canonical KB.md`.
7. Patch `CLAUDE.md`.
8. Add `.claude/skills/update-kb/SKILL.md`.

Items 7–8 are committed to the repo. Items 1–6 are vault-only.

## Risks & mitigations

- **Vault drift.** If `/update-kb` isn't run, the vault rots. Mitigation: CLAUDE.md tells Claude to flag staleness; the Bases will visibly show old `shipped` dates.
- **Frontmatter inconsistency.** Manual notes diverge from the schema. Mitigation: `/update-kb` always uses templates; the Bases will fail to render fields that don't exist, surfacing the drift.
- **Vault path is hard-coded.** A move breaks CLAUDE.md and the skill. Mitigation: keep the path in one place — a `KB_PATH` constant referenced by both. Acceptable risk for a single-developer project.

## Out of scope (for this spec)

- Auto-syncing vault to a remote (Obsidian Sync / iCloud / git). User can layer that on later.
- Public-facing docs site. Vault is private.
- Templates plugin / QuickAdd integration in Obsidian. The skill writes plain markdown; user can add templates later if useful.

## Success criteria

- Vault has the folder skeleton, seeded glossary/architecture/feature notes, two Bases, and the first ADR.
- `CLAUDE.md` references the vault.
- `/update-kb` skill is invocable and produces a feature note + glossary/ADR prompts on a dry run against the most recent shipped feature.
- A new Claude session, asked "what is the roles feature?", reads the vault note instead of grepping the codebase.
