# ADR-005: Fork T3 Code instead of building an execution harness

## Status

Accepted

## Context

Nebula needs reliable agent execution before it can differentiate through coordination. T3 Code already supplies terminal and process management, provider adapters, Git and VCS operations, checkpoints, diff and revert support, and desktop, web, and mobile client shells.

## Decision

Nebula will develop as an upstream-aware public fork of T3 Code. It will preserve history and reuse the inherited harness while concentrating new work on orchestration, task isolation, ownership, handoffs, review, and integration policy.

Fork the boring parts. Build the interesting parts.

## Alternatives considered

- Build a new provider, terminal, Git, persistence, and desktop stack from scratch.
- Compose multiple unrelated agent CLIs with a thin wrapper.
- Add Nebula as a plugin that cannot control its execution boundary.

## Consequences

Nebula reaches a working baseline sooner and inherits upstream maintenance. It also assumes an ongoing responsibility to attribute upstream, preserve compatibility where practical, and review upstream syncs deliberately.

## Migration impact

The foundation begins at upstream commit `592c5983c14d248aa3cfddb8e6c7372f12cd1ab6`. The full sync policy is maintained in `UPSTREAM.md`.

## Review conditions

Revisit if upstream architecture prevents safe extension, licensing changes materially, or a measured replacement of a specific harness boundary has a clear lifecycle and migration plan.
