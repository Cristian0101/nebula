# Recover and route supervised Missions

Nebula can recover a supervised Mission from a narrow set of failures while keeping the approved Mission and canonical Task intact. Recovery is bounded: it never grants ownership, changes resource policy, applies a replan, or rewrites a Mission without a human decision.

## Failure handling

Nebula classifies failures from runtime evidence before choosing an action. Transport and transient process failures may retry once by default. The original failed attempt remains immutable and the retry is a second attempt under the same Task.

Provider authentication failures, provider execution failures, ownership violations, resource violations, workspace failures, quality failures, review changes requested, rejected reviews, architecture or policy blockers, Integration conflicts, and an exhausted retry budget stop the Run for attention. Nebula does not automatically repeat reasoning work or silently substitute a provider. Quality and review remediation starts only after a deliberate human action.

Every retry, human-initiated remediation, and replacement attempt is retained in the Mission Run. Restarting Nebula resumes reconciliation from that durable ledger rather than resetting a budget.

## Provider replacement and Task continuity

When a provider is no longer usable, the Mission operator may replace it from the canonical Task inspector. Nebula starts the replacement provider execution Thread in the same Task worktree. The Task id, Mission membership, ownership rules, resources, workspace, completed history, current diff, handoff, and review findings do not change. Provider availability is shown honestly, and no replacement occurs silently.

Terminal Center shows the current execution Thread as the Task node and labels it with its attempt number. Earlier attempt Threads remain durable and can be added explicitly from **Add existing Thread**, but Nebula does not leave duplicate Task nodes open automatically.

Replacement context contains the Task and Mission objective, current changed-file evidence when snapshotted, latest handoff, gate and review findings, and a previous-provider summary. It does not reconstruct or transfer hidden reasoning.

## Routing profiles

Choose a routing profile before starting a supervised Run:

- **Manual Only** keeps every provider assignment manual.
- **Balanced** uses ready providers and current active load while preserving review capacity when known.
- **Maximum Quality** may use historical local Task outcomes when they actually exist; otherwise it falls back to ready-provider and load evidence.
- **Maximum Speed** favors the ready provider with the lowest current active load.
- **Preserve Capacity** favors the ready provider with the lowest current active load.
- **Provider Diversity** prefers a different provider driver when a diversity constraint is supplied.

Each automatic selection records the chosen provider, considered providers, profile, load, and only the reasons actually used. Nebula does not invent capability scores or provider quotas.

The provider-neutral `CapacityAdvisor` boundary defaults to the local Nebula policy. A future advisor such as Ichnos can implement the boundary, but it is optional: an absent or failing advisor falls back to local routing. This release does not claim an Ichnos integration.

## Provider coordination requests

A provider can return one structured proposal with one of these kinds:

- `ownership_request`
- `resource_request`
- `contract_question`
- `dependency_question`
- `blocker`
- `replan_request`

These are requests, not policy changes. Ownership requests appear in the existing Task ownership workflow. Resource requirements change only after approval and leases still follow normal Task start rules. Contract and dependency questions are answered automatically only when a completed prerequisite handoff contains deterministic interface evidence; otherwise they wait for a human answer.

## Replan proposals

A replan request creates a proposal, never an automatic graph edit. Nebula keeps the scope as small as possible: Task repair, then Task split or replacement, then the affected Mission subgraph, and only then a full Mission replan.

The proposal records affected Tasks and completed Tasks that must be preserved. Approval marks the proposal ready for the existing Architect planning and Mission-amendment workflow; it does not itself delete Tasks, mutate approved TaskResults, rewrite integration history, or silently change ownership and resources.

## Implementation status

| Capability                      | Status          |
| ------------------------------- | --------------- |
| Bounded transient retry         | IMPLEMENTED     |
| Human-initiated remediation     | IMPLEMENTED     |
| Provider replacement            | IMPLEMENTED     |
| Automatic routing policies      | IMPLEMENTED     |
| Structured provider requests    | IMPLEMENTED     |
| Human-approved replan proposals | IMPLEMENTED     |
| CapacityAdvisor seam            | IMPLEMENTED     |
| Automatic ownership approval    | NOT IMPLEMENTED |
| Unbounded remediation           | NOT IMPLEMENTED |
| Unapproved Mission rewrite      | NOT IMPLEMENTED |
| Swarm Mode                      | IMPLEMENTED     |
