# Swarm Alpha fixture

This small dependency-free SaaS fixture is the permanent local benchmark repository for Nebula Alpha.

The live objective is:

> Add user notification preferences. Preserve current authentication behavior. Do not modify billing. Add frontend, backend, and regression coverage.

`npm test` proves the protected baseline. `npm run test:integration` intentionally fails before the feature is implemented, then becomes the final Integration gate. The scenario in `swarm-alpha-scenario.json` defines four Tasks over three waves, a deterministic Shared Resource contention, a Codex/Antigravity concurrency opportunity, review remediation, provider replacement, and the expected final Integration outcome.

This fixture does not claim live-provider coverage. The live procedure is documented separately in `docs/release/ALPHA_ACCEPTANCE.md`.
