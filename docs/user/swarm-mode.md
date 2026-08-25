# Run a Mission with Supervised Swarm

Supervised Swarm turns an approved Architect Mission into one deterministic run. Open **Command Deck → Missions**, activate the approved Mission, choose **Supervised Swarm**, review the frozen launch policy, then choose **Run Swarm**.

The shortest entry path is **Project Home → Run a Swarm**. This opens Command Deck directly in Missions so you can describe the objective to Architect, review the proposed Task graph, explicitly approve it, and then run it. The empty Tasks state offers the same **Plan with Architect** action; manual Task creation remains available as a secondary path.

The launch summary records concurrency, routing, retry and remediation budgets, independent review, automatic Integration, and the permanent rule that Nebula never merges `main`. Once started, the policy is immutable. If the Project quality or review policy changes, the Run stops for attention; stop it and launch a new revision to adopt the change.

Nebula schedules the approved DAG, injects bounded prerequisite evidence, validates ownership and Shared Resources, executes quality gates and independent review, uses bounded recovery, and unlocks later waves without manual Task-start clicks. Terminal Center exposes the live provider Threads using the same canonical Mission flow.

When every Task is complete and **Automatic Integration** is enabled, Nebula creates an Integration Batch in Mission topological order. Unapproved path overlap, Git conflicts, and failed final validation stop for human attention. A Ready Integration makes the Run completion-eligible; the user still completes the Mission and decides whether any external merge or publication happens.

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
