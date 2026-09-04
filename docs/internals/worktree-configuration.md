# Worktree configuration boundary

Git worktrees isolate tracked working files; they are not security sandboxes. Nebula Task ownership does not restrict filesystem access, provider credentials, inherited environment variables, or remote services. Local configuration copies can still contain credentials for the same external services. Follow [AGENTS.md](../../AGENTS.md) before modifying configuration or state.

## Setup contract

The `Setup Worktree` entry in [`t3.json`](../../t3.json) installs dependencies, runs [`scripts/setup-worktree-config.mjs`](../../scripts/setup-worktree-config.mjs), then warms the web dependency cache. The helper reads `T3CODE_PROJECT_ROOT` directly from the process environment and uses the terminal working directory as the destination. Paths are passed to filesystem APIs, never interpolated into a shell command.

| Worktree path      | Initial source                    |
| ------------------ | --------------------------------- |
| `.env`             | Source project `.env`             |
| `infra/relay/.env` | Source project `infra/relay/.env` |

For each file:

- A missing destination receives an independent copy of the source's current contents, when available. Source symlinks are dereferenced, not reproduced.
- Existing regular files are preserved, including their permissions, regardless of how they were created. Setup does not refresh or reconcile them.
- Existing symlinks (including dangling links), multiply linked files, non-file destinations, and symlinked destination parent directories stop configuration setup with a diagnostic. Nothing is automatically unlinked or replaced. Inspect these manually before editing; an old worktree may still contain the previous shared aliases.
- Missing optional source files are skipped with a non-secret diagnostic. No broken links or placeholder credentials are created. Other setup steps can continue.
- Later edits in either checkout do not propagate to the other. Two worktrees receive independent files. Rerunning setup preserves completed copies. If a local file has been deliberately removed, rerunning seeds it from the current source again.

There is no automatic refresh mechanism. To update configuration, explicitly edit the worktree's own regular file. To run only this initialization step, invoke `node scripts/setup-worktree-config.mjs` from the worktree with `T3CODE_PROJECT_ROOT` set to the source checkout. Missing source-root configuration or a source root equal to the destination is an error.

## Secrets, permissions, and failures

Both `.env` paths remain Git-ignored. Never print, commit, or attach their contents. New copies have only the source's owner read/write permission bits, further restricted by the process umask; group/other access is not copied. Windows uses its normal filesystem ACL inheritance and Node permission semantics; this is not an ACL-management mechanism.

The helper writes a complete file inside a private `.env.worktree-*` staging directory next to the destination, then publishes it using an exclusive filesystem link and removes the staging link. This temporary link is to the new copy, never to the source. Normal completion leaves a single-link regular file. A destination appearing concurrently is never overwritten. Filesystems without hard-link support fail safely rather than falling back to an overwrite.

Initialization is atomic per file, not across both files. A failure after the root copy leaves that copy intact; rerunning preserves it and retries the relay file. Abrupt process termination can leave an ignored, private staging directory. Termination after publication but before staging cleanup can leave a multiply linked destination; rerunning reports it for manual inspection. No automatic cleanup removes pre-existing configuration or staging artifacts. Worktree removal owns the lifetime of its local copies; source configuration is never written or removed by this helper.

## Runtime and relay compatibility

The server loads `t3.json` through `T3ProjectFileLoader`; clients offer file scripts for explicit import into stored project scripts. Updating `t3.json` does not automatically update an already imported action. In project settings, update the existing Setup Worktree action to the current command from `t3.json` before creating new worktrees; do not keep executing the legacy link command. `ProjectSetupScriptRunner` selects the setup-marked project script, opens a terminal in the worktree with source/worktree environment variables, and writes the command to the configured shell. Worktree setup is requested after worktree creation/attachment in the WebSocket flow and during PR worktree preparation. The runner reports that the command started, not that it completed successfully; inspect the setup terminal for errors. Custom or previously stored setup commands may still need explicit updating; this change does not migrate user-owned script definitions.

Root development configuration is loaded locally by `scripts/lib/public-config.ts`. Relay's deploy wrapper defaults to `infra/relay/.env` in its own checkout, with its existing process-environment fallback and explicit env-file override. Successful relay deployment updates that checkout's root `.env`. Both paths now remain local copies; no relay behavior requires writes to propagate to the source. Deployment code, stage selection, and hosted resources are unchanged. A copied credential does not create a separate hosted service or authorize deployment.

`scripts/dev-runner.ts` independently resolves runtime state with explicit `--home-dir` ahead of linked-worktree `.t3`, then ambient `T3CODE_HOME` outside a worktree. This configuration change does not modify SQLite or other runtime state. Git metadata, provider credentials, and explicitly selected external services can remain shared.

## Previous behavior

Setup previously ran `ln -sf $T3CODE_PROJECT_ROOT/.env .env` and the equivalent relay command. With an absolute project root this produced absolute writable aliases. Forced replacement could discard an existing destination file/link; missing sources could produce dangling links. Unquoted variable expansion was shell-dependent: shells with word splitting/globbing could mishandle spaces or special characters. Editing either worktree alias could modify source configuration and affect other worktrees. No inspected workflow requires this propagation.

## Focused verification

Run `node --test scripts/setup-worktree-config.test.mjs`. Tests use only temporary synthetic configuration and cover independent copies, edits in both directions, multiple worktrees, existing destinations, missing sources, repeated setup, reseeding, permissions, linked parents, and paths containing spaces and shell-special characters. No application server or real configuration is needed.
