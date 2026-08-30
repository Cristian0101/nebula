# ADR-010: Apply Mission replans as versioned atomic events

## Status

Accepted

## Context

A supervised Mission can discover that an approved decomposition is no longer valid after execution begins. Treating that discovery as an ordinary retry repeats the wrong work, while allowing a provider to rewrite the live graph would erase human approval, invalidate evidence silently, and make restart recovery ambiguous.

## Decision

Nebula separates replanning into durable request, analysis, proposal, approval, and application states. Requests require a typed trigger and grounded evidence. The existing Architect runtime receives bounded canonical context and produces a structured change set describing new, modified, superseded, dependency, ownership, resource, provider, and contract changes. The runtime independently computes the smallest affected DAG set and validates the Architect output before approval. A proposal that adds a new prerequisite to an affected Task must also refresh that Task's objective and acceptance criteria or replace it. Started or terminal Tasks use replacement so the prior specification remains immutable history. Provider output never mutates canonical Tasks directly.

Approval never mutates the Mission. A separate apply command emits one atomic event containing the next Mission Plan, updated Run ledger, canonical Tasks, and affected Integration Batch. Each Plan version retains a bounded Task specification snapshot, so Plan v1 remains reconstructable after an in-place Plan-v2 objective update. Plan v2 becomes current. Unaffected canonical Tasks retain identity and evidence. Superseded work remains visible but cannot schedule or integrate. A replacement dependent receives the current prerequisite handoff, canonical tests, artifact identity, assumptions, review, and reconciled risk projection in its bounded execution context. Changed contract, handoff, review, and quality evidence becomes stale rather than disappearing.

Provider substitution remains a separate Task-local recovery decision. It preserves Task and worktree identity and has its own metric.

## Alternatives considered

- Mutate the active Mission graph directly from provider output.
- Cancel and recreate the whole Mission after any invalid assumption.
- Encode replanning as repeated Task retries or provider replacement.
- Persist each graph mutation as a separate event and tolerate intermediate states.

## Consequences

Replans are explainable, bounded, human-gated, restart-safe, and idempotent. The atomic payload is larger than a narrow edge event, but it prevents partial application across Mission, Run, Task, and Integration projections. Historical evidence remains available and cannot accidentally qualify changed scope.

## Review conditions

Revisit if Plan payload size becomes material at observed Mission scale, or if a future collaborative approval model needs conflict resolution between concurrent proposed Plan versions.
