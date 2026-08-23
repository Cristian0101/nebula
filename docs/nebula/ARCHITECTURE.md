# Nebula architecture

## Core architectural thesis

Nebula is not fundamentally a terminal manager, chatbot, or model router. Nebula is:

> A task coordination and trust system for AI-generated software changes.

Its target flow is:

```text
Intent
↓
Task
↓
Ownership
↓
Workspace
↓
Agent
↓
Change
↓
Validation
↓
Review
↓
Integration
↓
Recovery
```

The conceptual layers are UI → application services → Nebula orchestration domain → provider runtime → Git/system infrastructure → persistence. These layers describe responsibilities. They do not justify creating packages before a concrete implementation requires them.

## Inherited from T3

T3 Code is the runtime foundation, not a temporary prototype.

### Execution and clients

- `apps/server` owns the local environment, provider subprocesses, terminal sessions, orchestration, VCS, checkpoints, persistence, and WebSocket API.
- `apps/web` is the primary React/Vite client.
- `apps/desktop` is an Electron shell that supervises the server and loads the web client.
- `apps/mobile` is a separate React Native client.
- `packages/client-runtime` shares connection, command, and cached state behavior across clients.

### Contracts and deterministic state

- `packages/contracts/src/orchestration.ts` defines projects, threads, commands, events, and read models.
- `apps/server/src/orchestration/Layers/OrchestrationEngine.ts` serializes commands, calls the pure decider, commits events and projections in one SQLite transaction, then publishes committed events.
- `apps/server/src/orchestration/decider.ts`, `projector.ts`, and `ProjectionPipeline.ts` are the existing deterministic command/event/read-model architecture.
- Reactors perform provider, checkpoint, and deletion side effects and feed durable results back through commands.

### Providers and sessions

Built-in providers register through `apps/server/src/provider/builtInDrivers.ts`. Drivers create scoped provider instances, adapters translate provider protocols, registries route by provider instance, and `ProviderService` owns the common session lifecycle. Provider authentication remains provider-owned.

Antigravity uses the same boundaries. `AntigravityDriver` materializes the provider instance and optional structured text-generation service; `AntigravityAdapter` invokes `agy` through the inherited child-process spawner with the effective Thread/Task working directory. It parses the official NDJSON `init`, `step_update`, and `result` envelopes into normalized runtime events, persists the returned conversation ID as the resume cursor, and uses `--conversation` on later turns. First turns use the official `--new-project` behavior so the canonical Task worktree becomes Antigravity's workspace. The adapter does not use ACP, private Google endpoints, a second process manager, or a Nebula credential store.

Antigravity headless permissions are an additional provider-side boundary. Nebula uses `accept-edits` for workspace file changes but never supplies `--dangerously-skip-permissions`; Antigravity can still soft-deny commands or operations outside its current policy. That boundary complements, and does not replace, Task worktree isolation and ownership validation.

### Git, workspaces, and recovery

Projects hold a workspace root; a thread may override it with a worktree path. `apps/server/src/vcs` supplies VCS drivers and Git workflows, including worktree creation/removal. `apps/server/src/checkpointing` captures hidden Git refs, computes diffs, restores files, and coordinates provider conversation rollback.

### Persistence and transport

The inherited server already uses a migrated local SQLite database, typed WebSocket RPC, authenticated connections, per-method authorization, streaming subscriptions, and client-side reconnect/cache logic. Nebula must extend these systems rather than place another runtime beside them.

## Nebula target architecture

Nebula adds a task coordination domain to the existing orchestration engine.

### Required domain concepts

| Concept         | Target responsibility                                          | Inherited anchor                                              |
| --------------- | -------------------------------------------------------------- | ------------------------------------------------------------- |
| Repository      | Stable source-control identity and roots.                      | Project plus `RepositoryIdentityResolver` and VCS driver.     |
| Task            | Explicit bounded unit of work and lifecycle.                   | New Nebula state in existing orchestration contracts/engine.  |
| Agent           | A task assignment to a provider-backed execution session.      | Provider instance, thread, and provider session binding.      |
| Role            | Permission-bearing responsibility such as Builder or Reviewer. | New policy attached to a Task assignment.                     |
| Provider        | Provider kind/capabilities/readiness.                          | Existing driver and provider registries.                      |
| ProviderSession | Live/resumable provider conversation.                          | Existing `ProviderService`, adapter, and session directory.   |
| Workspace       | Effective filesystem root for work.                            | Project workspace root or thread worktree path.               |
| OwnershipRule   | Allowed and denied path patterns.                              | New deterministic task policy validated against Git changes.  |
| ResourceLock    | Serialized access to shared resources.                         | Future Nebula state; not an in-memory LLM convention.         |
| AgentEvent      | Traceable task activity.                                       | Extend existing orchestration events/projections.             |
| FileChange      | Task-relative changed paths and diff.                          | Existing VCS/checkpoint/review diff primitives.               |
| Commit          | Reviewable task result revision.                               | Native Git via existing VCS workflows.                        |
| Review          | Independent decision and evidence.                             | Compose existing review/diff service; extend task state.      |
| QualityGate     | Deterministic command and result.                              | Future task policy using existing terminal/process execution. |
| Integration     | Controlled promotion of approved commits.                      | Existing Git workflows plus new policy/state.                 |
| Mission         | Later grouping and coordination boundary.                      | Future Nebula state.                                          |
| TaskDependency  | Later DAG edge and readiness rule.                             | Future Nebula state.                                          |

Do not create one class or package for every noun. The first implementation should add only the types and state transitions needed for an explicit Task.

### Implemented Task vertical slice

Nebula now implements Task identity and lifecycle through the inherited orchestration engine. A Task has a stable branded ID, Project, title, objective, role, lifecycle status, optional primary Thread, and lifecycle timestamps. The implemented transitions are `draft → active → completed`, `draft → cancelled`, and `active → cancelled`; terminal Tasks cannot be reopened.

Task commands produce persisted Task events. The in-memory projector and `projection_tasks` relational projector apply those events inside the inherited SQLite transaction and replay model. Task rows are included in the existing shell snapshot/subscription and shared client cache. The project Task UI composes canonical Thread creation and provider turn dispatch instead of duplicating either runtime.

Task does not persist provider-session identity or trust a renderer-supplied workspace path. New Builder Tasks persist a server-resolved source repository, exact base commit, stable Task branch, inherited worktree path, lifecycle state, timestamps, and safe failure details. Execution context is derived as `Task → Thread → provider/session`, while the decider requires the Thread branch/path to equal the ready Task workspace. Existing Threads and pre-isolation Tasks remain valid.

A Task may persist an optional manual provider/model assignment before execution. This is assignment intent, not provider-session identity. It lets a draft hydrate truthfully without manufacturing a Thread. After Start creates and binds the canonical Thread, the Thread's model selection is authoritative for its provider execution.

This slice does not create ownership requests, shared-resource locks, Missions, routing, scheduling, automatic remediation, or integration behavior. Quality gates and the independent Reviewer are implemented as explicit user-driven Task review boundaries.

### Workspace isolation

Concurrent writable Builder Tasks use one Git worktree per Task. Start first persists preparation intent, then the Task workspace reactor validates a clean Git source checkout, records exact `HEAD`, derives `nebula/manual/<stable-task-id>-<slug>`, and delegates creation to the inherited Git workflow service with its canonical worktree location. The ready event is persisted before Thread creation. Read-only roles continue to use inherited shared-workspace behavior.

Startup reconciliation adopts a matching worktree left after a crash, fails an interrupted preparation whose baseline was never recorded, marks a ready record `missing` when its directory disappears, and resumes an interrupted explicit removal. Cleanup is terminal-only, never forced, refuses dirty worktrees, removes only the worktree, and preserves the Task branch.

> Git worktrees provide source-control isolation, not OS security sandboxing.

They do not prevent a subprocess from accessing other filesystem paths, credentials, network resources, or production systems. Provider permissions, RPC authorization, filesystem policy, and user approval remain separate concerns.

### Ownership enforcement

Writable Builder Tasks created after the ownership migration require explicit repository-relative ownership before workspace preparation or activation. Rules use write, read-only, and deny access, for example:

```yaml
owns:
  - src/features/onboarding/**

denies:
  - package.json
  - pnpm-lock.yaml
```

The pure ownership evaluator applies deterministic precedence: deny overrides write; write authorizes modification; read-only matches and unmatched paths are violations. `**` is supported only as an explicit entire-repository write choice. Patterns reject absolute paths, URI forms, NULs, empty segments, and repository traversal; matching remains case-sensitive and follows Git-style forward-slash paths.

The Task ownership reactor composes the inherited Git executor and compares the Task worktree's complete current state to its recorded immutable base. The comparison includes committed, staged, unstaged, added, modified, deleted, untracked, renamed, and copied paths; both rename paths are evaluated. Ignored files follow Git's existing exclusion semantics. The reactor runs after a Task Thread's checkpoint diff settles, on manual validation, after scope updates, and for active ready Tasks during startup reconciliation.

Rules, current validation state, violation evidence, and timestamps are persisted through Task events and the existing SQLite projection. Completion of an ownership-managed Task requires a current immutable review snapshot and ready handoff, then emits a fresh validation request. A valid result requests a final deterministic snapshot-freshness check before completion; a violation, inspection error, or stale snapshot leaves the Task active. Later explicit scope expansion makes any prior snapshot stale and can make current state valid without deleting earlier violation events.

This is an enforced progression and future integration boundary, not a filesystem sandbox. A provider or external editor can write an unauthorized path; Nebula detects the Git evidence and refuses completion. Filesystem, process, credential, network, provider-permission, and RPC security remain separate and take precedence over Task ownership. There is no atomic lock between validation and later external filesystem changes, so future integration must validate again.

### Task Diff, review handoff, and restore

`TaskChangeSetQuery` is the canonical Git evidence service shared by Task Diff, ownership, review capture, and freshness checks. It captures the complete current tree through the inherited checkpoint store, compares it with the Task's recorded base, preserves rename/copy/binary metadata and line statistics, and loads individual patches only when selected. Immutable review and pre-restore snapshots are hidden Git refs under a Task-scoped namespace.

`TaskReviewReactor` captures review snapshots, routes handoff drafting through the Thread's configured text-generation provider, falls back to an editable manual draft on generation failure, reconciles stale snapshots at startup, and services restore. Git-derived identity and statistics are non-editable facts; provider text is a claim until a human marks the handoff ready. Restore is provider-neutral: it refuses any Task branch present under remote refs, captures and durably records a safety snapshot before reset/clean, changes only the isolated Task workspace, retains provider conversation history, keeps the Task active, and preserves the recovery ref for Undo Restore.

### Command Deck composition

Command Deck is an implemented Project route in the existing web client and desktop shell. It reads the existing shell snapshot and provider registry, scopes canonical Tasks to the active Project, and issues the same typed Task and Thread commands as the project Task surface. It introduces no `CommandDeckTask`, workspace manager, provider runtime, event log, or database.

The Task rail and summary remain lightweight. Only the selected Task mounts the existing lazy Task Diff surface, and provider output remains in the selected canonical Thread rather than being copied into a second chat. Derived labels such as **Running**, **Ready for review**, and **Needs attention** combine existing Task lifecycle, Thread runtime, ownership, workspace, provider readiness, and handoff state without extending the canonical lifecycle enum.

Command Deck activity is a filtered presentation of durable projected milestones already attached to Tasks. It intentionally excludes token deltas and does not become a second orchestration history. Because Tasks, workspaces, ownership, review, restore, and Threads already hydrate from the orchestration projection, restarting the client or server reconstructs the Deck without Command Deck-specific recovery state.

### Quality gates and independent review

Project quality and review policies extend the existing Project projection. A gate definition persists its command and a separate exact approved command; editing the executable string revokes approval. The Task decider creates immutable `QualityGateRun` records tied to Task ID and review snapshot ID. `TaskQualityReactor` delegates process execution to the inherited `ProcessRunner`, fixes `cwd` to the Task worktree, bounds retained output, enforces timeouts and cancellation, and checks snapshot freshness both before and after each command. A mutation stales the run, snapshot, handoff, and applicable reviews and stops the remaining batch.

Independent reviews are durable rounds, not mutable status on the handoff. `TaskReviewReactor` loads a bounded base-to-snapshot patch, excludes protected credential paths, and calls the selected provider instance through shared `TextGeneration` from an empty disposable context directory. The autonomous reviewer receives neither the source checkout nor the Builder worktree as its working directory. Its prompt separates Nebula-verified evidence from Builder-reported claims and treats repository text as untrusted data. Strict schema decoding and decider invariants fail closed; blocking or security findings cannot persist with an approving verdict. Provider-driver metadata determines whether the completed round is cross-provider or same-provider.

Completion for an effective required-review Task adds current required gate success and a current `APPROVE` or `APPROVE_WITH_NOTES` round to the inherited ownership, snapshot, and handoff gates. Review findings are sent to the existing Builder Thread only after an explicit user command. There is no hidden agent conversation or automatic remediation loop.

The route is desktop-first: the rail and selected workspace form two columns at ordinary desktop widths, the inspector moves below them when needed, and wide displays use three columns. Mobile receives no separate orchestration implementation in this milestone.

### Shared resources

Shared resources such as `package.json`, lockfiles, database migrations, global configuration, schemas, and route registries should eventually be explicitly serialized. A lock is deterministic persisted state with acquisition, release, visibility, failure, and recovery semantics. Do not implement locking before Task identity and lifecycle are stable.

### Events and authoritative state

Nebula commands, events, and projections should extend the current engine. Accepted commands are decided and committed with their events and relational projections in one database transaction. The committed event log plus replayable projector define authoritative orchestration history; relational projections provide query models. Provider output and side effects enter through existing reactors and runtime ingestion. Test-only runtime receipts must never become product state.

### Integration

The future default strategy is:

```text
approved task commits
↓
dedicated integration branch
↓
cherry-pick in dependency order
↓
validation
```

Never integrate directly into target `main` by default. Integration must verify ownership and locks, preserve the task commit identity or an explicit mapping, record conflicts and validation, and produce a reversible outcome.

## Future

After the explicit Task, isolated workspace, and ownership lifecycle are proven, future modules may add:

- Mission composition and task dependencies;
- ownership prediction and agent-generated scope requests;
- shared-resource locks;
- structured handoffs;
- independent review and quality gates;
- an integration queue;
- provider aliases, scoring, Ichnos, capacity-aware routing, and fallback; and
- multi-machine or team synchronization through a separately designed replication boundary.

These remain policies over the same provider, workspace, event, persistence, RPC, and client runtime. They must not introduce a second swarm-only runtime.
