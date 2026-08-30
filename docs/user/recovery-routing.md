# Recover and route supervised Missions

Nebula can recover a supervised Mission from a narrow set of failures while keeping the approved Mission and canonical Task intact. Recovery is bounded: it never grants ownership, changes resource policy, applies a replan, or rewrites a Mission without a human decision.

## Failure handling

Nebula classifies failures from runtime evidence before choosing an action. Transport and transient process failures may retry once by default. The original failed attempt remains immutable and the retry is a second attempt under the same Task.

Provider authentication failures, provider execution failures, ownership violations, resource violations, workspace failures, quality failures, review changes requested, rejected reviews, architecture or policy blockers, Integration conflicts, and an exhausted retry budget stop the Run for attention. Nebula does not automatically repeat reasoning work or silently substitute a provider. Quality and review remediation starts only after a deliberate human action.

Every retry, human-initiated remediation, and replacement attempt is retained in the Mission Run. A successful provider execution becomes terminal when it produces the current review-ready handoff; the later review verdict belongs to the Task review lifecycle and does not retroactively turn that execution into a provider failure. Sending requested review changes to the Builder starts a distinct remediation execution attempt under the same Task. Cancelling a Task finalizes any active attempt, and replacing a provider marks the previous attempt `replaced` before the new attempt becomes active. Restarting Nebula resumes reconciliation from that durable ledger rather than resetting a budget, so there is never more than one active execution attempt for a Task.

The Mission retry count includes only automatic transient retry attempts. Review remediation and provider replacement remain separate counters, even when they add execution attempts.

## Provider replacement and Task continuity

When the same provider has repeated non-transient Task-local failures, Nebula may recommend one currently ready alternative. A capability mismatch may produce the recommendation after the first grounded failure. The recommendation is evidence about this Task, not a global provider ranking, and requires **Replace Agent** approval. Nebula then starts the replacement provider execution Thread in the same Task worktree. The Task id, Mission membership, ownership rules, resources, workspace, completed history, current diff, handoff, and review findings do not change. Provider availability is shown honestly, and no replacement occurs silently. Authentication failure remains attention and is never treated as proof that another provider should take over.

Terminal Center shows the current execution Thread as the Task node and labels it with its attempt number. Earlier attempt Threads remain durable and can be added explicitly from **Add existing Thread**, but Nebula does not leave duplicate Task nodes open automatically.

Provider subprocesses are not assumed to survive a Nebula runtime restart. When an active replacement Thread is known to have died with the runtime, startup reconciliation marks that replacement attempt `interrupted` once and moves the Task to **Needs Attention**. The operator can then choose **Continue Task** when the provider supports it or **Replace Agent** to start a new attempt. Later reconciliation passes do not redispatch the interrupted replacement or create another attempt.

Two failed attempts from the same provider with the same normalized failure class and exact summary are labeled as a **Possible execution loop** in the substitution evidence. This is a bounded warning, not an automatic kill. Nebula does not infer a stall from elapsed silence alone because providers expose progress differently.

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

## Bounded Mission replanning

A replan request records a trigger, source Task, scope, reason, and grounded evidence. Eligible triggers include an invalidated assumption or dependency contract, newly required work, ownership expansion, an architectural blocker, repeated provider capability mismatch, an Integration semantic conflict, or a changed user requirement. A transient failure, failed gate, or review request-changes result remains ordinary recovery and does not become a replan.

Nebula computes the smallest deterministic impact set from the Mission DAG. A Task repair affects only its source; a split or subgraph change includes descendants; full-Mission scope is explicit. Unaffected Tasks keep their Task IDs, worktrees, attempts, results, and review history and may continue while the affected set waits. The proposal preview records preserved, affected, added, superseded, contract, ownership, resource, and dependency changes before any runtime mutation.

The Mission's Architect analyzes the request with bounded canonical context: objective, current Plan, trigger evidence, affected and preserved Tasks, dependencies, ownership, contracts, current handoffs and reviews, and current Integration state. Full terminal logs, source files, provider conversations, credentials, and unbounded history are not sent or persisted as Replan evidence. The generated proposal remains analysis until deterministic validation succeeds and a human separately approves and applies it.

The structured change set reruns graph, ownership-pattern, resource-reference, Task-reference, contract-reference, and affected-execution-intent validation. Adding a prerequisite is not sufficient when the affected Task still says to discover that prerequisite or request another replan. The Architect must refresh the affected objective and acceptance criteria, or replace started work and point the new dependency at the replacement. Invalid analysis stays visible with blockers and may be edited or rejected. A valid proposal moves to **Awaiting approval**. Approval still does not mutate the Mission: **Apply Plan** is a separate deliberate action.

Application is one atomic canonical event. It retains Plan v1, appends Plan v2, materializes any approved new canonical Tasks, updates dependencies, and records the full diff. Applying the same proposal again is rejected. Started or terminal Tasks cannot be modified in place; replace them with a new Task and retain the old objective and Task as **Superseded**. The replacement executes with its Plan-v2 objective and receives current completed-prerequisite handoffs, tests, interface changes, artifact identity, assumptions, reviews, and risks. Any prior handoff, review, or passed quality result intersecting changed scope is retained as historical and marked stale. Contract v1 is invalidated when contract v2 becomes current, and consumers are blocked until their evidence is refreshed.

Integration artifacts from superseded Tasks are never newly applied. If an artifact was already applied, the Batch becomes **Correction required** and keeps the exact affected Task visible for an explicit revert or remediation path. Replan count, dynamically created Task count, superseded Task count, and provider substitution count are reported separately.

Requested, proposed, approved, rejected, and applied states are persisted with the Run. Restart restores the exact pending proposal and Plan history; it does not approve, apply, duplicate Tasks, or reset the agent proposal limit. Rejection keeps the current Plan authoritative.

## Implementation status

| Capability                           | Status          |
| ------------------------------------ | --------------- |
| Bounded transient retry              | IMPLEMENTED     |
| Human-initiated remediation          | IMPLEMENTED     |
| Provider replacement                 | IMPLEMENTED     |
| Automatic routing policies           | IMPLEMENTED     |
| Structured provider requests         | IMPLEMENTED     |
| Bounded Plan versioning and apply    | IMPLEMENTED     |
| Contract/review/quality freshness    | IMPLEMENTED     |
| Provider substitution recommendation | IMPLEMENTED     |
| CapacityAdvisor seam                 | IMPLEMENTED     |
| Automatic ownership approval         | NOT IMPLEMENTED |
| Unbounded remediation                | NOT IMPLEMENTED |
| Unapproved Mission rewrite           | NOT IMPLEMENTED |
| Swarm Mode                           | IMPLEMENTED     |
