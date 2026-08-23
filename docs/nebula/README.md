# Nebula source of truth

## Architect Plan Proposal

Nebula can ask a selected provider for a bounded, strict-schema engineering plan against an exact clean Git baseline. The output remains a durable `ArchitectPlanProposal` until a human edits, assigns providers, and explicitly approves it. Approval atomically emits canonical draft Mission/Task/ownership/dependency state and no execution state. See [Architect plans](../user/architect-plans.md).

This directory is the durable product and architecture source of truth for Nebula, the Kaizora Labs multi-agent development orchestration platform built on T3 Code.

## Document map

| Document                                    | Purpose                                                                                      |
| ------------------------------------------- | -------------------------------------------------------------------------------------------- |
| [PRD](PRD.md)                               | Product identity, boundaries, principles, and release sequence.                              |
| [Project contract](PROJECT_CONTRACT.md)     | Non-negotiable engineering rules for future Nebula work.                                     |
| [Architecture](ARCHITECTURE.md)             | Inherited runtime, target coordination architecture, and future concepts.                    |
| [Swarm model](SWARM_MODEL.md)               | Philosophy and constraints for later multi-agent execution.                                  |
| [Runtime map](RUNTIME_MAP.md)               | Evidence-based map of the inherited T3 Code repository.                                      |
| [Extension contract](EXTENSION_CONTRACT.md) | Canonical attachment points, divergence budget, ADR review, and first module recommendation. |
| [Design system](DESIGN_SYSTEM.md)           | Canonical visual identity, palette, theme behavior, accessibility, and asset status.         |
| [Providers](PROVIDERS.md)                   | Implemented provider transports, authentication boundaries, and current limitations.         |
| [Changelog](CHANGELOG.md)                   | Shipped and unreleased Nebula product behavior changes.                                      |
| [ADRs](../adr/)                             | Accepted architecture decisions.                                                             |
| [Upstream tracking](../../UPSTREAM.md)      | Fork baseline, attribution, sync strategy, and known divergence.                             |

Nebula product docs describe what the product is and where it is going. Architecture docs distinguish inherited behavior from target behavior. The runtime map records what the current code actually does. The extension contract determines where Nebula may attach without creating competing systems.

The current implemented safety boundary combines one Git worktree per writable Builder Task with durable repository-relative write, read-only, and deny ownership rules. Nebula validates the Task's complete change set from its recorded base commit, including untracked files and both sides of renames, and blocks completion while violations or validation errors remain.

Task Diff, immutable review snapshots, structured handoffs, and safe Task restore are implemented on that same boundary. A managed Task exposes its net Git delta from its immutable base, captures a hidden-ref snapshot after fresh ownership validation, and requires a human-reviewed ready handoff plus a second ownership and freshness check before completion. Restore affects only the isolated unpublished Task branch/worktree, first captures a retained recovery ref, leaves provider conversation history intact, and supports explicit undo.

Command Deck is the implemented desktop-first manual orchestration surface over those canonical primitives. From one Project, a user can create provider-assigned draft Tasks with optional acceptance criteria, declare ownership, start several isolated Tasks, monitor provider and review state, open each existing Thread, inspect changes and handoffs, and restore one Task without creating a second Task, provider, Git, event, or persistence system.

Terminal Center is the implemented freeform complement to Command Deck. It creates and reuses canonical provider Threads, optionally composes the existing isolated Task workspace flow, and presents those sessions on a persisted UI-only spatial canvas. It introduces no provider, terminal, Task, Git, event, or database runtime. Removing a canvas node only changes local visibility.

Quality Gates, independent Reviewer, the deterministic Integration Engine, Shared Resources, Architect proposals, Missions, and Supervised Mission Runs are implemented. A human approves and activates an Architect Mission, then separately authorizes a supervised Run. Nebula deterministically advances canonical Tasks under dependency, resource, provider, ownership, and concurrency policy while stopping affected branches for human attention. Completed Mission results can seed an existing Integration Batch in suggested topological order, which the user reviews and confirms. Nebula does not rewrite plans, reroute providers, remediate failures, merge main, or open a PR automatically. Swarm Mode is not implemented.

Antigravity CLI is the implemented Google first-party provider for individual Google accounts. Nebula invokes its official headless CLI, keeps authentication provider-owned, and binds each run to the canonical Task worktree. The preserved Gemini CLI prototype remains experimental and blocked for the individual-account authentication path; it is not a mainline provider.

## Source hierarchy

When sources disagree, use this order:

1. Current repository behavior.
2. Current Nebula source-of-truth docs in this directory.
3. Accepted ADRs in `docs/adr/`.
4. `UPSTREAM.md`.
5. Historical plans and older discussion.

When a document conflicts with current verified repository reality, call out the conflict rather than silently forcing old architecture onto the current codebase.

The code is authoritative for current behavior. These documents are authoritative for accepted Nebula intent only where they do not misdescribe that behavior.

## Capability status

| Capability                            | Status          |
| ------------------------------------- | --------------- |
| Task                                  | Implemented     |
| Worktree isolation                    | Implemented     |
| Ownership                             | Implemented     |
| Structured handoff                    | Implemented     |
| Quality gates                         | Implemented     |
| Reviewer                              | Implemented     |
| Command Deck                          | Implemented     |
| Terminal Center                       | Implemented     |
| Agent Canvas                          | Implemented     |
| Quick provider launch                 | Implemented     |
| Automatic canvas layouts              | Implemented     |
| Freeform spatial layout               | Implemented     |
| Integration Engine                    | Implemented     |
| Mission                               | Implemented     |
| Explicit Task DAG                     | Implemented     |
| Execution Waves                       | Implemented     |
| Human-controlled wave start           | Implemented     |
| Automatic Task planning               | Not implemented |
| Supervised Mission scheduler          | Implemented     |
| Automatic wave advancement            | Implemented     |
| Dependency context injection          | Implemented     |
| Automatic provider routing            | Not implemented |
| Shared Resource definitions           | Implemented     |
| Exclusive Task resource leases        | Implemented     |
| Mission resource blocking             | Implemented     |
| Resource compliance validation        | Implemented     |
| Human-approved ownership requests     | Implemented     |
| Provider-generated ownership requests | Not implemented |
| Architect                             | Implemented     |
| Swarm Mode                            | Not implemented |

Shared Resources are Project-defined logical resources whose repository-relative patterns may be
edited by only one active Task at a time. They complement worktree isolation and path ownership; they
do not replace either system. See [Shared Resources](../user/shared-resources.md).

## Change discipline

- Inspect the current upstream abstraction before proposing a Nebula abstraction.
- Label statements as inherited, target, or future; do not present roadmap behavior as shipped.
- Add or amend an ADR when a decision changes a durable boundary.
- Update the runtime map when an upstream sync materially changes an attachment point.
- Update `UPSTREAM.md` when the tracked baseline, sync state, attribution, or known divergence changes.
