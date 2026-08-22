# ADR-008: Use structured handoff contracts between tasks

## Status

Implemented

## Context

Prompt-only coordination loses important details: task intent, ownership, changed files, validation, unresolved risks, and the baseline another agent should trust. Nebula needs handoffs that can be reviewed and persisted.

## Decision

Nebula will define a provider-neutral, structured handoff contract for every writable task. At minimum it will identify the mission and task, worktree and branch, ownership claim, base and result revisions, changed paths, validation evidence, review state, and unresolved risks or blockers.

## Alternatives considered

- Free-form chat summaries only.
- Infer handoffs solely from Git diffs.
- Require a central human to manually reconstruct all context.

## Consequences

Tasks become easier to review, resume, integrate, and audit. The contract must remain concise enough that it improves execution rather than becoming clerical overhead.

## Migration impact

Migration 044 adds nullable JSON projection columns for immutable review snapshot, handoff, and restore state. Legacy Tasks decode with all three fields absent.

## Review conditions

Revisit when user research shows fields are routinely unused, a critical integration failure exposes missing context, or upstream contracts provide an equivalent general-purpose mechanism.
