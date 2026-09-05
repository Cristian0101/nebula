# Nebula

Your coding agents. One engineering team.

Nebula is an open-source, local-first orchestration layer for multi-agent software development, built on [T3 Code](https://github.com/pingdotgg/t3code). It keeps provider credentials in provider-owned CLIs and uses Git as the durable execution and recovery boundary.

## Why multi-agent coordination matters

Running several coding agents creates coordination work: deciding who owns each change, carrying context between dependent tasks, reviewing the result, and recovering when execution stops. Nebula makes those boundaries explicit so individual developers and small teams can supervise parallel work from one local workspace.

Open source makes the coordination policy inspectable and adaptable. Developers can examine how work is scheduled, how changes are reviewed, and where human approval is required.

## What Nebula adds to T3 Code

T3 Code provides the execution harness that Nebula extends. Nebula's contribution is the coordination layer over those existing provider, Thread, Git, and persistence primitives:

| Developer need | Nebula contribution | Guide |
| --- | --- | --- |
| Divide work without losing ownership | Tasks, isolated worktrees, and declared path ownership | [Project contract](docs/nebula/PROJECT_CONTRACT.md) |
| Coordinate dependent changes | Missions, dependency scheduling, and shared-resource leases | [Shared Resources](docs/user/shared-resources.md) |
| Supervise a team of agents | Human-approved plans, bounded recovery, and independent review | [Architect plans](docs/user/architect-plans.md) |
| Inspect the combined result | Integration in a separate worktree with final validation | [Architecture](docs/nebula/ARCHITECTURE.md) |

See the [upstream policy](UPSTREAM.md) for attribution and intentional divergence.

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
# Node ^24.13.1 and Vite+ are required by package.json.
git clone https://github.com/Cristian0101/nebula.git
cd nebula
vp i
vp run dev
```

The server prints a pairing URL. Open the complete URL, add a disposable or local Git repository, check provider readiness in **Settings → Providers**, then open **Terminal Center** or **Command Deck**. See the [five-minute quick start](./docs/user/quick-start.md) and the evidence-based [Alpha acceptance checklist](./docs/release/ALPHA_ACCEPTANCE.md).

## Development and validation

Nebula is an early-stage project maintained by [Cristian Sanchez Aguilera](https://github.com/Cristian0101). Public implementation and maintenance records include:

- [Alpha certification fixes and verification (#20)](https://github.com/Cristian0101/nebula/pull/20): records a four-Task, three-wave Codex + Antigravity Mission, independent review, remediation, recovery, and Integration Ready.
- [Supervised planning and live-team workflow (#23)](https://github.com/Cristian0101/nebula/pull/23): documents Team Plan, checkpoints, War Room, and recovery behavior.
- [Reviewer configuration repair (#31)](https://github.com/Cristian0101/nebula/pull/31): preserves configured reviewer models and options.

The [Alpha acceptance record](docs/release/ALPHA_ACCEPTANCE.md) describes historical candidate verification. It is not a claim that every later commit or provider combination has been independently certified. Nebula currently targets developers running from source; the Alpha packaging record does not establish a signed, notarized public binary release.

## Current Alpha limitations

- Provider subprocesses cannot always survive a server process restart; Nebula must report and recover the interrupted state.
- Provider routing and remediation are bounded heuristics, not unattended autonomy.
- Integration conflicts and unsafe overlap require a human.
- Cross-provider and recovery evidence is scoped to the candidate and provider versions in the [Alpha acceptance record](docs/release/ALPHA_ACCEPTANCE.md); new release candidates require fresh verification.
- The production vector icon may still change.

## Architecture and contributing

Start with [Nebula source of truth](./docs/nebula/README.md), [architecture](./docs/nebula/ARCHITECTURE.md), [upstream policy](./UPSTREAM.md), and [contributing guide](./CONTRIBUTING.md). Behavior changes belong in the appropriate user or internal documentation; implementation plans and QA scratch files do not belong in the repository.

## Security and attribution

Nebula must remain local-first and must not become a credential vault. See [SECURITY.md](./SECURITY.md) for disclosure guidance.

Nebula is a fork of [T3 Code](https://github.com/pingdotgg/t3code), licensed under MIT. T3 Code supplies the execution harness that Nebula extends. Original copyright and license notices remain in [LICENSE](./LICENSE).
