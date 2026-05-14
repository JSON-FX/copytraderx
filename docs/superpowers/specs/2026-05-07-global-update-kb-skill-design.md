# Global `update-kb` Skill — Design

**Date:** 2026-05-07
**Status:** Approved
**Owner:** jayson@voltcontent.com

## Goal

Promote the project-specific `update-kb` skill (currently at `copytraderx-license/.claude/skills/update-kb/SKILL.md`) to a **user-level skill** at `~/.claude/skills/update-kb/SKILL.md` that works across any project. The skill reads project-specific configuration from a fenced code block in the project's `CLAUDE.md`, bootstraps anything missing on first run, and otherwise behaves identically to the current CopytraderX skill.

## Non-goals

- Publishing the skill as a Claude plugin (no `marketplace.json`, no manifest).
- Supporting multiple vaults per project.
- Auto-detecting subsystem names from code structure.
- Renaming or migrating vault folders when the user changes subsystem names later.
- Vault content lives outside git in every project; this is not negotiated per project.

## Decisions

1. **User-level skill at `~/.claude/skills/update-kb/SKILL.md`.** Single source of truth.
2. **Project-level CopytraderX skill is deleted** as part of the same change. CopytraderX migrates to the global skill.
3. **Configuration lives in `CLAUDE.md`** as a fenced ```` ```kb-config ```` block. No new file types.
4. **On first run in a new project, the skill detects gaps and walks the user through bootstrap** with one prompt per gap. No silent defaults.
5. **Detection is implemented as explicit shell checks** in the skill body (not pure prose), so behavior is consistent across sessions.

## kb-config block

Format (YAML between fenced markers):

````markdown
```kb-config
vault: /absolute/path/to/vault
project_name: CopyTraderX
subsystems:
  - Licenses
  - Users
  - Propfirm Rules
  - Journal
specs_dir: docs/superpowers/specs
plans_dir: docs/superpowers/plans
```
````

- Lives anywhere inside `CLAUDE.md`. Convention: under the `## Knowledge Base` heading, immediately after the prose pointer.
- The fence language tag `kb-config` is a literal string the skill greps for. Standard Markdown renderers treat it as a generic code block.
- All five keys are required. `subsystems` may be a single-item list (e.g. `[General]`).
- Paths in `specs_dir` and `plans_dir` are repo-relative. `vault` is absolute.

## Detection phase (runs every invocation)

Six checks, in this order. Each returns yes/no. The result determines which path the skill takes.

| # | Check | Command (intent) |
|---|-------|------------------|
| 1 | In a git repo? | `git rev-parse --show-toplevel` |
| 2 | `CLAUDE.md` at repo root? | `test -f $REPO/CLAUDE.md` |
| 3 | kb-config block present? | `grep -q '^```kb-config$' $REPO/CLAUDE.md` |
| 4 | Vault path resolves to an existing directory? | `test -d "$VAULT"` (after parsing config) |
| 5 | `specs_dir` and `plans_dir` exist? | `test -d` for each |
| 6 | Vault has the standard skeleton? | `test -d` for `00-Index`, `10-Domain`, `20-Architecture`, `30-Features`, `40-Decisions`, `90-References` |

If check 1 fails, the skill refuses and stops. Otherwise:

- **All six green → incremental update path** (Section "Incremental update").
- **Any red → bootstrap path** (Section "Bootstrap path"). Bootstrap addresses gaps in order; downstream checks (4–6) cannot be evaluated until upstream checks (2–3) are resolved.

## Bootstrap path

Resolves gaps one prompt at a time, in dependency order. After bootstrap completes, the skill **stops** and asks the user to run `/update-kb` again to do an incremental backfill. This keeps each invocation predictable.

### Gap 2 — `CLAUDE.md` missing

Prompt: "No `CLAUDE.md` at repo root. Create one? (y/n)"

If yes, write this template to `$REPO/CLAUDE.md`:

```markdown
# <project_name> — Claude Notes

<one-line description; default: derived from package.json/Cargo.toml/pyproject if present, else "TODO">

## Knowledge Base

Project knowledge base (Obsidian vault):
`<vault path — filled in at Gap 3>`

**Read it** at the start of any non-trivial work — especially:

- Brainstorming a new feature (check `30-Features/` for related work, `10-Domain/` for terms).
- Naming things — defer to `10-Domain/Glossary.md` if it exists.

**Don't write to it inline.** Vault updates happen via `/update-kb` after a feature is shipped. If you notice the vault is out of date during a session, flag it — don't fix it silently.

```kb-config
<filled in at Gap 3>
```

## Specs and plans

- Design specs: `<specs_dir>/YYYY-MM-DD-<topic>-design.md`
- Implementation plans: `<plans_dir>/YYYY-MM-DD-<feature>.md`

After a feature ships, run `/update-kb` to backfill the vault.
```

### Gap 3 — kb-config block missing

Prompts, in order:

1. **Project name** — default: basename of `git rev-parse --show-toplevel`.
2. **Vault path** — three options:
   - "Use existing vault at `~/Documents/Obsidian/<project_name>/`" (default; `mkdir -p` if absent).
   - "Create at a different path" — ask for path, `mkdir -p`.
   - "I'll type the absolute path of an existing vault" — `test -d`, retry on miss.
3. **Subsystems** — comma-separated list, or accept blank for `[General]`.
4. **specs_dir** — default `docs/superpowers/specs`.
5. **plans_dir** — default `docs/superpowers/plans`.

Write the kb-config block into `CLAUDE.md` under `## Knowledge Base` (or append a new section if missing). Show the user the block before writing and confirm.

### Gap 4 — vault path missing

Resolved inline as part of Gap 3's vault-path prompt. The three sub-options each handle creation: defaults `mkdir -p` the path; "type an existing path" requires `test -d` to pass before the skill accepts it. There is no separate Gap-4 prompt.

### Gap 5 — `specs_dir` / `plans_dir` missing

Prompt: "Create `<specs_dir>` and `<plans_dir>`? (y/n)"

If yes, `mkdir -p` both. The skill does not create any spec content — brainstorming does that.

### Gap 6 — Vault skeleton missing

Prompt: "Vault has no standard skeleton. Seed `00-Index/`, `10-Domain/`, `20-Architecture/`, `30-Features/<each subsystem>/`, `40-Decisions/`, `90-References/`, plus the two Bases and a project entry-point note? (y/n)"

If yes, create:

- All folders listed above.
- `00-Index/<project_name>.md` with a minimal entry-point note.
- `30-Features/_Features Index.base` and `40-Decisions/_ADR Index.base` — same YAML schemas as the CopytraderX vault.
- One `_Hub.md` per subsystem under `30-Features/<subsystem>/`.

The skill does **not** seed `10-Domain/`, `20-Architecture/`, or `90-References/` content — those are project-specific and human-curated. Folders exist; files inside are the user's job (or future feature work).

### After bootstrap

Print a summary of what was created. Print: "Bootstrap complete. Run `/update-kb` again to backfill feature notes from existing specs."

Do not proceed to the incremental update on this invocation.

## Incremental update path

Same logic as today's CopytraderX skill, parameterized by the parsed kb-config:

1. **Discover** — list specs in `<specs_dir>/*.md` sorted DESC by filename date. List feature notes in `<vault>/30-Features/**/*.md` (skip `_Hub.md`) and read their `spec:` frontmatter. Candidates = specs with no matching feature note, OR specs whose mtime is newer than the matching feature note's mtime.
2. **Per candidate** — ask which subsystem from the configured `subsystems:` list (plus "skip"). Confirm derived note name (from spec H1, stripping "Design"/"Spec" suffixes).
3. **Write/merge** — feature note frontmatter:
   ```yaml
   status: shipped       # planned | in-progress | shipped | revoked
   area: <subsystem-slug>  # lowercased, hyphenated
   shipped: <ISO date or null>
   spec: <specs_dir>/<file>.md
   plan: <plans_dir>/<file>.md
   pr: null
   related: []
   ```
   Body sections: "What it does", "Gotchas". If the note exists, MERGE — keep body edits, only update frontmatter; show a diff before writing.
4. **Glossary check** — only if `<vault>/10-Domain/Glossary.md` exists. Scan spec for new terms; ask before adding.
5. **ADR prompt** — "Any non-obvious decision worth recording? (y/n)". If yes, write `<vault>/40-Decisions/<YYYY-MM-DD> — <Title>.md` with `status: accepted, date, supersedes: null`.
6. **Index refresh** — only if a new subsystem folder was needed (rare; subsystems are fixed via config).
7. **Report** — created/updated paths, glossary additions, ADRs.

## Constraints (carried over from CopytraderX skill)

- Read-then-confirm-then-write. Never bulk-create or bulk-update without per-item confirmation.
- Never delete vault notes. To mark a feature dead, set `status: revoked` and add a one-line "deprecated YYYY-MM-DD because …".
- Never inline architecture/stack details into `CLAUDE.md`. They belong in `<vault>/20-Architecture/`.
- The vault is NOT git-tracked. Do not run `git add` against vault paths.
- For markdown syntax questions, invoke `obsidian:obsidian-markdown`. For Bases syntax, invoke `obsidian:obsidian-bases`.

## Migration of CopytraderX

Single commit. Two changes:

1. **Delete** `copytraderx-license/.claude/skills/update-kb/` (the entire directory).
2. **Edit** `copytraderx-license/CLAUDE.md` — insert the kb-config block under `## Knowledge Base`:

   ```kb-config
   vault: /Users/jsonse/Documents/Obsidian/CopyTraderX
   project_name: CopyTraderX
   subsystems:
     - Licenses
     - Users
     - Propfirm Rules
     - Journal
   specs_dir: docs/superpowers/specs
   plans_dir: docs/superpowers/plans
   ```

Post-migration, running `/update-kb` from CopytraderX must produce identical behavior to today (same vault, same subsystem prompts, same frontmatter).

## Risks & mitigations

- **kb-config drift across projects.** Each project edits its own block; schemas evolve. Mitigation: skill validates required keys on parse and surfaces missing/unknown keys in a single error message.
- **Skill resolution surprises.** Project-level skills shadow user-level skills. Mitigation: migration deletes the CopytraderX project copy. If the user later puts a project-level `update-kb` somewhere by accident, behavior diverges silently — accepted risk.
- **Bootstrap dialog fatigue in projects that genuinely don't want a KB.** Mitigation: the user can always abort by answering "no" to the first prompt; nothing is written until they confirm.
- **Filename character handling (em-dashes, ↔, accents).** Same risk as before. Mitigation: skill uses the `Write` tool for all file writes, not shell heredocs.

## Out of scope (for this spec)

- Publishing the skill as a plugin (`.claude-plugin/marketplace.json`, etc.).
- Multi-vault projects.
- Auto-syncing vault to a remote.
- A `kb-doctor` / lint command for stale vaults.
- Cross-project search across all vaults.

## Success criteria

1. `~/.claude/skills/update-kb/SKILL.md` exists, has valid frontmatter (`name`, `description`).
2. The CopytraderX project-level skill at `copytraderx-license/.claude/skills/update-kb/` is deleted.
3. CopytraderX `CLAUDE.md` has a kb-config block; running `/update-kb` from inside CopytraderX behaves identically to before this change (same prompts, same write paths).
4. Running `/update-kb` from a brand-new repo with no `CLAUDE.md` walks through bootstrap, ends with a CLAUDE.md + kb-config + vault skeleton, and stops cleanly.
5. Running `/update-kb` from a repo that has the kb-config but no `specs_dir` triggers the Gap-5 prompt, not a crash.
