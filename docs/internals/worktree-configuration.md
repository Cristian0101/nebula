# Worktree configuration boundary

Git worktrees isolate tracked working files; they are not security sandboxes. Nebula Task ownership validates Git changes and gates progression, but does not restrict filesystem access to shared files or provider credentials. Follow [AGENTS.md](../../AGENTS.md) before modifying configuration or state.

## Current setup and risk

The `Setup Worktree` entry in [`t3.json`](../../t3.json) runs on runtime worktree creation. In addition to dependency setup, it symlinks:

| Worktree path      | Source target                           |
| ------------------ | --------------------------------------- |
| `.env`             | `$T3CODE_PROJECT_ROOT/.env`             |
| `infra/relay/.env` | `$T3CODE_PROJECT_ROOT/infra/relay/.env` |

Writes through either alias can change configuration used by the source project and other worktrees. A Task's tracked-file isolation does not make these edits private; shared credentials/configuration can affect other running environments. The setup command also uses forced link replacement and unquoted source paths. Inspect actual resolved targets without printing values; do not run setup solely to inspect it.

`scripts/dev-runner.ts` independently resolves runtime state with explicit `--home-dir` ahead of linked-worktree `.t3`, then ambient `T3CODE_HOME` outside a worktree. Isolated SQLite state does not imply isolated environment files. Browser `dev`/`dev:web` uses single-origin proxies, while desktop configures loopback backend origins.

## Follow-up requiring configuration/runtime authority

Replace implicit writable sharing with an explicit configuration ownership policy, considering task-owned copies or another deliberate mechanism, secret retention, paths containing spaces, existing targets, and compatibility for users who intentionally share configuration. Verify setup and multi-worktree behavior before changing defaults.

This document records the risk and handling boundary only. It does not authorize or implement changes to `t3.json`, environment loading, secret values, or worktree setup. Until separately addressed, inspect aliases before editing and preserve shared configuration.
