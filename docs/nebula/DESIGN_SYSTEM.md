# Nebula design system

This document is the canonical visual source of truth for Nebula. It supersedes older Nebula violet and blue palette proposals where they conflict, while leaving product and architecture requirements unchanged.

## Brand thesis

Nebula is a calm engineering command center for coordinating coding agents. The product should feel technical, precise, trustworthy, and dense enough for sustained work. Warm orbital energy identifies primary actions and the brand mark; navy, graphite, white, and cool neutral surfaces carry the interface.

The product promise is:

> Your coding agents. One engineering team.

## Logo concept and asset status

The approved direction is a four-point stellar center, orbital arcs, and orbiting nodes. The center represents the repository or shared objective; the nodes represent independent agents and providers; the arcs represent coordination.

An approved 1254px square raster brand reference has been supplied. It confirms the central gold four-point star, four coordinated orbital arcs and nodes, warm coral/orange/gold energy, graphite counterpoint, and deep navy field. Because the PNG is flattened RGB without transparency, it is not a production vector or adaptable app-icon source. Product UI currently uses a deliberately simple temporary orbital/star mark derived from those concepts rather than an automatic trace. Existing generated T3 app icons and favicons remain in place where the build requires production assets. They must be replaced only after the approved source package listed in `assets/nebula/README.md` is available.

## Palette

### Core brand colors

| Token          | Value     | Use                           |
| -------------- | --------- | ----------------------------- |
| Nebula Void    | `#020F27` | Dark canvas                   |
| Deep Orbit     | `#061427` | Dark chrome and sidebar       |
| Elevated Orbit | `#101E33` | Raised dark surfaces          |
| Orbital Border | `#22324A` | Dark borders                  |
| Stellar White  | `#F7F8FC` | Dark-theme foreground         |
| Lunar Text     | `#A8B2C2` | Dark-theme secondary text     |
| Solar Coral    | `#FF654A` | Dark primary interaction      |
| Orbit Orange   | `#FFA338` | Update and technical emphasis |
| Stellar Gold   | `#FFD166` | Rare highlight                |
| Soft Star      | `#FFE2A3` | Warm supporting highlight     |

### Light companion

The light theme uses `#F7F4EE` for the canvas, `#E9EEF4` for the sidebar, `#08162A` for foreground, and an accessibility-adjusted `#C74630` coral for primary interaction. It is a composed companion, not an inversion of the dark palette.

Brand color distribution targets roughly 85–90% navy, graphite, white, and neutral UI; 8–12% coral primary interaction; and 2–5% orange or gold emphasis. Semantic error and warning families remain independent from brand accents.

## Typography

Geist Sans and Geist Mono remain the preferred Nebula type families. The inherited repository does not currently contain compatible Geist assets, so this pass preserves the existing platform-native sans and UI monospace stacks rather than introducing a network font dependency. Appearance typography overrides remain supported. A later asset pass may add self-hosted Geist without changing the theme schema.

Use the sans family for interface copy. Use the mono family for code, terminal-adjacent UI, SHAs, branches, paths, and technical identifiers. Avoid oversized display typography in the product shell.

## Spacing and density

Use the inherited compact spacing scale and preserve information density. Prefer 8px control insets, 12–16px panel spacing, and clear grouping over ornamental whitespace.

## Radius

- Cards and major panels: 10–14px.
- Buttons and inputs: 8–10px.
- Status pills: fully rounded only when the control is semantically a pill.

## Borders and elevation

Use subtle cool borders and low, restrained elevation. Establish hierarchy with surface, spacing, type, and state before increasing border contrast. Primary application panels should remain readable and fairly solid; glass is reserved for menus, dialogs, the floating composer, and transient surfaces.

## Interaction states

- Primary: coral with a contrast-safe foreground.
- Secondary: neutral raised surface.
- Ghost: minimal surface change on hover or press.
- Destructive: semantic red, never coral by default.
- Focus: a visible coral-adjacent ring with sufficient contrast in light and dark themes.
- Disabled: lower emphasis without erasing the control boundary or label.

Selection should be visible through both surface and focus/outline treatment. State outranks provider identity.

## Status colors

Success, warning, error, info/update, blocked, waiting, and disconnected states use semantic families. Nebula orange and gold may support updates or review emphasis, but they do not replace warning semantics. Provider colors should remain secondary to task or connection state.

## Iconography

Use the inherited Lucide-based thin geometric icon system. Favor orbit, branch, terminal, repository, provider, diff, lock, review, workspace, agent, and task concepts. Do not add another icon library for brand reasons alone.

## Motion

Motion communicates activity, selection, connection state, loading, and panel expansion. It should be brief, interruptible, and reduced-motion safe. Avoid decorative stars, continuous orbital animation, and effects that continuously repaint at idle.

## Theme behavior

`nebula` is an additive, stable built-in theme with dark and light variants. Fresh web and desktop clients select Nebula while following the established appearance preference model. The existing `system`, `light`, `dark`, `t3-chat`, `grove`, `ocean`, `ember`, and `iris` preferences remain readable. Existing `t3code:*` storage keys, legacy aliases, theme imports, custom themes, theme halves, glass opacity, environment identification, and desktop theme bridging remain unchanged.

Mobile exposes the shared Nebula palette as a built-in option, but retains the inherited `t3-code` mobile default for upgrade safety in this pass. A full mobile visual migration is deliberately deferred.

## Accessibility

All theme roles must preserve readable foreground/background pairs, visible keyboard focus, distinguishable selected and disabled states, and semantic state differentiation. Approximate brand colors may be adjusted when a UI role needs more contrast. Custom themes must continue to flow through semantic roles rather than component-level brand literals.

## Product-shell principles

- Brand presence is compact and infrastructural, not marketing art.
- Existing navigation represents shipped behavior only.
- Environment identity remains visible across local, dev, nightly, and remote contexts.
- System, Light, Dark, built-in themes, custom themes, glass, and typography controls remain first-class.
- Product naming may change to Nebula; package scopes, protocols, storage keys, data directories, licenses, legal attribution, and historical upstream references do not change for cosmetic reasons.
