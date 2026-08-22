# Inherited T3 Code runtime map

This is a factual map of the repository at Nebula foundation commit `de8aa9fc16a651acbd20bed2865dcd2438a4e2d0`, based on upstream T3 Code `592c5983c14d248aa3cfddb8e6c7372f12cd1ab6`. Paths are evidence and extension anchors, not promises that upstream will never move them.

## 1. Repository topology

The workspace is a Vite+ monorepo declared by the root `package.json` and workspace configuration.

| Area                                 | Current responsibility                                                                                 |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `apps/server`                        | Environment server, orchestration, providers, terminal, VCS, checkpoints, persistence, HTTP/WebSocket. |
| `apps/web`                           | React/Vite client used locally, remotely, and inside Electron.                                         |
| `apps/desktop`                       | Electron shell, backend supervision, IPC, native integration, packaging.                               |
| `apps/mobile`                        | React Native iOS/Android client.                                                                       |
| `apps/marketing`                     | Public T3 Code marketing site; separate from the product client.                                       |
| `packages/contracts`                 | Effect Schema contracts and typed RPC definitions.                                                     |
| `packages/client-runtime`            | Shared connection, command, cache, and thread state logic.                                             |
| `packages/shared`                    | Small shared runtime utilities and theme palettes.                                                     |
| `packages/ssh`, `packages/tailscale` | Remote connection support.                                                                             |
| `infra/relay`                        | T3 Connect relay infrastructure.                                                                       |

Canonical explanatory docs include `docs/internals/overview.md`, `docs/internals/providers.md`, `docs/internals/workspace-layout.md`, and `docs/internals/ci.md`. Nebula adds documentation beside them rather than relocating them.

## 2. Runtime entrypoints

### Server and web

`apps/server/src/bin.ts` is the CLI entrypoint. The server command is assembled under `apps/server/src/cli/server.ts`. `apps/server/src/serverRuntimeStartup.ts` initializes settings, orchestration, reactors, keybindings, HTTP/WS readiness, heartbeat, and optional browser opening. Startup can bootstrap a project and thread from the current directory, but the persistent orchestration engine remains canonical.

`apps/server/src/http.ts` exposes HTTP endpoints and `apps/server/src/ws.ts` exposes typed RPC over WebSocket.

### Desktop startup flow

```text
apps/desktop/src/main.ts
→ DesktopApp
→ DesktopBackendManager supervises the bundled server child
→ DesktopWindow waits for backend readiness
→ Electron loads the local web client through the desktop protocol
→ packages/client-runtime opens an authenticated WebSocket session
→ shell/thread snapshots and subscriptions become ready
```

The desktop process does not contain a second orchestration runtime. It supervises the same server used by other clients. Canonical files include `apps/desktop/src/backend/DesktopBackendManager.ts`, `apps/desktop/src/window/DesktopWindow.ts`, and `apps/desktop/src/electron/ElectronProtocol.ts`.

Tests are colocated in the corresponding desktop and server directories.

## 3. Server architecture

The server composes Effect services. The central deterministic runtime is `apps/server/src/orchestration/Layers/OrchestrationEngine.ts`. Domain decisions are pure; effects are pushed to reactors and infrastructure services.

Principal server boundaries:

- orchestration: `apps/server/src/orchestration/`;
- providers: `apps/server/src/provider/`;
- VCS: `apps/server/src/vcs/`;
- checkpoints: `apps/server/src/checkpointing/`;
- terminal: `apps/server/src/terminal/`;
- persistence: `apps/server/src/persistence/`;
- workspace/filesystem access: `apps/server/src/workspace/`;
- HTTP/RPC: `apps/server/src/http.ts` and `apps/server/src/ws.ts`.

Nebula application services should compose these boundaries. It should not add a second server, scheduler, or process supervisor.

## 4. Provider architecture

Canonical built-in registration is `apps/server/src/provider/builtInDrivers.ts`. The current built-ins are Codex, Claude, Cursor, Grok, and OpenCode.

`apps/server/src/provider/ProviderDriver.ts` defines the driver SPI. A driver supplies metadata, configuration schema/defaults, status behavior, and scoped provider-instance creation. Materialized instances expose a stable instance ID, driver kind, continuation identity, display data, enabled/status snapshots, an adapter, and optional text generation.

`apps/server/src/provider/Services/ProviderAdapter.ts` is the common execution contract. It covers session start, turns, interrupt, approvals/user input, stop/list/read/rollback behavior, capability reporting, and a runtime event stream.

`apps/server/src/provider/Layers/ProviderInstanceRegistryLive.ts`, the adapter registry, and provider registry resolve instances and readiness. `apps/server/src/provider/Layers/ProviderService.ts` routes thread operations through the selected instance and adapter. `apps/server/src/provider/Layers/ProviderSessionDirectory.ts` persists the thread-to-provider session binding, provider instance, runtime mode, status, resume cursor, and resume payload.

Each provider implementation owns its installation and authentication inspection. Status is exposed through contracts in `packages/contracts/src/server.ts`. Nebula should consume the common readiness snapshot and represent genuine capability differences rather than rechecking CLIs itself.

Adding a future provider means implementing a driver and adapter and registering the driver in `BUILT_IN_DRIVERS`. Common orchestration, process ownership, and authentication storage do not move into Nebula.

## 5. Session/thread lifecycle

`OrchestrationThread` in `packages/contracts/src/orchestration.ts` is the durable conversation/work unit. It belongs to a project, carries model/provider runtime and interaction state, messages, activity, checkpoints, branch metadata, and an optional worktree path.

The flow is:

```text
web/mobile command helper
→ typed orchestration.dispatchCommand RPC
→ OrchestrationEngine
→ command accepted and event persisted
→ ProviderCommandReactor observes provider intent
→ ProviderService selects provider instance/adapter
→ adapter starts or resumes provider session in effective workspace
→ ProviderRuntimeIngestion converts provider runtime output to orchestration commands
→ committed events update projections and stream to clients
```

The effective provider working directory is the thread worktree path when present, otherwise the project workspace root. `ProviderService` and the adapter own cancellation and stop behavior. Resume identity and provider payload are persisted in `ProviderSessionDirectory`; the adapter performs provider-specific continuation. Thread rollback coordinates checkpoint restore with provider conversation rollback through `CheckpointReactor`.

Nebula's future Agent is therefore an assignment/binding over Task + Thread + provider instance/session, not a new subprocess abstraction.

## 6. Process/terminal architecture

Terminal contracts are in `packages/contracts/src/terminal.ts` and RPC methods in `packages/contracts/src/rpc.ts`. `apps/server/src/terminal/Manager.ts` owns terminal lifecycle; `PtyAdapter.ts` abstracts PTYs and `NodePtyAdapter.ts` supplies the Node implementation.

Clients choose a terminal ID and can open, attach, write, resize, clear, restart, and close a terminal scoped to a thread. The manager streams output, metadata, and exit events. The open request supplies the effective CWD/worktree. The PTY adapter selects a platform shell and scrubs server-specific environment variables before spawn.

Provider subprocesses remain provider-adapter concerns; interactive shells remain terminal-manager concerns. Provider permission modes and RPC authorization constrain execution. Nebula quality gates should compose these existing execution paths with explicit commands and durable results, not introduce a second terminal or process manager.

## 7. Git/VCS/checkpoints

### VCS and worktrees

`apps/server/src/vcs/VcsDriver.ts` is the generic VCS interface. `VcsDriverRegistry` resolves the repository driver. Git behavior lives in `GitVcsDriver.ts` and `GitVcsDriverCore.ts`; higher workflows live in `apps/server/src/git/GitWorkflowService.ts`.

The inherited runtime already supports repository status, diffs, refs/branches, commit/push/pull workflows, pull-request-oriented operations, and worktree listing/creation/removal. Typed RPC exposes `vcs.createWorktree` and `vcs.removeWorktree`. Git worktree creation delegates to native `git worktree add`, optionally creates a branch, and uses a deterministic worktrees directory and sanitized branch name.

`apps/server/src/project/RepositoryIdentityResolver.ts` detects the Git top-level and derives normalized repository identity from remotes, preferring `upstream` then `origin`. This identity is distinct from the orchestration Project, which stores the environment-local workspace root.

### Checkpoints and diffs

Checkpoint coordination lives in `apps/server/src/checkpointing/`. `Utils.ts` defines hidden refs under `refs/t3/checkpoints/<encoded-thread>/turn/<n>`. Git checkpoint operations use a temporary index to capture the full worktree without disturbing the user's index, then use `write-tree`, `commit-tree`, and `update-ref`.

`apps/server/src/orchestration/Layers/CheckpointReactor.ts` captures the baseline and turn checkpoints, calculates diffs, services revert commands, and coordinates provider conversation rollback. `CheckpointDiffQuery.ts` computes turn or full-thread diffs. Restore uses Git restore/clean/reset semantics and can remove untracked files inside the target workspace; UI and future Task Revert must present that consequence clearly.

Nebula can reuse:

- Turn Diff directly;
- Task Diff by anchoring an explicit task baseline/result boundary to existing checkpoint/VCS diff primitives; and
- Task Revert by composing checkpoint restore, task lifecycle state, and provider rollback where applicable.

What is missing is task-level policy: one writable task/worktree, branch/base ownership, lifecycle, cleanup, allowed paths, and integration state.

## 8. Event/orchestration architecture

Canonical contracts are in `packages/contracts/src/orchestration.ts`. The main implementation is:

- commands and events: contracts plus `decider.ts`;
- command execution: `OrchestrationEngine.ts`;
- in-memory read model: `projector.ts`;
- relational projections: `ProjectionPipeline.ts`;
- provider intent side effects: `ProviderCommandReactor.ts`;
- provider stream ingestion: `ProviderRuntimeIngestion.ts`;
- checkpoint side effects: `CheckpointReactor.ts`;
- deletion side effects: `ThreadDeletionReactor.ts`.

### Transaction boundary and authority

The engine uses one command queue and worker, giving commands a total processing order. For each command it:

1. checks the command receipt for idempotence or conflict;
2. calls the pure decider against the current read model;
3. opens one SQLite transaction;
4. appends decided events;
5. applies the in-memory projector and relational projection pipeline;
6. records the accepted receipt; and
7. commits before swapping the live read model and publishing events.

Invariant rejections are recorded as rejected receipts. If an execution fails, the engine reconciles from persisted events. The committed event log is the durable history; the projector and relational tables are its query models. Reactors observe committed intent/events, perform effects in drainable queues, and dispatch follow-up commands. Provider output does not mutate client state directly.

`RuntimeReceiptBus` production publication is intentionally a no-op; receipts used to await reactors in tests are not product state. Future Nebula state belongs in persisted commands/events/projections and subscriptions.

## 9. Persistence

Persistence is local SQLite under `apps/server/src/persistence/`. `Layers/Sqlite.ts` selects the native Node or Bun SQLite implementation, enables WAL, foreign keys, and a busy timeout, and applies migrations. `Migrations.ts` statically registers ordered migrations.

The state directory is derived from the configured T3 home. Normal installed state is under the T3 base directory's `userdata/state.sqlite`; isolated development worktrees use their own `.t3/userdata` state unless explicitly overridden. The desktop computes its base/state directories in `apps/desktop/src/app/DesktopStatePaths.ts` and `DesktopEnvironment.ts`.

Important persisted areas include:

- `orchestration_events` and command receipts;
- provider session runtime/bindings;
- projected projects and threads;
- messages, activities, sessions, and turns;
- pending approvals and orchestration state;
- checkpoint diff blobs;
- pairing/auth sessions; and
- settings and environment metadata.

Server settings use the server settings services/store; desktop/client settings are persisted through desktop platform settings and client settings files. Web appearance choices and custom theme definitions also use browser local storage.

Nebula does **not** need new SQLite infrastructure. It needs narrowly added migrations and projections only when a concrete Task model requires them. ADR-003 and ADR-004 already say to reuse these inherited layers and remain valid.

## 10. RPC/client runtime

`packages/contracts/src/rpc.ts` defines the Effect RPC group and WebSocket methods. `apps/server/src/ws.ts` authenticates upgrades through environment auth, authorizes each method through `RpcAuthorization.ts`, and serves request/stream handlers.

`packages/client-runtime/src/rpc/session.ts` creates a typed WebSocket client session and initial readiness/probe state. `packages/client-runtime/src/connection/supervisor.ts` owns retry, backoff, offline state, and reconnect. `state/shell.ts` caches the shell snapshot, refreshes it over HTTP, and resumes the sequenced shell subscription. `state/threads.ts` maintains paginated/cached thread snapshots and reduces thread event streams. `operations/commands.ts` exposes typed command helpers.

Future Nebula Task commands should be schemas in `packages/contracts`, handled by the existing orchestration dispatch/engine, returned through existing projections/query RPC, and cached in `packages/client-runtime` when more than one client surface consumes them. They should not add REST polling or another socket.

## 11. Web UI

`apps/web` composes the shared client runtime in `apps/web/src/connection/runtime.ts`. Routes and feature components consume cached shell/thread state and dispatch typed commands. The chat view is not the only entrypoint: behavior may also appear in Settings, the command palette, and keybindings.

The future Command Deck belongs in the existing web shell and route system. It should consume Task projections and compose existing provider, Git, terminal, review, and settings surfaces. A task-oriented UI may intentionally diverge, but transport and state lifecycle remain shared.

## 12. Desktop wrapper

The desktop app adds backend supervision, native window/protocol behavior, IPC, filesystem pickers, updates, passkeys, preview integration, settings, telemetry, and packaging. It does not replace web state or server orchestration.

Brand/runtime anchors include:

- `apps/desktop/src/app/DesktopEnvironment.ts` for display name, stage label, app IDs, data paths, and branding;
- `DesktopAppIdentity.ts` for Electron app/about identity;
- `DesktopAssets.ts` and root `assets/` for icons;
- `DesktopWindow.ts` for window creation; and
- `apps/desktop/package.json` plus build/release scripts for packaged product metadata.

Nebula desktop changes must preserve local/remote behavior, data-path migration decisions, signing, updates, and the server readiness contract.

## 13. Appearance/theme architecture

Shared theme roles and built-in palettes live in `packages/shared/src/themePalettes.ts`. The current built-ins are T3 Chat, Grove, Ocean, Ember, and Iris, with light/dark variants and optional sidebar-artwork capability.

`apps/web/src/themePalette.ts` defines the custom theme schema, import/export behavior, role-to-CSS-variable mapping, built-in resolution, and browser storage keys. `apps/web/src/hooks/useTheme.ts` resolves system/light/dark mode, applies palette variables, toggles the `.dark` class, sets `data-theme-id`, updates browser chrome, and bridges theme colors to Electron. `apps/web/src/index.css` maps `--app-theme-*` roles into semantic component variables.

Appearance preferences include System/Light/Dark, presets, custom themes (including VS Code imports), glass opacity, typography settings, and environment identification. The settings surface is under `apps/web/src/routes/settings.appearance.tsx` and related theme settings components. Environment artwork/pills are implemented by `SidebarStageBackdrop.tsx`, `SidebarChrome.tsx`, and `useSettings.ts`; custom themes can suppress built-in artwork.

Desktop native appearance is synchronized through the bridge and `apps/desktop/src/electron/ElectronTheme.ts`. Mobile uses its own appearance preferences and `apps/mobile/src/lib/mobileTheme.ts` while sharing palette concepts.

Nebula can later add a Nebula default palette and replace product artwork/name at these anchors while preserving semantic theme roles, storage compatibility/migration, user-defined themes, light/dark/system behavior, the Electron bridge, and the separate mobile surface. A visual redesign is not part of this map.

## 14. Tests

Tests are predominantly colocated `*.test.ts` and `*.test.tsx` files and run through Vite+/Vitest. Architecture-sensitive areas have focused tests for orchestration decisions/engine behavior, projections and migrations, provider services/adapters, checkpointing, VCS/Git workflows, terminal behavior, RPC/authorization, client reducers, web settings/themes, and desktop runtime/window behavior.

Backend behavior should wait on typed receipts and reactor drains rather than sleeps or polling. New Nebula commands require focused decider, engine/persistence, projector, migration, RPC/client reducer, and UI tests in proportion to the surface changed. Repository-wide checks are CI-owned unless a maintainer requests them.

## 15. CI/release

`.github/workflows/ci.yml` runs formatting/lint, workspace typechecking, desktop build verification, workspace tests, conditional mobile native analysis, and release smoke checks. `docs/internals/ci.md` is the canonical maintainer overview.

`.github/workflows/release.yml` builds signed or unsigned macOS, Linux, and Windows desktop artifacts from release tags. Additional workflows cover web preview, relay deployment, and mobile surfaces. Release scripts and generated brand icons are upstream-sensitive; Nebula rebranding must update their inputs and validation rather than patch generated files only.

## 16. Security boundaries

- Environment connections authenticate before RPC use; `RpcAuthorization.ts` enforces per-method scopes.
- Provider credentials remain in provider-owned CLI or OS mechanisms; the server exposes readiness, not raw secrets.
- Provider permission modes and explicit approval/user-input flows are part of the session contract.
- Terminal and provider processes execute on the environment machine and can affect its filesystem; a worktree is not a sandbox.
- Workspace paths, remote/tunnel modes, and multi-device sessions cross trust boundaries and must use the existing environment auth/authorization layer.
- Hidden checkpoints aid recovery but do not replace backups, protected branches, or production access controls.
- The live T3 data directory must never be used as writable test state; development uses isolated `.t3` state.

Nebula ownership and locks are future source-control policies, not security boundaries. Any stronger filesystem, network, credential, or production isolation requires an explicit security design.
