---
name: update-kb
description: Update the CopyTraderX Obsidian knowledge base from the latest specs, plans, and shipped commits. Use when the user says "/update-kb", "update the knowledge base", "update the vault", or after a feature ships. Read-then-confirm-then-write — never bulk-edit autonomously.
---

# update-kb

Update the CopyTraderX Obsidian vault at `/Users/jsonse/Documents/Obsidian/CopyTraderX/` from the latest specs, plans, and commits in this repo. Vault is canonical (see ADR `40-Decisions/2026-05-07 — Vault is canonical KB.md`).

## Constants

- `VAULT = /Users/jsonse/Documents/Obsidian/CopyTraderX`
- Subsystem folders: `Licenses`, `Users`, `Propfirm Rules`, `Journal`. Map specs to subsystems by area; ask if ambiguous.

## Process

Always run all steps in order. Never skip the confirmation prompts.

### 1. Discover candidates

- List all specs in `docs/superpowers/specs/*.md` sorted by filename date DESC.
- List all feature notes in `$VAULT/30-Features/**/*.md` (skip `_Hub.md`) and read their `spec:` frontmatter values.
- Candidates = specs with no matching feature note, OR specs whose file mtime is newer than the matching feature note's mtime.
- If there are zero candidates, report "Vault is up to date." and STOP.

### 2. For each candidate, prompt the user

For each candidate spec, ask:

> "Found `<spec-filename>`. Subsystem? (Licenses / Users / Propfirm Rules / Journal / skip)"

If skip, move to the next candidate without writing anything.

### 3. Write or update the feature note

Path: `$VAULT/30-Features/<Subsystem>/<Feature Name>.md`. Derive `<Feature Name>` from the spec's H1 heading (strip "Design", "— Design", "Spec" suffixes). Confirm the derived name with the user before writing.

Frontmatter template (fill every field; use `null` if unknown):

```yaml
---
status: shipped            # planned | in-progress | shipped | revoked
area: <licenses|users|propfirm-rules|journal|auth>
shipped: <ISO date or null>
spec: docs/superpowers/specs/<file>.md
plan: docs/superpowers/plans/<file>.md   # find the matching plan by date prefix
pr: <PR number or null>
related: []                                # ask the user
---
```

Body sections (each one short, pulled from the spec):

- **What it does** — 3–6 bullets, paraphrased from the spec.
- **Gotchas** — non-obvious constraints. Pull from spec "Risks", "Non-goals", or amendments.

If the feature note already exists, MERGE: keep the user's body edits, only update frontmatter. Show a diff before writing.

### 4. Glossary check

Scan the spec text for proper-noun-ish terms (capitalized words, kebab-case identifiers like `account-type`, table names). For each that does NOT appear in `$VAULT/10-Domain/Glossary.md`, ask:

> "New term `<term>` — add to Glossary? (y/n, or paste a one-line definition)"

Append confirmed terms to Glossary.md alphabetically. NEVER auto-add without confirmation.

### 5. ADR prompt

Ask:

> "Any non-obvious decision in this feature worth recording as an ADR? (y/n)"

If yes, ask for a short title and three sections (Context, Decision, Consequences). Write to `$VAULT/40-Decisions/<YYYY-MM-DD> — <Title>.md` with this frontmatter:

```yaml
---
status: accepted
date: <today>
supersedes: null   # or "[[<existing ADR title>]]"
---
```

### 6. Index refresh

If a new subsystem hub was created (shouldn't happen — the four are fixed), add a link to it from `$VAULT/00-Index/CopyTraderX.md`. Otherwise skip.

### 7. Report

Print a summary table:

```
Created:
  - <path>
Updated:
  - <path>
Glossary additions:
  - <term>
ADRs created:
  - <path>
```

The vault is NOT git-tracked. Do not run `git add` against vault paths. Only the repo's `CLAUDE.md` and this skill file are committed.

## Constraints

- Read-then-confirm-then-write. Never bulk-create or bulk-update without per-item confirmation.
- Never delete vault notes. To mark a feature dead, set `status: revoked` and add a one-line "deprecated YYYY-MM-DD because …" at the top of the body.
- Never inline architecture/stack details into `CLAUDE.md`. They live in `20-Architecture/`.
- For markdown syntax questions (callouts, embeds, properties), invoke the `obsidian:obsidian-markdown` skill.
- For Bases syntax questions, invoke the `obsidian:obsidian-bases` skill.

## Out of scope

- Auto-syncing the vault to a remote.
- Generating notes from git log alone (without a spec).
- Editing notes in `10-Domain/` or `20-Architecture/` automatically — those are human-curated; suggest edits, never write.
