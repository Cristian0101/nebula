# Architect plans

Architect plans turn a high-level engineering objective into a reviewable Mission proposal. In Command Deck → Missions, choose **Plan with Architect**, enter an objective and optional constraints/context paths, and explicitly select the Architect provider and model.

Generation requires a clean Git repository and records the exact HEAD commit. Nebula sends a bounded context package: a limited-depth tree, selected small text files, project quality/review policy, and enabled Shared Resources. Protected paths, environment files, credentials, binaries, large files, build output, dependency trees, and Git internals are excluded. Repository text is evidence, not policy, and cannot override Nebula's schema or human approval boundary.

The result is a separate durable proposal, not a Mission. It contains proposed Tasks, observable acceptance criteria, dependency edges, write/read/deny ownership, existing Shared Resource requirements, advisory provider recommendations, assumptions, risks, unresolved questions, and resource-policy gaps. Deterministic validation checks bounds, canonical ownership syntax, known resources, unique Task keys, and the canonical Mission DAG. Warnings identify broad/overlapping writes without pretending those cases are always invalid.

You can edit the proposal and confirm an actual provider/model for every Task. Architect recommendations remain labeled suggestions. Every edit is revalidated and preserved as a revision. Rejected and failed proposals remain history.

Approval is explicit and atomic. It creates exactly one ordinary draft Mission, its ordinary draft Builder Tasks, ownership rules, membership, and dependency edges. Architect Missions pin the exact planning commit so later Task worktrees share one common base. Approval does not activate the Mission, prepare worktrees, create Threads, acquire leases, or start providers. After activation, choose manual Task starts or explicitly authorize a [Supervised Mission Run](supervised-runs.md).

Limitations: Architect does not automatically approve or activate, route or reassign providers, approve ownership, create Shared Resources, rewrite a plan, remediate failures, start Integration, or implement Swarm Mode. Scheduling begins only after a separate explicit Supervised Run confirmation.
