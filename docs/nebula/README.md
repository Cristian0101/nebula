# Nebula source of truth

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

## Change discipline

- Inspect the current upstream abstraction before proposing a Nebula abstraction.
- Label statements as inherited, target, or future; do not present roadmap behavior as shipped.
- Add or amend an ADR when a decision changes a durable boundary.
- Update the runtime map when an upstream sync materially changes an attachment point.
- Update `UPSTREAM.md` when the tracked baseline, sync state, attribution, or known divergence changes.
