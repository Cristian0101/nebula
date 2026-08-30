# Nebula architecture

## Architect proposal boundary

`architect.plan.generate` persists a generating project-scoped proposal. `ArchitectPlanReactor` builds a deterministic protected context package and calls provider-neutral structured `TextGeneration`; Codex and Antigravity implement the shared operation. The result returns through `architect.plan.save` and the normal event/projection pipeline. `architect.plan.approve` revalidates and atomically decides canonical `mission.create`, `task.create`, `task.ownership.set`, membership, and dependency commands before recording the proposal link. Mission `baseCommit` is optional for compatibility; Architect materialization sets it, and Task workspace preparation resolves that immutable commit instead of current HEAD.

Every human Plan edit appends a validated revision with a version, source, timestamp, and reason. A deterministic revision diff is presentation data derived from two persisted versions. Approval materializes only the current proposal; previous versions never contribute Tasks to the Mission.

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
| Mission         | Durable objective and human-controlled coordination boundary.  | Existing orchestration events and normalized projections.     |
| MissionRun      | Durable authorization and state for supervised plan execution. | Existing commands, events, projections, reactors, and Tasks.  |
| TaskDependency  | Explicit acyclic prerequisite edge and derived readiness rule. | Pure shared graph engine plus Mission relation projection.    |

Do not create one class or package for every noun. The first implementation should add only the types and state transitions needed for an explicit Task.

### Implemented Task vertical slice

Nebula now implements Task identity and lifecycle through the inherited orchestration engine. A Task has a stable branded ID, Project, title, objective, role, lifecycle status, optional primary Thread, and lifecycle timestamps. The implemented transitions are `draft → active → completed`, `draft → cancelled`, and `active → cancelled`; terminal Tasks cannot be reopened.

Task commands produce persisted Task events. The in-memory projector and `projection_tasks` relational projector apply those events inside the inherited SQLite transaction and replay model. Task rows are included in the existing shell snapshot/subscription and shared client cache. The project Task UI composes canonical Thread creation and provider turn dispatch instead of duplicating either runtime.

Task does not persist provider-session identity or trust a renderer-supplied workspace path. New Builder Tasks persist a server-resolved source repository, exact base commit, stable Task branch, inherited worktree path, lifecycle state, timestamps, and safe failure details. Execution context is derived as `Task → Thread → provider/session`, while the decider requires the Thread branch/path to equal the ready Task workspace. Existing Threads and pre-isolation Tasks remain valid.

A Task may persist an optional manual provider/model assignment before execution. This is assignment intent, not provider-session identity. It lets a draft hydrate truthfully without manufacturing a Thread. After Start creates and binds the canonical Thread, the Thread's model selection is authoritative for its provider execution.

This slice does not create provider routing or automatic remediation. Quality gates, independent Reviewer, deterministic manual Integration Batches, Shared Resources, human-authored Mission DAGs, Architect proposals, and explicitly authorized Supervised Mission Runs are implemented over the same runtime.

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

### Terminal Center composition

Terminal Center is a Project route in the existing web client and desktop shell. Provider buttons are derived from the existing configured provider-instance snapshot. Launch creates the same canonical Thread used by chat; isolated launch first composes the existing Task ownership and worktree preparation commands, then binds that Thread without starting a provider turn.

Mission and Command Deck links may carry a canonical Task ID into Terminal Center. The route uses that ID only to select the existing Task execution context, reveal its canonical inspector, and focus a previously attached Task pane. It does not persist a second Mission workspace or duplicate Task runtime state.

Architect plan materialization is limited to writable execution roles (`builder`, `debugger`, and `test_specialist`). Reviewer and security-reviewer capacity is applied through Mission review policy after a Task handoff. Integrator Tasks are synthesized only from a concrete Integration conflict. The validator rejects speculative reviewer or integrator Tasks so approval cannot fail later while coercing them into builder-owned worktrees.

Canvas visibility, positions, layout, viewport, selection, and quick-launch defaults are client-local UI preferences. They never enter Task, Mission, Thread, or provider projections. The focused node mounts the existing Thread workspace, while unselected nodes render shell summaries only. Mission Flow reads the existing Mission DAG waves, and no edge is rendered without a canonical dependency.

### Quality gates and independent review

Project quality and review policies extend the existing Project projection. A gate definition persists its command and a separate exact approved command; editing the executable string revokes approval. The Task decider creates immutable `QualityGateRun` records tied to Task ID and review snapshot ID. `TaskQualityReactor` delegates process execution to the inherited `ProcessRunner`, fixes `cwd` to the Task worktree, bounds retained output, enforces timeouts and cancellation, and checks snapshot freshness both before and after each command. A mutation stales the run, snapshot, handoff, and applicable reviews and stops the remaining batch.

Independent reviews are durable rounds, not mutable status on the handoff. `TaskReviewReactor` loads a bounded base-to-snapshot patch, excludes protected credential paths, and calls the selected provider instance through shared `TextGeneration` from an empty disposable context directory. The autonomous reviewer receives neither the source checkout nor the Builder worktree as its working directory. Its prompt separates Nebula-verified evidence from Builder-reported claims and treats repository text as untrusted data. Strict schema decoding and decider invariants fail closed; blocking or security findings cannot persist with an approving verdict. Provider-driver metadata determines whether the completed round is cross-provider or same-provider.

Completion for an effective required-review Task adds current required gate success and a current `APPROVE` or `APPROVE_WITH_NOTES` round to the inherited ownership, snapshot, and handoff gates. Review findings are sent to the existing Builder Thread only after an explicit user command. There is no hidden agent conversation or automatic remediation loop.

The route is desktop-first: the rail and selected workspace form two columns at ordinary desktop widths, the inspector moves below them when needed, and wide displays use three columns. Mobile receives no separate orchestration implementation in this milestone.

### Shared resources

Shared resources such as `package.json`, lockfiles, database migrations, global configuration, schemas, and route registries are explicitly serialized. A lock is deterministic persisted state with acquisition, release, visibility, failure, and restart-recovery semantics. Runtime reconciliation preserves a held lease only for a legitimate active Task and releases terminal or missing-owner leases before deterministic scheduling resumes.

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

The implemented Integration Engine consumes immutable completed `TaskResult` records, never live Task worktrees. Every selected result must still reference its retained approved snapshot and ready handoff, satisfy required quality and review policy, and share one exact base commit. Overlapping result paths require human acknowledgement but do not predict a Git conflict.

For each selected Task, Nebula resolves the approved hidden checkpoint tree and creates a deterministic, retained artifact commit with the common base as its parent. Commit metadata records Task, Task Result, and snapshot identity. Creation uses the inherited Git executor and does not check the artifact into any source or Task worktree.

An Integration Batch owns a dedicated `nebula/integration/*` branch and worktree. Artifacts apply sequentially in the user's stored order. Each applied step is projected durably. A real cherry-pick conflict pauses the Batch, records unresolved files and applied/remaining Tasks, and preserves the worktree for manual resolution. Continue accepts only a resolved and staged Git index, creates a transparent human-resolution commit, and resumes the remaining artifacts. Abort stops only the active Batch operation.

After application, Nebula captures the Integration HEAD/tree and runs only enabled exact approved Project gates in that worktree through the inherited bounded process runner. Any gate mutation of HEAD, tree, or worktree makes validation stale and fails closed. Required failures prevent Ready. No configured gates is recorded as no gates, never an invented pass. Ready is a reviewable branch state; main merge, push, and PR creation remain separate human actions.

### Missions and dependency execution

Mission commands and events use the inherited decider, event store, projection pipeline, typed shell stream, and client command runtime. Normalized SQLite relations persist Mission identity, ordered Task membership, dependency edges, and activity. A unique Task membership constraint implements the conservative zero-or-one-Mission rule.

`packages/shared/src/missionGraph.ts` is the pure provider-neutral graph engine. It validates membership and cycles, computes deterministic topological waves using human presentation order as the tie-breaker, and derives each Task's blockers, start-configuration attention, and readiness from canonical Task, Thread, workspace, and provider facts. The server applies the same readiness rule to Task workspace preparation and activation, so clients cannot bypass the DAG.

Mission activation remains explicit. Manual Task starts remain available. An approved, materialized active Mission may separately start a durable supervised Run. `MissionRunReactor` reconciles only from canonical projections and dispatches the existing workspace, Thread, activation, provider-turn, review, quality, and completion commands. It chooses eligible Tasks by wave, Mission order, and stable Task ID, while enforcing the configured writable concurrency cap and durable Shared Resource leases. Stable Run/Task command and Thread IDs make startup reconciliation idempotent.

The Run injects a bounded prerequisite context package with explicit Nebula provenance before a dependent Builder turn. After that turn settles, it advances the existing fresh ownership/resource, review snapshot, structured handoff, quality gate, independent Reviewer, and Task completion pipeline. Task-scoped failures block that dependency subgraph while unrelated Tasks may continue. Missing Mission/Project/Task integrity fails the Run closed. Pause prevents new starts without killing active turns; resume recomputes canonical readiness; stop removes only automatic scheduling authority.

Operational recovery follows **UI displays, runtime decides, persistence recovers**. The Mission Command Center derives discrete progress, attention links, Task attempt history, review coverage, resource queues, Integration state, and searchable timeline rows from canonical projections. It does not persist renderer-only Task states or a second Mission event log. A provider execution attempt is finalized successfully once the current handoff is review-ready. Review `request_changes` remains a Task recovery trigger and immutable review verdict, not an execution failure; a human-sent findings turn creates a separate remediation attempt. Real provider, transport, authentication, interruption, and cancellation outcomes retain their existing terminal attempt states. An active replacement whose subprocess died at restart is marked interrupted exactly once and becomes explicit attention instead of being invisibly redispatched. Automatic recovery is limited to one transient transport retry. Provider authentication, provider execution, quality, review, ownership, resource, workspace, Integration, and policy failures require attention; provider replacement and remediation are deliberate user actions.

Recovery presentation is event-driven. A persisted Mission opening normally has no recovery banner. An actionable startup reconciliation records a durable `recovery` Run decision and terminal attempt evidence; the UI may dismiss that summary without deleting the underlying history. Integration recovery uses the existing Batch item artifact/applied commits and Integration branch HEAD: applied items are skipped, the first pending item remains next, and conflicts stay blocked.

Ordinary graph edits after activation still require explicit human confirmation and cannot remove started work or prerequisites involving started work. Replanning uses a narrower transaction: request and deterministic impact analysis; structured proposal and validation; explicit approval; then explicit apply. The proposal cannot mutate runtime state. Apply emits one `mission.replan-applied` event containing the next Mission Plan, Run ledger, canonical Task set, and affected Integration Batch so projection cannot expose a half-applied graph. Previous Plan versions remain immutable history. Unaffected Task objects are retained; superseded Tasks remain historical and unschedulable; changed contract consumers lose current handoff/review/quality freshness. Scheduler admission blocks only the affected pending subgraph before approval, and all normal dependency, ownership, resource, provider, and freshness checks rerun after apply.

Provider substitution is a separate Task-local recovery transition. Repeated same-provider non-transient failures may produce a ready-alternative recommendation, but only explicit approval creates a replacement attempt. The Task and worktree remain canonical, failed attempts remain visible, and replacement metrics never increment Replan metrics.

When the frozen policy authorizes automatic Integration and Mission completion, the runner completes the Mission only after every current non-superseded Task, current review, required Task gate, a Ready Integration snapshot, and required final gate passes. It then persists the completed Run and factual final report, including Plan version, Replan scope counts, dynamic and superseded Task counts, attempts, the automatic transient retry count, provider substitution and remediation counts, review history, final gate results, base and Integration SHAs, and deliberately resolved human interventions. Historical Task risks remain in Task evidence. Final risk reconciliation subtracts exact historical risk strings named by `Nebula-Resolved-Risk` trailers on captured Integration remediation commits. It also recognizes only two canonical replacement-evidence cases after all current reviews and required final gates pass: a missing-artifact warning whose exact path or artifact name is present in the integrated file set, and the exact missing Builder-evidence note. Final gates never resolve arbitrary warnings by inference. New reports persist historical, resolved, and remaining sets, while legacy reports remain decodable without rewriting their events. Projecting the durable event stream is the only Mission History reconstruction path. Otherwise the Run and Mission remain separately labeled.

Mission-linked Integration extends the Prompt-9 Batch with an optional `missionId`. A topological Task order is a UI suggestion only; the human confirms or changes the actual Integration order. Standalone historical Batches remain valid.

## Future

After the explicit Task, isolated workspace, and ownership lifecycle are proven, future modules may add:

- automatic remediation and bounded retry policy;
- ownership prediction and agent-generated scope requests;
- automatic integration queues;
- provider aliases, scoring, Ichnos, capacity-aware routing, and fallback; and
- multi-machine or team synchronization through a separately designed replication boundary.

These remain policies over the same provider, workspace, event, persistence, RPC, and client runtime. They must not introduce a second swarm-only runtime.

## Shared-resource boundary

Shared Resource definitions and immutable lease history live in the existing Project event stream and
SQLite projection. Task requirements, compliance evidence, and ownership-request history live in the
existing Task projection. The serialized orchestration command queue decides all-or-nothing lease
acquisition server-side; clients display blockers but are not lock authorities.

Worktrees isolate files, ownership authorizes paths, and leases coordinate concurrent intent. Mission
DAG readiness remains separate from resource readiness. The existing Git change-set collector feeds
both ownership and resource compliance, and review/completion require both results to be valid.
