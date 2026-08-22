# ADR-003: Use local SQLite for Nebula state

## Status

Accepted

## Context

Nebula is local-first. Its coordination state must remain available with the desktop application, work without a hosted control plane, and build on the storage model already used by the inherited runtime.

## Decision

Nebula will persist local coordination state in the existing SQLite persistence layers and migrations. It will not introduce a hosted database or a second local store for mission, task, ownership, or handoff state during the initial architecture.

## Alternatives considered

- A Nebula cloud database as the primary source of truth.
- JSON files in each repository.
- A separate embedded database or key-value store.

## Consequences

Local operation, privacy, and recovery remain straightforward. Multi-machine collaboration will need an explicit synchronization design later rather than being implied by the initial state model.

## Migration impact

None for the foundation. New state is added through upstream-compatible SQLite migrations only when a concrete runtime model exists.

## Review conditions

Revisit if team synchronization, durable remote audit requirements, or data-volume constraints cannot be satisfied by a local-first model with explicit replication.
