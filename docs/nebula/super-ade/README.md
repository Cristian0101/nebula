# Nebula Super ADE design foundation

**Status:** Proposed (design D0, Provider Connections updated in D0.2), pending founder approval. These documents do not change runtime behavior.

**D0.2** reconciles Provider Connections with delivered E1 provider readiness (PR #37, merged) and E2 authentication lifecycle (PR #40, locally accepted) and hands E3 an implementation-ready specification. Delivered behavior and proposed E3 behavior are labelled separately.

[DESIGN_SYSTEM.md](../DESIGN_SYSTEM.md) stays the canonical visual source until the founder decisions in the contract are approved. After approval, its palette section is updated to point here.

This package turns the approved Super ADE North Star mockup and the October 2026 engineering feasibility audit into an implementation contract. Codex can deliver it progressively without improvising product behavior.

## Reading order

| #   | Document                                                              | Read it for                                                                                                                                                                              |
| --- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | [Design contract](SUPER_ADE_DESIGN_CONTRACT.md)                       | Vision, principles, scope, navigation, execution context, interaction model, reuse map, founder decisions, engineering handoff                                                           |
| 2   | [Design tokens](DESIGN_TOKENS.md)                                     | Palette strategy, every theme role value (dark and light), contrast audit, type, spacing, radius, elevation, motion, layout, breakpoints                                                 |
| 3   | [Interaction states](INTERACTION_STATES.md)                           | Provider readiness derivation, context states, switching guard, composer, save, control and error states, keyboard model                                                                 |
| 4   | [Component specifications](COMPONENT_SPECIFICATIONS.md)               | Each component labelled Existing / Extend / Proposed, with anatomy, sizing, conceptual props, states, accessibility and verification                                                     |
| 5   | [Screen blueprints](SCREEN_BLUEPRINTS.md)                             | The eight core experiences: layout, hierarchy, inventory, interactions, states, keyboard, responsive, motion, acceptance                                                                 |
| 6   | [Visual QA checklist](VISUAL_QA_CHECKLIST.md)                         | What to verify per implementation step                                                                                                                                                   |
| 7   | [Provider Connections reference](reference/provider-connections.html) | High-fidelity visual reference for E3: screens, sign-in flows, recovery and interaction states, 1440 / 1280 / 390 / ultrawide, dark and light. Synthetic data only. Open it in a browser |

## Ground rules for implementers

- Extend existing components and stores. Proposed components compose canonical commands and data; none own execution state.
- Show only states backed by data. Unknown stays unknown.
- No component-level color literals. Everything flows through theme roles.
- Where a proposal needs backend data that does not exist yet, the spec names the audit phase. Do not fake the data in the meantime.
- Provider statuses come only from E1 readiness and E2 lifecycle responses. Login URLs and device codes never leave the mounted sign-in view.
- For E3, start at the [handoff](SUPER_ADE_DESIGN_CONTRACT.md#164-e3-implementation-handoff-provider-connections) and its [acceptance checklist](SUPER_ADE_DESIGN_CONTRACT.md#165-e3-acceptance-checklist).
