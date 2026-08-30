# Run an approved Mission under supervision

For bounded retry, remediation, provider replacement, routing profiles, structured requests, and human-gated replanning, see [Recover and route supervised Missions](recovery-routing.md).

A Supervised Mission Run executes an already approved and activated Architect Mission. It may record an evidence-grounded Replan Request, but it cannot approve or apply that request. Only a separately approved and validated bounded Replan may append a new Plan version, change ownership or dependencies, or materialize new canonical Tasks. The Run never approves ownership requests, resolves conflicts, or merges `main`. In **Supervised Swarm**, it may choose a provider under the frozen routing profile and may start the existing Integration Engine when the launch policy explicitly enables Automatic Integration.

## Start a Run

Open **Command Deck → Missions** and select an active Mission created from an approved Architect plan. Choose **Supervised Swarm**, set **Max active**, choose a routing profile, and select **Run as Swarm**. Review the confirmation and choose **Run Swarm**. The default concurrency is 2.

The confirmation explains the authorization boundary: Nebula may automatically start Tasks when dependencies, Shared Resources, provider readiness, ownership, and the concurrency limit allow. It stops the affected branch when a deterministic safety gate needs human judgment.

Manual Missions and draft Missions cannot start a Supervised Run. Activate an approved, materialized Mission with a valid non-empty DAG first.

## Deterministic scheduling

Nebula derives candidates from canonical Mission and Task state every time it reconciles. It does not use provider completion timing as ordering input. When more than one Task is eligible, the stable order is:

1. Mission wave.
2. Mission Task order.
3. Stable Task ID.

A Task starts only when it is draft, every prerequisite is completed, its Builder provider assignment is ready, write ownership is configured, every required Shared Resource exists and is available, and a writable concurrency slot is free. Starting uses the existing workspace, Thread binding, Task activation, resource lease, and provider-turn commands. Stable command and Thread IDs prevent duplicate dispatch after a restart.

The durable decision log explains scheduled and waiting Tasks, including dependency, resource-holder, provider, and concurrency evidence.

## Dependency context

Before a dependent Builder turn starts, Nebula creates a bounded **Task Context Package** from durable completed-prerequisite evidence. It includes Mission and Task objectives, acceptance criteria, structured handoffs, interface changes, risks, changed-file paths, review summaries, assumptions, and relevant resource state.

The Task Thread records **Mission context injected by Nebula** and references its source Tasks. The package is explicitly system-composed, not user-authored. It excludes hidden reasoning, provider transcripts, credentials, and unbounded diffs.

## Automatic completion pipeline

After a Builder turn settles, the Run advances through the existing server-side Task pipeline:

1. Fresh ownership and Shared Resource compliance.
2. Review snapshot and structured handoff generation.
3. Configured required quality gates.
4. Configured independent review using the current Project review policy.
5. Canonical Task completion.

Completion unlocks later Mission waves without another Start click. With Automatic Integration disabled, the Run completes when every Mission Task is complete. With it enabled, the Run completes only after the linked Integration Batch reaches Ready through final quality validation.

## Attention policy

`REQUEST_CHANGES`, a failed required quality gate, handoff generation that needs human input, provider failure, ownership/resource violation, or an unavailable required Reviewer places that Task in attention. Its dependent subgraph remains blocked by ordinary dependency readiness. Independent eligible Tasks may continue.

Nebula fails the Run and stops all automatic progression only when Mission integrity is uncertain—for example, the active Mission, Project, or an approved Mission Task is missing. In Supervised Swarm, configured retry and remediation budgets may recover a provider, quality, or review failure. Exhausted budgets, unsafe coordination changes, and unresolved conflicts become explicit attention instead of silently expanding authority.

## Pause, resume, and stop

- **Pause Run** prevents new Tasks from starting. Active provider turns and their deterministic completion pipeline may settle; Nebula does not kill them.
- **Resume Run** discards no work and recomputes readiness from canonical state. It does not continue from cached wave state.
- **Stop Run** permanently stops automatic scheduling for that Run. It does not cancel Tasks, stop active turns, delete Threads, remove worktrees, or delete the Mission. Existing work remains available for manual operation.

Terminal Center discovers active Run Task Threads and keeps using its existing canonical Thread renderer. Choose **Mission flow** to arrange those Threads by the Mission DAG.

## Implementation status

| Capability                      | Status          |
| ------------------------------- | --------------- |
| Deterministic Mission scheduler | IMPLEMENTED     |
| Automatic wave advancement      | IMPLEMENTED     |
| Resource-aware scheduling       | IMPLEMENTED     |
| Dependency context injection    | IMPLEMENTED     |
| Automatic review pipeline       | IMPLEMENTED     |
| Pause/resume/stop               | IMPLEMENTED     |
| Automatic remediation           | IMPLEMENTED     |
| Automatic provider rerouting    | IMPLEMENTED     |
| Plan rewriting                  | NOT IMPLEMENTED |
| Swarm Mode                      | IMPLEMENTED     |
