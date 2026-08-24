# Nebula

Your coding agents. One engineering team.

Nebula is an open-source, local-first orchestration layer for multi-agent software development, built on [T3 Code](https://github.com/pingdotgg/t3code). It keeps provider credentials in provider-owned CLIs and uses Git as the durable execution and recovery boundary.

## Alpha capabilities

- **Terminal Center** launches and arranges canonical provider Threads in Grid, Provider Columns, Status Lanes, Radial, Compact, or persisted Freeform layouts.
- **Command Deck** turns work into isolated Tasks with path ownership, Shared Resource leases, quality gates, review snapshots, structured handoffs, and reversible restore.
- **Architect** asks a real provider for a bounded Mission proposal against an exact clean commit. A human edits and approves it before any execution state exists.
- **Missions** model an explicit Task DAG and deterministic execution waves.
- **Supervised Swarm** schedules approved Tasks, injects prerequisite context, applies bounded retry/remediation/provider routing, runs independent review, and can start the Integration Engine.
- **Integration Engine** applies immutable Task artifacts in DAG order inside a separate worktree and runs explicitly approved final gates. It never merges `main`.

Nebula supports the existing Codex, Claude Code, Cursor, Grok, and OpenCode adapters and adds Antigravity as a first-party provider. Availability and authentication are detected from local provider installations; Nebula does not store provider credentials.

## Alpha safety model

Nebula coordinates. Providers execute. Git records the result.

- Writable Tasks use isolated Git worktrees.
- Repository-relative ownership and deny rules are checked against the complete Task delta.
- Shared Resources serialize declared cross-Task write contention.
- Quality commands require explicit approval and can be scoped to Tasks, final Integration, or both.
- Independent review is bound to an immutable snapshot.
- Recovery is bounded and visible. Human-attention states stop the affected branch.
- Supervised Swarm never approves its own plan, silently expands ownership, resolves conflicts, publishes a PR, or merges `main`.

## Quick start

Nebula currently targets contributors and early local Alpha users:

```bash
# Node 24 and Vite+ are required by the current upstream baseline.
vp i
vp run dev
```

The server prints a pairing URL. Open the complete URL, add a disposable or local Git repository, check provider readiness in **Settings → Providers**, then open **Terminal Center** or **Command Deck**. See the [five-minute quick start](./docs/user/quick-start.md) and the evidence-based [Alpha acceptance checklist](./docs/release/ALPHA_ACCEPTANCE.md).

## Current Alpha limitations

- Provider subprocesses cannot always survive a server process restart; Nebula must report and recover the interrupted state.
- Provider routing and remediation are bounded heuristics, not unattended autonomy.
- Integration conflicts and unsafe overlap require a human.
- A complete cross-provider live Mission and full crash matrix remain release gates until recorded as PASS in the checklist.
- The production vector icon may still change.

## Architecture and contributing

Start with [Nebula source of truth](./docs/nebula/README.md), [architecture](./docs/nebula/ARCHITECTURE.md), [upstream policy](./UPSTREAM.md), and [contributing guide](./CONTRIBUTING.md). Behavior changes belong in the appropriate user or internal documentation; implementation plans and QA scratch files do not belong in the repository.

## Security and attribution

Nebula must remain local-first and must not become a credential vault. See [SECURITY.md](./SECURITY.md) for disclosure guidance.

Nebula is a fork of [T3 Code](https://github.com/pingdotgg/t3code), licensed under MIT. T3 Code supplies the execution harness that Nebula extends. Original copyright and license notices remain in [LICENSE](./LICENSE).
