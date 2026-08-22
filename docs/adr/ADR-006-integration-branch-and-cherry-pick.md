# ADR-006: Integrate through review branches and explicit cherry-picks

## Status

Accepted

## Context

Concurrent agent work must be reviewable and reversible. Direct changes to `main` and implicit integration obscure which task introduced a change and make conflict recovery harder.

## Decision

Nebula will treat task branches and integration branches as explicit coordination artifacts. Proposed task changes will be reviewed before integration, and the integrator will use controlled merges or explicit cherry-picks into a dedicated integration branch before changes reach `main`.

## Alternatives considered

- Let every task push directly to `main`.
- Auto-merge task branches as soon as checks pass.
- Squash all concurrent work into one unreviewed batch.

## Consequences

The system gains a clear audit trail, smaller rollback units, and intentional conflict resolution. Integration has an explicit cost and requires a reviewer or integrator policy instead of pretending conflicts do not exist.

## Migration impact

None for the foundation. Initial contributors follow standard pull-request branches; later Nebula workflows may model integration proposals directly.

## Review conditions

Revisit when protected-branch automation can provide equivalent traceability, reversibility, and human review without reducing control.
