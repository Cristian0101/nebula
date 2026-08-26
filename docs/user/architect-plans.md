# Architect plans

Architect always proposes and a human always approves. Approval may materialize a Mission that can later run in Manual, Assisted, or Supervised Swarm mode; no autonomy level bypasses this boundary. See [Supervised Swarm](swarm-mode.md).

Architect plans turn a high-level engineering objective into a reviewable Mission proposal. Open **Swarm → Swarm Brief**, enter an objective and optional constraints/context paths, explicitly select the Planner provider and model, then choose a team preset and writable-concurrency limit.

Generation requires a clean Git repository and records the exact HEAD commit. Nebula sends a bounded context package: a limited-depth tree, selected small text files, project quality/review policy, and enabled Shared Resources. Protected paths, environment files, credentials, binaries, large files, build output, dependency trees, and Git internals are excluded. Repository text is evidence, not policy, and cannot override Nebula's schema or human approval boundary.

The result is a separate durable proposal, not a Mission. It contains proposed Tasks, roles, reviewer assignments, named checkpoints, observable acceptance criteria, dependency edges, write/read/deny ownership, existing Shared Resource requirements, advisory provider recommendations, assumptions, risks, unresolved questions, and resource-policy gaps. Deterministic validation checks team bounds, checkpoint references, approved gate IDs, canonical ownership syntax, known resources, unique Task keys, and the canonical Mission DAG. Warnings identify broad/overlapping writes without pretending those cases are always invalid.

Generation state is durable and truthful. Nebula records repository validation, context preparation, provider start, provider work, decoding, validation, readiness, cancellation, staleness, and classified failures. It does not expose hidden model reasoning. The UI shows the current phase, elapsed time, Planner identity, attempt history, and retained diagnostics.

You can edit the proposal and confirm an actual provider/model for every Task. Architect recommendations remain labeled suggestions. Every edit is revalidated and preserved as a revision. Rejected and failed proposals remain history.

Approval is explicit, atomic, and retry-safe. It creates exactly one ordinary draft Mission, its ordinary draft Tasks, ownership rules, membership, dependency edges, and named checkpoint policy. Architect Missions pin the exact planning commit so later Task worktrees share one common base. If HEAD changes before approval, approval fails visibly and preserves the proposal; the user may regenerate or explicitly acknowledge the original baseline. Approval does not activate the Mission, prepare worktrees, create Threads, acquire leases, or start providers. After approval, choose **Run Swarm** or use the lower-level Mission controls.

Limitations: Architect does not automatically approve or activate, approve ownership, create Shared Resources, resolve conflicts, merge `main`, push, or open a pull request. Cancellation preserves the durable attempt and prevents its late result from replacing newer state; provider-process interruption still depends on adapter support. Scheduling begins only after a separate explicit Run confirmation.
