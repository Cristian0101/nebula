# ADR-007: Keep authentication local and provider-owned

## Status

Accepted

## Context

Users already authenticate coding tools through their official provider CLIs and local operating-system credential stores. Centralizing those credentials in Nebula would increase risk and contradict the product's local-first foundation.

## Decision

Nebula will not collect provider passwords, browser cookies, SSH private keys, or cloud credentials. It will rely on provider-owned authentication where practical and retain only non-secret configuration and task metadata needed to coordinate installed tools.

## Alternatives considered

- A Nebula-hosted credential vault.
- Browser-cookie extraction for provider sessions.
- Require users to paste API keys into Nebula for every provider.

## Consequences

Nebula reduces credential exposure and remains compatible with official provider authentication flows. Provider availability may vary with each tool's local login state, so the product must show readiness clearly instead of masking it.

## Migration impact

None for the foundation. Any future secure-storage use needs a separate ADR, an explicit data inventory, and user-visible consent.

## Review conditions

Revisit only for a concrete capability that cannot function through provider-owned auth and has a narrowly designed, auditable secret-handling model.
