# ADR-004: Extend the existing event log and relational projections

## Status

Accepted

## Context

Agent coordination requires inspectable state transitions and useful query models. T3 Code already records orchestration events and maintains relational projections, receipts, and subscriptions.

## Decision

Nebula will extend T3 Code's existing persisted event and relational projection architecture where practical rather than introducing a parallel event bus, database, or state machine. Mission, task, ownership, handoff, review, and integration policies will use the existing command, event, projector, and migration patterns.

## Alternatives considered

- An in-memory Nebula coordinator with prompt-only handoffs.
- A separate message broker and event stream.
- Directly mutate task tables without durable events.

## Consequences

State remains traceable, recoverable, and observable through one architecture. Nebula contributors must preserve event versioning and projection correctness as its coordination model evolves.

## Migration impact

None for the foundation. Future additions require compatible events, projections, migrations, and replay or upgrade considerations.

## Review conditions

Revisit if upstream event semantics cannot express a required coordination invariant without unsafe coupling or excessive complexity.
