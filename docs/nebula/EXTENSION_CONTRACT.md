# Nebula extension contract

This contract classifies how Nebula attaches to the inherited runtime. `REUSE` means consume a primitive without changing its responsibility. `EXTEND` means add compatible contracts/state/behavior at its established boundary. `COMPOSE` means coordinate several existing primitives in a Nebula application service. `NEW NEBULA MODULE` means new product-domain behavior inside the existing server/client architecture. `DEFER` means no v0.1 implementation. `DO NOT DUPLICATE` identifies infrastructure Nebula must not recreate.

## Capability map

| Nebula capability          | Current T3 primitive                                                                                        | Canonical files                                                                                                                                                                                                       | Strategy               | Expected divergence | Risk   | Notes                                                                        |
| -------------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ------------------- | ------ | ---------------------------------------------------------------------------- |
| Repository management      | Project workspace root, repository identity, VCS registry                                                   | `packages/contracts/src/orchestration.ts`; `apps/server/src/project/RepositoryIdentityResolver.ts`; `apps/server/src/vcs/VcsDriver.ts`                                                                                | COMPOSE                | Low                 | Medium | Keep environment-local Project separate from normalized repository identity. |
| Provider detection         | Built-in drivers and provider status snapshots                                                              | `apps/server/src/provider/builtInDrivers.ts`; `apps/server/src/provider/ProviderDriver.ts`; `packages/contracts/src/server.ts`                                                                                        | REUSE                  | Low                 | Low    | Do not shell out separately from Nebula.                                     |
| Provider auth state        | Provider-owned installation/auth inspection                                                                 | `apps/server/src/provider/*Provider.ts`; `packages/contracts/src/server.ts`                                                                                                                                           | REUSE                  | Low                 | Medium | Show unknown/unavailable honestly; never ingest credentials.                 |
| Provider sessions          | Instance/adapter registries, ProviderService, session directory                                             | `apps/server/src/provider/Layers/ProviderService.ts`; `apps/server/src/provider/Services/ProviderAdapter.ts`; `apps/server/src/provider/Layers/ProviderSessionDirectory.ts`                                           | EXTEND                 | Low                 | Medium | Bind a Task to an existing thread/provider session.                          |
| Agent output               | Adapter runtime stream, runtime ingestion, orchestration events                                             | `apps/server/src/provider/Services/ProviderAdapter.ts`; `apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.ts`; `packages/contracts/src/orchestration.ts`                                                 | REUSE                  | Low                 | Medium | Task correlation belongs in durable events, not a parallel stream.           |
| Terminal                   | Thread-scoped terminal manager and PTY adapters                                                             | `packages/contracts/src/terminal.ts`; `apps/server/src/terminal/Manager.ts`                                                                                                                                           | DO NOT DUPLICATE       | None                | High   | Compose only for user shells or deterministic quality commands.              |
| Processes                  | Provider adapters plus terminal manager                                                                     | `apps/server/src/provider/Services/ProviderAdapter.ts`; `apps/server/src/terminal/`                                                                                                                                   | DO NOT DUPLICATE       | None                | High   | No Nebula process supervisor.                                                |
| Git status                 | VCS driver and Git workflow service                                                                         | `apps/server/src/vcs/VcsDriver.ts`; `apps/server/src/git/GitWorkflowService.ts`                                                                                                                                       | REUSE                  | Low                 | Low    | Present status in task context.                                              |
| Diff                       | VCS/checkpoint diff and review service                                                                      | `apps/server/src/checkpointing/CheckpointDiffQuery.ts`; `apps/server/src/review/ReviewService.ts`                                                                                                                     | COMPOSE                | Low                 | Medium | Add explicit task baseline/result correlation.                               |
| Checkpoint/revert          | Hidden checkpoint refs and CheckpointReactor                                                                | `apps/server/src/checkpointing/CheckpointStore.ts`; `apps/server/src/orchestration/Layers/CheckpointReactor.ts`                                                                                                       | COMPOSE                | Low                 | High   | Revert may delete untracked files; retain provider rollback semantics.       |
| Task identity/lifecycle    | Durable Task contracts, commands, events, projectors, SQLite projection, shell subscription, and project UI | `packages/contracts/src/orchestration.ts`; `apps/server/src/orchestration/`; `apps/server/src/persistence/Migrations/041_ProjectionTasks.ts`; `apps/web/src/components/ProjectTasksSection.tsx`                       | IMPLEMENTED            | Intentional         | Medium | Stable provider-neutral Task; Task is not a renamed thread.                  |
| Task worktree ownership    | Task currently derives the inherited Thread/Project workspace; no automatic Task worktree                   | `packages/contracts/src/orchestration.ts`; `apps/server/src/checkpointing/Utils.ts`                                                                                                                                   | NEXT / NOT IMPLEMENTED | Acceptable          | High   | Prompt 4 should give one writable Task one inherited worktree lifecycle.     |
| Git worktrees              | Native worktree create/list/remove RPC and Git driver                                                       | `apps/server/src/vcs/GitVcsDriverCore.ts`; `packages/contracts/src/rpc.ts`                                                                                                                                            | COMPOSE                | Low                 | High   | Add task policy, branch/base identity, cleanup, and failure states.          |
| Ownership engine           | Git changed paths exist; no Task ownership policy                                                           | Existing VCS diff plus future Task contracts                                                                                                                                                                          | NOT IMPLEMENTED        | Acceptable          | High   | Mechanically validate owns/denies before approval/integration.               |
| Shared-resource locking    | No Nebula lock domain                                                                                       | Existing orchestration engine/persistence                                                                                                                                                                             | DEFER                  | Acceptable          | High   | Add only after Task lifecycle; persist locks as deterministic state.         |
| Task event history         | Persisted commands/events/projectors/subscriptions                                                          | `apps/server/src/orchestration/Layers/OrchestrationEngine.ts`; `apps/server/src/orchestration/decider.ts`; `apps/server/src/orchestration/projector.ts`; `apps/server/src/orchestration/Layers/ProjectionPipeline.ts` | EXTEND                 | Acceptable          | High   | Never create a parallel task event bus.                                      |
| Task status                | Draft, active, completed, and cancelled lifecycle with explicit terminal transitions                        | `packages/contracts/src/orchestration.ts`; orchestration projections                                                                                                                                                  | IMPLEMENTED            | Acceptable          | Medium | Provider attempt failure remains independent from Task lifecycle.            |
| Structured handoff         | Messages/activity/diffs exist; no provider-neutral task handoff                                             | Existing orchestration contracts and projections                                                                                                                                                                      | DEFER                  | Acceptable          | Medium | ADR-008 target after explicit Task; keep concise.                            |
| Review                     | Existing diff/review service and UI                                                                         | `apps/server/src/review/ReviewService.ts`; `packages/contracts/src/review.ts`                                                                                                                                         | COMPOSE                | Acceptable          | Medium | Add task decision/evidence rather than replacing diff review.                |
| Quality gates              | Terminal/process execution and CI scripts                                                                   | `apps/server/src/terminal/`; root scripts/package configuration                                                                                                                                                       | DEFER                  | Acceptable          | High   | Store declared command, revision, result, and evidence deterministically.    |
| Integration branch         | Existing Git branch/commit workflows                                                                        | `apps/server/src/git/GitWorkflowService.ts`; `apps/server/src/vcs/GitVcsDriver.ts`                                                                                                                                    | DEFER                  | Acceptable          | High   | Policy should cherry-pick approved commits into a dedicated branch.          |
| Mission DAG                | No Mission/task dependency domain                                                                           | Existing orchestration engine is the runtime anchor                                                                                                                                                                   | DEFERRED               | Intentional later   | High   | v0.2 only; do not make a swarm-only runtime.                                 |
| Provider routing           | Provider selection/capabilities exist; no Nebula scoring                                                    | Provider registries and model selection contracts                                                                                                                                                                     | DEFER                  | Intentional later   | High   | v0.3; policy over real availability and capabilities.                        |
| Appearance/theme system    | Shared palettes, web theme engine, settings, Electron bridge                                                | `packages/shared/src/themePalettes.ts`; `apps/web/src/themePalette.ts`; `apps/web/src/hooks/useTheme.ts`                                                                                                              | EXTEND                 | Intentional UI      | Medium | Add Nebula defaults without breaking custom themes or storage migration.     |
| Product shell/Command Deck | Existing web route/sidebar/settings shell                                                                   | `apps/web/src/`; `packages/client-runtime/src/`                                                                                                                                                                       | NEW NEBULA MODULE      | Intentional UI      | Medium | Reuse connection/state runtime across web/desktop/mobile as applicable.      |

## Systems Nebula must not duplicate

Nebula must not add:

- another provider driver/instance/adapter registry;
- another provider or terminal process supervisor;
- another terminal/PTY API;
- another Git implementation or pseudo-source-control layer;
- another worktree implementation outside the VCS workflow;
- another checkpoint store for the same repository state;
- another command/event bus, task state machine, or projection engine;
- another local embedded database for coordination state;
- another WebSocket/client connection runtime; or
- another Electron shell.

If an inherited boundary is insufficient, document the exact invariant it cannot express and obtain an ADR before replacement.

## Implemented first Nebula module

The first v0.1 implementation boundary is an **explicit Nebula Task tied to one existing thread/provider session and one existing workspace**, implemented as a narrow extension of the current orchestration domain.

Implemented placement:

- Task schemas, commands, events, and read-model fields live beside inherited contracts in `packages/contracts/src/orchestration.ts`;
- Task decisions and projections extend `apps/server/src/orchestration` and use the same engine, SQLite transaction, replay, and shell subscription;
- `projection_tasks` is an additive relational projection in the existing database;
- Task binds an existing canonical Thread while provider/session and effective workspace remain derived from inherited state; and
- shared client commands and the existing shell cache feed a focused project Task surface.

No `packages/nebula-*` package or parallel runtime was created. Automatic worktree management, ownership enforcement, Missions, and routing remain not implemented. The next slice can make a writable Task request an inherited worktree and checkpoint baseline.

Why this boundary is first:

1. Every later ownership, lock, handoff, review, integration, and mission concept needs stable Task identity.
2. T3 already solves the provider session, process, Git, checkpoint, persistence, transport, and client problems around it.
3. It is independently testable through the decider, transaction, projector, subscription, and one client view.
4. It avoids prematurely coupling Task lifecycle to Swarm planning or visual redesign.

## Upstream divergence budget

### Low divergence

Leave these nearly untouched because they are mature, cross-platform, security-sensitive, or frequently maintained upstream:

- provider transport and adapter internals;
- terminal/PTTY implementation and process lifecycle;
- SQLite layer and generic migration runner;
- RPC framing, environment authentication, and generic connection supervisor;
- generic VCS/Git plumbing and checkpoint mechanics;
- desktop backend supervision/protocol plumbing; and
- CI/release/signing infrastructure.

Nebula may consume new capabilities through their public contracts, but should avoid product policy inside them.

### Acceptable extension

Nebula may deliberately extend:

- shared contracts with Task and later coordination schemas;
- the server orchestration decider, events, projections, migrations, and subscriptions;
- project/thread metadata needed to bind Tasks;
- VCS workspace lifecycle composition for task worktrees;
- review/diff composition;
- client-runtime Task cache and commands;
- settings for Nebula behavior; and
- focused routes/components in the existing client shell.

Extensions should be additive and retain one authoritative runtime.

### Intentional divergence

Product identity requires meaningful divergence in:

- product naming and branded assets;
- default theme and visual language;
- navigation and product shell;
- Command Deck and task-oriented UI;
- later Mission/Swarm UX; and
- Nebula-specific product documentation.

Even here, preserve semantic theme contracts, accessibility, connection behavior, custom themes, provider settings, desktop/mobile responsibilities, licenses, notices, and attribution.

## Design readiness map

This is an inventory for a later visual-foundation prompt, not authorization to rebrand now.

| Surface                             | Canonical location/examples                                                                                                                  | Classification                             | Guidance                                                                                              |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Product name/runtime identity       | `apps/desktop/src/app/DesktopEnvironment.ts`; web/mobile strings                                                                             | Runtime behavior; upstream-sensitive       | Change through centralized identity and test data; decide data-dir/protocol compatibility explicitly. |
| Desktop `productName` and packaging | `apps/desktop/package.json`; desktop build/release scripts                                                                                   | Runtime behavior; upstream-sensitive       | Coordinate installer/bundle/update metadata and signing.                                              |
| Window/about titles                 | `apps/desktop/src/app/DesktopAppIdentity.ts`; `apps/desktop/src/window/DesktopWindow.ts`; web document metadata                              | Safe to rebrand with tests                 | Preserve stage labels and accessibility.                                                              |
| App icons                           | root `assets/`; `apps/desktop/src/app/DesktopAssets.ts`; icon export/check scripts                                                           | Generated asset                            | Change source assets and regenerate all platform outputs.                                             |
| Web favicon/manifest/touch icon     | `apps/web/public/`; `apps/web/index.html`                                                                                                    | Generated asset                            | Replace the source set consistently, including splash/browser metadata.                               |
| Sidebar header and brand artwork    | `apps/web/src/components/sidebar/SidebarChrome.tsx`; `apps/web/src/components/SidebarStageBackdrop.tsx`                                      | Safe to rebrand; intentional divergence    | Preserve environment identity modes and remote clarity.                                               |
| Marketing brand/assets              | `apps/marketing/`                                                                                                                            | Intentional divergence; upstream-sensitive | Treat product copy, links, release feeds, store links, and legal pages separately.                    |
| Theme tokens and defaults           | `packages/shared/src/themePalettes.ts`; `apps/web/src/themePalette.ts`; `apps/web/src/index.css`                                             | Runtime behavior                           | Add Nebula defaults through semantic roles; do not hardcode page colors.                              |
| Custom themes                       | `apps/web/src/themePalette.ts`; theme settings; VS Code import                                                                               | Runtime behavior; preserve                 | Maintain schema/storage migration and user-created palettes.                                          |
| Appearance settings                 | `apps/web/src/routes/settings.appearance.tsx`; `apps/web/src/components/settings/ThemeSettings.tsx`; settings contracts                      | Runtime behavior; preserve                 | Retain System/Light/Dark, glass, type, and custom theme controls.                                     |
| Environment artwork/identification  | `apps/web/src/components/SidebarStageBackdrop.tsx`; `apps/web/src/components/sidebar/SidebarChrome.tsx`; `apps/web/src/hooks/useSettings.ts` | Runtime behavior                           | Preserve the distinction between environments across local/remote use.                                |
| Mobile appearance                   | `apps/mobile/src/lib/mobileTheme.ts`; appearance preferences                                                                                 | Separate surface                           | Plan and verify separately rather than assuming web CSS applies.                                      |
| License/copyright/upstream credit   | `LICENSE`, `NOTICE`, `UPSTREAM.md`, source headers/notices                                                                                   | Legal attribution — preserve               | Rebranding must not remove upstream MIT notices or historical attribution.                            |

Changing the custom `t3code:` desktop protocol, storage keys, package scopes, or data directories is not required for visual identity and carries migration/compatibility risk. Treat those as technical migrations, not cosmetic search-and-replace work.

## ADR review

| ADR                                         | Still valid? | Clarification/amendment                                                                                                     | Reason                                                                                                                                     |
| ------------------------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| ADR-001 Git worktrees for task isolation    | Yes          | Clarify that T3 already supplies create/list/remove operations; Nebula adds task lifecycle/policy. No amendment required.   | Thread worktree paths and native Git worktree RPCs already exist. Worktrees are not OS sandboxes.                                          |
| ADR-002 Provider adapter architecture       | Yes          | No amendment.                                                                                                               | The driver, instance, adapter, registry, service, and session directory are established extension points.                                  |
| ADR-003 SQLite for local state              | Yes          | Clarification only: it selects the inherited SQLite database, not new SQLite infrastructure.                                | T3 already has local SQLite, WAL, migrations, orchestration tables, projections, and settings. The ADR wording already says to reuse them. |
| ADR-004 Event log and relational state      | Yes          | Clarification only: extend current commands/events/projectors/relational projections and their transaction boundary.        | T3 already commits events, projections, and receipts through one engine. The ADR already rejects a parallel bus/state machine.             |
| ADR-005 Fork T3 instead of building harness | Yes          | No amendment.                                                                                                               | The scan found mature execution, providers, terminal, VCS, checkpoints, clients, and persistence worth retaining.                          |
| ADR-006 Integration branch and cherry-pick  | Yes          | Clarify controlled merge remains possible but the Nebula default is dedicated integration branch plus ordered cherry-picks. | Existing Git workflows can support the policy; the task/integration state is not implemented yet.                                          |
| ADR-007 Local-first authentication boundary | Yes          | No amendment.                                                                                                               | Current providers inspect provider-owned auth and the environment enforces authenticated/authorized RPC.                                   |
| ADR-008 Structured handoff contract         | Yes          | Clarify it follows explicit Task identity and composes existing diff/activity evidence.                                     | T3 has useful evidence primitives but no provider-neutral task handoff.                                                                    |

No accepted ADR is superseded or materially incorrect. ADR-003 and ADR-004 are already phrased as reuse decisions, so a follow-up amendment would add paperwork without changing architecture. Revisit them only if implementation discovers an invariant the existing database transaction or event/projection model cannot express.
