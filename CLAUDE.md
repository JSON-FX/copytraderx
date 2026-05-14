# CopyTraderX License — Claude Notes

Single-admin Next.js 16 + Supabase tool to manage CopyTraderX-Impulse EA licenses, with per-user journal views and propfirm-rule gating.

See `README.md` for setup, scripts, and Docker/nginx layout.

## Knowledge Base

Project knowledge base (Obsidian vault):
`/Users/jsonse/Documents/Obsidian/CopyTraderX/CopyTraderX/`

**Read it** at the start of any non-trivial work — especially:

- Brainstorming a new feature (check `30-Features/` for related work, `10-Domain/` for terms).
- Naming things — defer to `10-Domain/Glossary.md`; cross-project terms in `[[_Shared/Glossary]]`.
- Touching subsystem code — check the relevant `_Hub.md`.

**Don't write to it inline.** Vault updates happen via `/update-kb` after shipping work.

The `recall-kb` skill auto-fires on feature/fix/brainstorm prompts to load relevant vault context.

```kb-config
vault: /Users/jsonse/Documents/Obsidian/CopyTraderX
project_name: CopyTraderX
project_path: /Users/jsonse/Documents/Obsidian/CopyTraderX/CopyTraderX
subsystems:
  - Licenses
  - Subscriptions
  - Users
  - Requests
  - Journal
  - Propfirm Rules
  - Auth
  - Email
specs_dir: docs/superpowers/specs
plans_dir: docs/superpowers/plans
schema_version: 1
```

## Knowledge base workflow

Run these skills at the right moments — they are how this project's long-term memory stays current:

- **Before** brainstorming, designing, or implementing a feature/fix → `/recall-kb <topic>` to load relevant prior context (auto-fires via hook if installed).
- **After** shipping a feature, fix, hotfix, or release → `/update-kb` to sync specs, plans, and recent commits into the vault.
- **Periodically** (monthly or before major releases) → `/kb-doctor` to detect drift, broken links, and stale notes.

If you (Claude) notice during a session that the vault is out of date or missing context for what's being built, surface it — don't fix it silently. The user runs `/update-kb`.

## Specs and plans

- Design specs: `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`
- Implementation plans: `docs/superpowers/plans/YYYY-MM-DD-<feature>.md`
