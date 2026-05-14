# Global `update-kb` Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote the project-specific `update-kb` skill to a user-level skill at `~/.claude/skills/update-kb/SKILL.md` that works across any project, reads its config from a fenced `kb-config` block in the project's `CLAUDE.md`, bootstraps anything missing on first run, and migrates CopytraderX off its project-level copy in the same change.

**Architecture:** The deliverable is **content** — one prose-and-shell-snippet `SKILL.md` file at `~/.claude/skills/update-kb/`, plus a CLAUDE.md edit and a directory deletion in the CopytraderX repo. There is no code to test; verification is "does the file exist with the right shape" and a final manual smoke test by the user inside CopytraderX. No TDD loop applies.

**Tech Stack:** Markdown skill file with YAML frontmatter; embedded shell snippets the executing agent runs (`grep`, `test -d`, `git rev-parse`, simple YAML parsing in awk/grep). No code dependencies.

**Spec:** `docs/superpowers/specs/2026-05-07-global-update-kb-skill-design.md`

---

## File Structure

| Path | Action | Responsibility |
|---|---|---|
| `~/.claude/skills/update-kb/SKILL.md` | Create | The new global skill. Single file. |
| `copytraderx-license/CLAUDE.md` | Modify | Insert kb-config block under `## Knowledge Base`. |
| `copytraderx-license/.claude/skills/update-kb/SKILL.md` | Delete | Old project-level shadow. |
| `copytraderx-license/.claude/skills/update-kb/` | Delete | Empty parent dir. |

The plan is intentionally short — 6 tasks. The dominant artifact is the SKILL.md content itself, which Task 2 writes verbatim. Tasks 3–6 are migration + smoke test.

---

## Conventions

- All shell commands assume the agent runs them from the relevant working directory; each task states which.
- File-write steps use the `Write` tool, not shell heredocs (preserves em-dashes, `↔`, `…`, accents).
- "Verify" steps print `OK` / `DONE` on success and a `MISSING:` / `FAIL:` line on failure. Stop on first failure; do not continue to the next task.

---

## Task 1: Verify prerequisites

**Files:** none modified.

> Sanity check before doing anything destructive. The user-skills directory should already exist; the CopytraderX project copy of the skill should still be present.

- [ ] **Step 1: Confirm `~/.claude/skills/` exists**

Run:
```bash
test -d ~/.claude/skills && ls ~/.claude/skills | head -20
```
Expected: a non-empty listing (e.g. `edge-case-analysis`, `eod-report`, etc.). If the directory does not exist, STOP and report — the host doesn't have a user-skills layout the way the spec assumed.

- [ ] **Step 2: Confirm the CopytraderX project skill still exists**

Run:
```bash
test -f /Users/jsonse/Documents/development/copytraderx-license/.claude/skills/update-kb/SKILL.md && echo OK
```
Expected: `OK`. (We need it present in order to delete it in Task 4.)

- [ ] **Step 3: Confirm there is no existing user-level update-kb**

Run:
```bash
test -e ~/.claude/skills/update-kb && echo "ALREADY-EXISTS — STOP" || echo "OK"
```
Expected: `OK`. If you see `ALREADY-EXISTS`, stop and ask the user whether to overwrite.

---

## Task 2: Write the global SKILL.md

**Files:**
- Create: `~/.claude/skills/update-kb/SKILL.md`

> This is the entire skill. One file. Use the `Write` tool — do not paste through `bash`/`echo`.

- [ ] **Step 1: Create the directory**

Run:
```bash
mkdir -p ~/.claude/skills/update-kb && echo OK
```
Expected: `OK`.

- [ ] **Step 2: Write `SKILL.md`**

Use the `Write` tool to create `/Users/jsonse/.claude/skills/update-kb/SKILL.md` with this exact content:

````markdown
---
name: update-kb
description: Update or bootstrap a project's Obsidian knowledge base from specs/plans. Reads kb-config from the project's CLAUDE.md and works in any git repo. Use when the user says "/update-kb", "update the knowledge base", "update the vault", or after a feature ships. Detects gaps and walks the user through bootstrap on first run. Read-then-confirm-then-write — never bulk-edit autonomously.
---

# update-kb

Update or bootstrap an Obsidian-based knowledge base for the current project. Configuration lives in a fenced ` ```kb-config ` block in the project's `CLAUDE.md`. The vault itself lives outside git and is owned by Obsidian.

## Operating principles

- **Read-then-confirm-then-write.** Never bulk-create or bulk-update without per-item confirmation.
- **Never delete vault notes.** To mark a feature dead, set `status: revoked` and add a one-line "deprecated YYYY-MM-DD because …" at the top of the body.
- **Vault is not git-tracked.** Never run `git add` against vault paths.
- **Use the `Write` tool for file writes**, not shell heredocs. Preserves em-dashes, `↔`, accents, smart quotes.
- For markdown syntax questions, invoke `obsidian:obsidian-markdown`. For Bases syntax, invoke `obsidian:obsidian-bases`.

## Detection phase (always runs first)

Run these six checks in order. Track yes/no for each.

1. **In a git repo?**
   ```bash
   REPO=$(git rev-parse --show-toplevel 2>/dev/null) && test -n "$REPO"
   ```
   If this fails, STOP and report: "update-kb must run inside a git repository."

2. **`CLAUDE.md` at repo root?**
   ```bash
   test -f "$REPO/CLAUDE.md"
   ```

3. **kb-config block present?**
   ```bash
   grep -q '^```kb-config$' "$REPO/CLAUDE.md" 2>/dev/null
   ```

4. **Vault path resolves to an existing directory?** (Only evaluable after step 3 passes — parse `vault:` from the block.)
   ```bash
   test -d "$VAULT"
   ```

5. **`specs_dir` and `plans_dir` exist?** (After parsing config.)
   ```bash
   test -d "$REPO/$SPECS_DIR" && test -d "$REPO/$PLANS_DIR"
   ```

6. **Vault has the standard skeleton?**
   ```bash
   for d in 00-Index 10-Domain 20-Architecture 30-Features 40-Decisions 90-References; do
     test -d "$VAULT/$d" || echo "MISSING $d"
   done
   ```

If all six pass → **incremental update path** (below). If any fail → **bootstrap path** (below).

## Parsing the kb-config block

Locate the block:

```bash
awk '/^```kb-config$/{flag=1;next} /^```$/{flag=0} flag' "$REPO/CLAUDE.md"
```

The five required keys are:

```yaml
vault: /absolute/path/to/vault
project_name: <name>
subsystems:
  - <Subsystem One>
  - <Subsystem Two>
specs_dir: docs/superpowers/specs
plans_dir: docs/superpowers/plans
```

Validate: every key present, `vault` is absolute, `subsystems` is a non-empty list. If validation fails, report which key is missing/malformed and STOP.

## Bootstrap path

Resolves gaps one at a time, in dependency order. After bootstrap, **STOP** — do not proceed to incremental update on the same invocation. Tell the user: "Bootstrap complete. Run `/update-kb` again to backfill feature notes from existing specs."

### Gap 2 — `CLAUDE.md` missing

Prompt: "No `CLAUDE.md` at repo root. Create one? (y/n)"

If yes, write this template (filled with values gathered in Gap 3) to `$REPO/CLAUDE.md`:

````markdown
# <project_name> — Claude Notes

<one-line description; default: "TODO — describe this project">

## Knowledge Base

Project knowledge base (Obsidian vault):
`<vault path>`

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
````

### Gap 3 — kb-config block missing

Prompt the user, in order:

1. **Project name** — default: `basename "$REPO"`. Example: "Use 'CopyTraderX' as the project name? (y/n, or paste a different name)"
2. **Vault path** — three options:
   - "Use `~/Documents/Obsidian/<project_name>/`" (default; `mkdir -p` if absent)
   - "Create at a different path" — ask, `mkdir -p`
   - "Use an existing vault — paste the absolute path" — `test -d`, retry on miss
3. **Subsystems** — comma-separated list. Example: "Subsystems? (comma-separated, e.g. `Licenses, Users, Journal`. Blank = `[General]`.)"
4. **specs_dir** — default `docs/superpowers/specs`.
5. **plans_dir** — default `docs/superpowers/plans`.

Show the kb-config block to the user before writing it. Insert the block under the `## Knowledge Base` heading in `CLAUDE.md`. If `## Knowledge Base` is missing, append the full Knowledge Base section from the Gap 2 template.

### Gap 4 — vault path missing

Resolved inline as part of Gap 3's vault-path prompt. The three sub-options each create the directory; "use an existing vault" requires `test -d` to pass before the skill accepts it. There is no separate Gap 4 prompt.

### Gap 5 — `specs_dir` / `plans_dir` missing

Prompt: "Create `<specs_dir>` and `<plans_dir>`? (y/n)"

If yes:
```bash
mkdir -p "$REPO/$SPECS_DIR" "$REPO/$PLANS_DIR"
```

The skill does not create any spec content — that's brainstorming's job.

### Gap 6 — vault skeleton missing

Prompt: "Vault has no standard skeleton. Seed it? (y/n)"

If yes, create:

```bash
for d in 00-Index 10-Domain 20-Architecture 40-Decisions 90-References; do
  mkdir -p "$VAULT/$d"
done
for s in "${SUBSYSTEMS[@]}"; do
  mkdir -p "$VAULT/30-Features/$s"
done
```

Then write these files using the `Write` tool:

- `$VAULT/00-Index/<project_name>.md` — minimal entry point (frontmatter `type: index, updated: <today>`, an H1, a single sentence "TODO project description", and a Map section listing the folders).
- `$VAULT/30-Features/_Features Index.base` — Features Index Base (schema below).
- `$VAULT/40-Decisions/_ADR Index.base` — ADR Index Base (schema below).
- `$VAULT/30-Features/<Subsystem>/_Hub.md` for each subsystem — frontmatter `type: hub, area: <slug>, updated: <today>`, an H1 with the subsystem name, a one-line "TODO: describe this subsystem".

The skill does **not** seed `10-Domain/`, `20-Architecture/`, or `90-References/` content. Those folders exist; their contents are project-specific.

#### `_Features Index.base`

```yaml
filters:
  and:
    - file.inFolder("30-Features")
    - file.name != "_Hub"
    - 'note["status"] != null'
properties:
  note.status:
    displayName: Status
  note.area:
    displayName: Area
  note.shipped:
    displayName: Shipped
  note.pr:
    displayName: PR
views:
  - type: table
    name: All features
    order:
      - file.name
      - note.status
      - note.area
      - note.shipped
      - note.pr
    sort:
      - property: note.shipped
        direction: DESC
  - type: table
    name: By area
    order:
      - note.area
      - file.name
      - note.status
      - note.shipped
    sort:
      - property: note.area
        direction: ASC
      - property: note.shipped
        direction: DESC
```

#### `_ADR Index.base`

```yaml
filters:
  and:
    - file.inFolder("40-Decisions")
    - 'note["date"] != null'
properties:
  note.status:
    displayName: Status
  note.date:
    displayName: Date
  note.supersedes:
    displayName: Supersedes
views:
  - type: table
    name: All ADRs
    order:
      - file.name
      - note.status
      - note.date
      - note.supersedes
    sort:
      - property: note.date
        direction: DESC
```

### After bootstrap

Print a summary table:

```
Created:
  - <path>
Updated:
  - <path>
```

Then say: "Bootstrap complete. Run `/update-kb` again to backfill feature notes from existing specs." and STOP.

## Incremental update path

Runs only when all six detection checks pass.

### 1. Discover candidates

- List specs in `$REPO/$SPECS_DIR/*.md` sorted by filename date DESC.
- List feature notes under `$VAULT/30-Features/**/*.md`, skipping any file named `_Hub.md`. Read each note's `spec:` frontmatter.
- Candidates = specs with no matching feature note, OR specs whose file mtime is newer than the matching feature note's mtime.
- If zero candidates: report "Vault is up to date." and STOP.

### 2. Per candidate, prompt the user

For each candidate, ask:

> "Found `<spec-filename>`. Subsystem? (`<comma-separated list from kb-config.subsystems>` / skip)"

If skip, continue without writing anything.

Derive `<Feature Name>` from the spec's first H1 heading. Strip trailing "Design", "— Design", "Spec", "— Spec". Confirm the derived name with the user before writing.

### 3. Write or merge the feature note

Path: `$VAULT/30-Features/<Subsystem>/<Feature Name>.md`.

Frontmatter template (fill every field; use `null` if unknown):

```yaml
---
status: shipped       # planned | in-progress | shipped | revoked
area: <subsystem-slug>  # lowercased, hyphenated; e.g. "Propfirm Rules" → "propfirm-rules"
shipped: <ISO date or null>
spec: <specs_dir>/<file>.md
plan: <plans_dir>/<file>.md   # find by date prefix; null if no matching plan
pr: <PR number or null>
related: []           # ask the user
---
```

Body: two sections.

- **What it does** — 3–6 bullets paraphrased from the spec.
- **Gotchas** — non-obvious constraints from the spec's "Risks", "Non-goals", or amendments.

If the note already exists, MERGE: keep the user's body edits, only update frontmatter. Show a diff before writing.

### 4. Glossary check

Only run if `$VAULT/10-Domain/Glossary.md` exists. Otherwise skip.

Scan the spec for proper-noun-ish terms (capitalized words, kebab-case identifiers, table names) absent from `Glossary.md`. For each, ask:

> "New term `<term>` — add to Glossary? (y/n, or paste a one-line definition)"

Append confirmed terms alphabetically. Never auto-add without confirmation.

### 5. ADR prompt

Ask: "Any non-obvious decision in this feature worth recording as an ADR? (y/n)"

If yes, ask for a short title and three sections (Context, Decision, Consequences). Write to `$VAULT/40-Decisions/<YYYY-MM-DD> — <Title>.md`:

```yaml
---
status: accepted
date: <today>
supersedes: null   # or "[[<existing ADR title>]]"
---
```

### 6. Index refresh

If a new subsystem hub was somehow created (rare — subsystems are fixed via config), add a link to it from `$VAULT/00-Index/<project_name>.md`. Otherwise skip.

### 7. Report

Print:

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

The vault is NOT git-tracked. Do not run `git add` against vault paths.

## Out of scope

- Auto-syncing the vault to a remote.
- Generating notes from git log alone (without a spec).
- Editing notes in `10-Domain/` or `20-Architecture/` automatically — those are human-curated; suggest edits, never write.
- Renaming subsystem folders if the user changes the kb-config — manual.
````

- [ ] **Step 3: Verify the file is well-formed**

Run:
```bash
F=~/.claude/skills/update-kb/SKILL.md
test -f "$F" || { echo MISSING; exit 1; }
head -1 "$F" | grep -q "^---$" && echo HAS-FRONTMATTER
grep -q "^name: update-kb$" "$F" && echo HAS-NAME
grep -q "^description: " "$F" && echo HAS-DESCRIPTION
grep -q "^## Detection phase" "$F" && echo HAS-DETECTION
grep -q "^## Bootstrap path" "$F" && echo HAS-BOOTSTRAP
grep -q "^## Incremental update path" "$F" && echo HAS-INCREMENTAL
grep -q "^### Gap 4" "$F" && echo HAS-GAP-4-NOTE
```
Expected:
```
HAS-FRONTMATTER
HAS-NAME
HAS-DESCRIPTION
HAS-DETECTION
HAS-BOOTSTRAP
HAS-INCREMENTAL
HAS-GAP-4-NOTE
```

---

## Task 3: Add kb-config block to CopytraderX `CLAUDE.md`

**Files:**
- Modify: `/Users/jsonse/Documents/development/copytraderx-license/CLAUDE.md`

> The block goes immediately before the closing of the `## Knowledge Base` section — i.e. between the "Don't write to it inline." paragraph and the `## Specs and plans` heading.

- [ ] **Step 1: Read current CLAUDE.md**

Run:
```bash
cat /Users/jsonse/Documents/development/copytraderx-license/CLAUDE.md
```

Confirm the file contains both `## Knowledge Base` and `## Specs and plans` headings.

- [ ] **Step 2: Insert the kb-config block**

Use the `Edit` tool. Replace this exact `old_string`:

```
**Don't write to it inline.** Vault updates happen via `/update-kb` after a feature is shipped. If you notice the vault is out of date during a session, flag it — don't fix it silently.

## Specs and plans
```

with this exact `new_string`:

````
**Don't write to it inline.** Vault updates happen via `/update-kb` after a feature is shipped. If you notice the vault is out of date during a session, flag it — don't fix it silently.

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

## Specs and plans
````

- [ ] **Step 3: Verify the block was inserted correctly**

Run:
```bash
F=/Users/jsonse/Documents/development/copytraderx-license/CLAUDE.md
grep -q '^```kb-config$' "$F" && echo HAS-FENCE
grep -q '^vault: /Users/jsonse/Documents/Obsidian/CopyTraderX$' "$F" && echo HAS-VAULT
grep -q '^project_name: CopyTraderX$' "$F" && echo HAS-PROJECT
grep -qE '^  - Propfirm Rules$' "$F" && echo HAS-SUBSYSTEMS
grep -q '^specs_dir: docs/superpowers/specs$' "$F" && echo HAS-SPECS
grep -q '^plans_dir: docs/superpowers/plans$' "$F" && echo HAS-PLANS
```
Expected: all six lines printed.

---

## Task 4: Delete the project-level skill

**Files:**
- Delete: `/Users/jsonse/Documents/development/copytraderx-license/.claude/skills/update-kb/SKILL.md`
- Delete: `/Users/jsonse/Documents/development/copytraderx-license/.claude/skills/update-kb/`

> The user-level skill is now in place (Task 2) and CopytraderX has its kb-config (Task 3). It is safe to remove the project-level shadow.

- [ ] **Step 1: Confirm the user-level skill exists before deleting the project copy**

Run:
```bash
test -f ~/.claude/skills/update-kb/SKILL.md && echo USER-SKILL-OK
test -f /Users/jsonse/Documents/development/copytraderx-license/.claude/skills/update-kb/SKILL.md && echo PROJECT-SKILL-PRESENT
```
Expected:
```
USER-SKILL-OK
PROJECT-SKILL-PRESENT
```
If the first line is missing, STOP — do not delete the project skill.

- [ ] **Step 2: Remove the project skill directory**

Run:
```bash
rm -rf /Users/jsonse/Documents/development/copytraderx-license/.claude/skills/update-kb
```

- [ ] **Step 3: Verify the directory is gone but the skills parent remains**

Run:
```bash
test ! -e /Users/jsonse/Documents/development/copytraderx-license/.claude/skills/update-kb && echo REMOVED
test -d /Users/jsonse/Documents/development/copytraderx-license/.claude/skills && echo SKILLS-DIR-OK
```
Expected:
```
REMOVED
SKILLS-DIR-OK
```

---

## Task 5: Commit the CopytraderX changes

**Files:**
- Stage: `CLAUDE.md` (modified)
- Stage: `.claude/skills/update-kb/SKILL.md` (deleted) — git records the deletion automatically once the file is gone.

> Vault content remains untracked. The user-level skill at `~/.claude/skills/update-kb/SKILL.md` is OUTSIDE this repo and is not staged.

- [ ] **Step 1: Inspect the working tree**

Run from the CopytraderX repo root:
```bash
cd /Users/jsonse/Documents/development/copytraderx-license
git status --short
```
Expected (order may vary; `next-env.d.ts` is a pre-existing unrelated change — leave it alone):
```
 D .claude/skills/update-kb/SKILL.md
 M CLAUDE.md
 M next-env.d.ts
```

- [ ] **Step 2: Stage only the two intended changes**

```bash
cd /Users/jsonse/Documents/development/copytraderx-license
git add CLAUDE.md .claude/skills/update-kb/SKILL.md
git status --short
```
Expected:
```
D  .claude/skills/update-kb/SKILL.md
M  CLAUDE.md
 M next-env.d.ts
```

- [ ] **Step 3: Commit**

```bash
cd /Users/jsonse/Documents/development/copytraderx-license
git commit -m "$(cat <<'EOF'
refactor(kb): migrate to global update-kb skill

Add kb-config block to CLAUDE.md and remove the project-level
update-kb skill. The skill now lives at ~/.claude/skills/update-kb/
and reads its config from CLAUDE.md, so it works in any project.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git log -1 --oneline
```
Expected: a new commit with the message above.

---

## Task 6: Smoke-test the global skill from inside CopytraderX

**Files:** none modified.

> This is a manual sanity check, not an automated test. We verify three things: (1) the global skill is discoverable, (2) the kb-config in CLAUDE.md parses, (3) the detection phase against CopytraderX's actual vault returns "all green" so an `/update-kb` invocation would go to the incremental path (i.e. behavior unchanged).

- [ ] **Step 1: Confirm the user-level skill is in place**

Run:
```bash
ls ~/.claude/skills/update-kb/SKILL.md && \
  grep -E "^(name|description):" ~/.claude/skills/update-kb/SKILL.md
```
Expected:
```
/Users/jsonse/.claude/skills/update-kb/SKILL.md
name: update-kb
description: Update or bootstrap a project's Obsidian knowledge base ...
```

- [ ] **Step 2: Parse CopytraderX's kb-config block from outside the skill**

Run from the CopytraderX repo root:
```bash
cd /Users/jsonse/Documents/development/copytraderx-license
awk '/^```kb-config$/{flag=1;next} /^```$/{flag=0} flag' CLAUDE.md
```
Expected output (exact):
```
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

- [ ] **Step 3: Run the detection phase manually**

Run from the CopytraderX repo root:
```bash
cd /Users/jsonse/Documents/development/copytraderx-license
REPO=$(git rev-parse --show-toplevel) && echo "1: REPO=$REPO"
test -f "$REPO/CLAUDE.md" && echo "2: CLAUDE.md OK"
grep -q '^```kb-config$' "$REPO/CLAUDE.md" && echo "3: kb-config OK"
VAULT=/Users/jsonse/Documents/Obsidian/CopyTraderX
test -d "$VAULT" && echo "4: vault OK"
test -d "$REPO/docs/superpowers/specs" && test -d "$REPO/docs/superpowers/plans" && echo "5: dirs OK"
for d in 00-Index 10-Domain 20-Architecture 30-Features 40-Decisions 90-References; do
  test -d "$VAULT/$d" || echo "6: MISSING $d"
done
echo "6: skeleton OK"
```
Expected:
```
1: REPO=/Users/jsonse/Documents/development/copytraderx-license
2: CLAUDE.md OK
3: kb-config OK
4: vault OK
5: dirs OK
6: skeleton OK
```

If any line is missing, the global skill would fall into bootstrap when run against CopytraderX — which would be a regression from the spec's success criterion #3. STOP and report which check failed.

- [ ] **Step 4: User-driven validation (optional, only if the user wants to actually try the skill)**

Ask the user:

> "Want to try `/update-kb` from inside CopytraderX now? It should report 'Vault is up to date.' since all six specs already have feature notes. If it instead asks about a subsystem for an existing spec, that's a regression — flag it."

This step is informational. Mark it `[x]` once the user confirms either "Vault is up to date." or that they're skipping the live test.

---

## Done criteria

- [ ] `~/.claude/skills/update-kb/SKILL.md` created with valid frontmatter (Task 2).
- [ ] CopytraderX `CLAUDE.md` contains the kb-config block with all five required keys (Task 3).
- [ ] Project-level skill at `copytraderx-license/.claude/skills/update-kb/` is gone (Task 4).
- [ ] CopytraderX repo has one new commit recording the migration (Task 5).
- [ ] Manual detection-phase walk-through against CopytraderX returns all six green (Task 6 Step 3).
