# Security policy

Nebula is designed to coordinate locally installed developer tools without becoming a credential vault.

## Protected by default

Treat the following as protected and out of scope for normal agent work:

- `.env*` files
- SSH keys
- GitHub tokens
- provider credentials
- cloud credentials
- operating-system credential stores
- production databases

## Product boundaries

Nebula should not:

- collect provider passwords
- extract browser cookies
- log credentials
- silently execute production actions
- silently escalate shell permissions

Provider authentication should remain with the official provider tooling whenever practical. Nebula may retain non-secret configuration such as binary paths, model preferences, and session metadata.

## Reporting a vulnerability

Until a dedicated security contact is published, please use GitHub's private security advisory flow for this repository. Do not include secrets in public issues, pull requests, logs, or screenshots.

When reporting, include a clear description, impact, affected version or commit, and safe reproduction steps. Give maintainers reasonable time to investigate before public disclosure.
