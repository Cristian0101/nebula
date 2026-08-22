# ADR-001: Use Git worktrees for concurrent writable tasks

## Status

Accepted

## Context

Nebula will coordinate multiple agents that may make changes concurrently. Shared working directories create avoidable collisions, ambiguous diffs, and difficult recovery when tasks overlap.

## Decision

Each concurrent writable Nebula task will receive an isolated Git worktree based on a declared branch and baseline. Read-only analysis may share the primary checkout, but write access will be isolated by default.

## Alternatives considered

- Let all agents edit a shared checkout.
- Copy the repository into unmanaged temporary folders.
- Serialize all work so only one task can write at a time.

## Consequences

Tasks gain independent status, diffs, checkpoints, and cleanup boundaries. Nebula must manage worktree lifecycle, branch names, storage use, and explicit ownership for files that remain shared conceptually.

## Migration impact

None for the foundation. A later Nebula module will build policy on T3 Code's existing VCS drivers and worktree RPCs.

## Review conditions

Revisit if upstream's worktree primitives cannot represent isolated task lifecycle safely, or if a provider requires a more restrictive workspace boundary.
