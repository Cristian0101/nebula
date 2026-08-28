# Run a Mission with Swarm

Swarm turns an approved Architect Mission into one deterministic, supervised run. Open **Swarm** from the sidebar or command palette. The workflow keeps planning, approval, execution, and Integration as separate human-visible actions:

1. **Swarm Brief** defines the objective, bounded repository context, Planner, team preset, provider roster, and writable concurrency.
2. **Team Plan** reviews the proposed roster, Task DAG or table, named checkpoints, ownership, providers, warnings, and advanced JSON evidence.
3. **War Room** supervises canonical Tasks, Threads, waits, checkpoints, and the retained activity stream.
4. **Review & Integration** summarizes only real Task, review, gate, checkpoint, and Integration evidence.

The Planner is one planning and coordination seat. Team presets add 2, 4, 8, or 12 non-Planner execution seats; Custom supports a bounded count. The selected team size does not force parallel writes. **Max writable concurrency** is a separate guardrail, and the runtime still respects dependencies, ownership, Shared Resources, provider readiness, reviews, and checkpoints.

Plan generation reports persisted repository validation, context preparation, Planner start/work, schema decoding, and deterministic validation phases. While the provider is working, Nebula says **Tasks pending** instead of displaying a misleading zero. A stalled or failed attempt preserves the brief and offers Retry, Switch Planner, Edit Brief, Build Plan Manually, Diagnostics, and Cancel. Retry appends an attempt and does not duplicate a Mission or Tasks.

The shortest entry path is **Project Home → Run a Swarm**. It opens the Swarm Brief. A plan is still a proposal: **Generate Team Plan** never approves or runs it. **Approve Plan** atomically materializes exactly one ordinary draft Mission and its ordinary Tasks. **Run Swarm** is a later, explicit action.

The launch summary records concurrency, routing, retry and remediation budgets, independent review, automatic Integration, and the permanent rule that Nebula never merges `main`. Once started, the policy is immutable. If the Project quality or review policy changes, the Run stops for attention; stop it and launch a new revision to adopt the change.

Named checkpoints are server-enforced barriers. A checkpoint can require specific Tasks, current-snapshot quality gates, independent reviews, and human approval before it releases later Tasks. When human approval is required, the War Room shows **Approve checkpoint** only after the earlier evidence is complete.

Nebula schedules the approved DAG, injects bounded prerequisite evidence, validates ownership and Shared Resources, executes quality gates and independent review, uses bounded recovery, and unlocks later waves without manual Task-start clicks. Terminal Center exposes the live provider Threads using the same canonical Mission flow. Node borders and status labels update from real Thread state, with reduced-motion-safe transitions. Exclusive contention is shown as **Waiting for resource** with the resource name and holding Task. The scheduler, not agent chat, owns admission and release.

When every Task is complete and **Automatic Integration** is enabled, Nebula creates an Integration Batch in Mission topological order. Unapproved path overlap, Git conflicts, stale review evidence, and failed required final validation stop for human attention. A Ready Integration completes both the Run and its canonical Mission for the approved Swarm execution. External merge or publication remains a separate human decision.

Review readiness counts only required current-snapshot approvals. Immutable historical attempts remain visible separately, including changes requested and stale results. Final validation counts the configured required Integration gates and never substitutes historical Task runs for missing final gates.

**Abort Swarm Run** stops future scheduling without deleting active work. **Restore Mission Baseline** also aborts an active Integration or removes its terminal Integration workspace while preserving the source checkout, pinned base, Task results, audit history, and recovery refs. When Integration is still aborting, use the action again after it becomes Cancelled to remove the workspace safely.

| Capability              | Status          |
| ----------------------- | --------------- |
| Manual orchestration    | IMPLEMENTED     |
| Assisted orchestration  | IMPLEMENTED     |
| Supervised Swarm        | IMPLEMENTED     |
| Swarm Alpha             | IMPLEMENTED     |
| Automatic plan approval | NOT IMPLEMENTED |
| Unlimited autonomy      | NOT IMPLEMENTED |
| Automatic main merge    | NOT IMPLEMENTED |
| AI conflict resolution  | NOT IMPLEMENTED |
