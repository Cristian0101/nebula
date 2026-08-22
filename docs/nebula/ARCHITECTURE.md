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

### Workspace isolation

Future concurrent writable tasks should use one Git worktree per writable task. The worktree must be tied to a stable task ID, declared branch, base revision, effective path, and cleanup state. Read-only analysis can reuse a checkout when no write capability is granted.

> Git worktrees provide source-control isolation, not OS security sandboxing.

They do not prevent a subprocess from accessing other filesystem paths, credentials, network resources, or production systems. Provider permissions, RPC authorization, filesystem policy, and user approval remain separate concerns.

### Ownership

Tasks should support mechanically validated path ownership, for example:

```yaml
owns:
  - src/features/onboarding/**

denies:
  - package.json
  - pnpm-lock.yaml
```

The runtime must compare actual changed paths against the effective rules before approval or integration. Prompts may explain ownership to a model, but prompts are not enforcement.

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

After the explicit Task and isolated workspace lifecycle are proven, future modules may add:

- Mission composition and task dependencies;
- ownership prediction and enforcement;
- shared-resource locks;
- structured handoffs;
- independent review and quality gates;
- an integration queue;
- provider aliases, scoring, Ichnos, capacity-aware routing, and fallback; and
- multi-machine or team synchronization through a separately designed replication boundary.

These remain policies over the same provider, workspace, event, persistence, RPC, and client runtime. They must not introduce a second swarm-only runtime.
