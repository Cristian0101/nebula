# Nebula

Your coding agents. One engineering team.

Nebula is an open-source, local-first orchestration layer for multi-agent software development, built on top of [T3 Code](https://github.com/pingdotgg/t3code).

## Status

**Early development / repository foundation.**

Nebula currently preserves the proven T3 Code runtime, provider, Git, checkpoint, and client foundations. Nebula-specific orchestration functionality has not been implemented yet. In particular, Swarm Mode, a mission engine, ownership enforcement, review gates, and integration automation are future work.

## Direction

Nebula will coordinate the coding agents a developer already uses. Its planned capabilities include:

- Provider-neutral orchestration across independently authenticated coding agents
- Isolated writable tasks backed by Git worktrees
- Explicit file ownership and shared-resource policies
- Structured handoffs, reviews, and reversible integration
- A manual Command Deck before higher-autonomy workflows

Nebula coordinates. Providers execute. Git remains the source of history.

## Architecture

T3 Code already provides the execution boundary Nebula needs: provider adapters, subprocess and terminal management, Git/VCS operations, worktrees, checkpoints, persisted orchestration events, relational projections, Electron desktop, web, mobile, and typed RPC.

Nebula will extend those primitives in small, isolated modules rather than recreate a provider system, Git system, event bus, or desktop shell. See [UPSTREAM.md](./UPSTREAM.md) for the baseline, sync policy, and planned extension points.

## Development setup

This is a T3 Code fork. Follow the upstream-compatible setup before contributing:

```bash
# Node 24 and Vite+ are required by the current upstream baseline.
vp i
vp run dev:desktop
```

The full inherited development notes live in [docs/internals/scripts.md](./docs/internals/scripts.md).

## Roadmap

1. Map the existing T3 runtime and define the Nebula extension contract.
2. Build Command Deck foundations: missions, bounded tasks, and isolated workspaces.
3. Add ownership, handoff, review, and integration policies.
4. Introduce Swarm Mode only after the manual workflow is reliable and observable.

## Contributing

Nebula is intentionally preserving upstream compatibility while its orchestration layer is designed. Read [CONTRIBUTING.md](./CONTRIBUTING.md) before proposing changes.

## Security

Nebula must remain local-first and must not become a credential vault. See [SECURITY.md](./SECURITY.md) for disclosure guidance and protected boundaries.

## Upstream attribution

Nebula is a fork of [T3 Code](https://github.com/pingdotgg/t3code), licensed under MIT. T3 Code supplies the underlying execution harness that Nebula extends. The original copyright and license notice are preserved in [LICENSE](./LICENSE).
