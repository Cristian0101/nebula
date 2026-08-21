# ADR-002: Preserve a provider-adapter architecture

## Status

Accepted

## Context

Nebula must coordinate coding agents from multiple providers without asking users to move their credentials into Nebula or forcing one provider's execution model onto another.

## Decision

Nebula will use T3 Code's existing provider drivers, adapters, registries, and session lifecycle. Nebula policies will target provider-neutral task contracts; provider-specific behavior stays at the adapter boundary.

## Alternatives considered

- Implement a single Nebula-owned agent runtime.
- Add provider-specific orchestration paths throughout the application.
- Support only one provider in the first release.

## Consequences

Nebula retains provider portability and benefits from upstream reliability work. New capabilities must be expressed in the common contract where possible, with adapter extensions only when a provider genuinely differs.

## Migration impact

None for the foundation. Future work extends existing provider boundaries rather than replacing subprocess or authentication plumbing.

## Review conditions

Revisit when a required provider cannot expose enough state through the existing adapter model, or when a provider-neutral contract would hide material safety differences.
