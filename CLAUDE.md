# CopyTraderX License — Claude Notes

Single-admin Next.js 16 + Supabase tool to manage CopyTraderX-Impulse EA licenses, with per-user journal views and propfirm-rule gating.

See `README.md` for setup, scripts, and Docker/nginx layout.

## Knowledge Base

Project knowledge base (Obsidian vault):
`/Users/jsonse/Documents/Obsidian/CopyTraderX/`

**Read it** at the start of any non-trivial work — especially:

- Brainstorming a new feature (check `30-Features/` for related work, `10-Domain/` for terms).
- Touching auth, roles, licenses, or propfirm rules (check the relevant subsystem hub).
- Naming things — defer to `10-Domain/Glossary.md`.

**Don't write to it inline.** Vault updates happen via `/update-kb` after a feature is shipped. If you notice the vault is out of date during a session, flag it — don't fix it silently.

## Specs and plans

- Design specs: `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`
- Implementation plans: `docs/superpowers/plans/YYYY-MM-DD-<feature>.md`

After a feature ships, run `/update-kb` to backfill the vault.
