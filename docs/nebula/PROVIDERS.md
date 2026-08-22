# Nebula providers

Nebula uses the inherited T3 Code driver, adapter, registry, session, and model-selection systems. Provider CLIs own authentication and credentials; Nebula stores only provider configuration such as enablement, executable path, and optional manual model identifiers.

## Gemini CLI — experimental / blocked for individual Google account auth

The Gemini CLI provider is preserved as an experimental prototype and is not a supported mainline provider for individual Google accounts. Its potential future value is limited to enterprise Code Assist, API-key authentication, or future CLI compatibility. For individual Google accounts, Antigravity is the intended supported Google terminal provider.

Gemini CLI is an opt-in first-party provider implemented through the official Google `@google/gemini-cli` package and its ACP stdio mode.

### Install and authenticate

Install the official package:

```bash
npm install -g @google/gemini-cli
```

Run `gemini` directly and complete Google's login flow. Gemini CLI owns and caches the resulting credentials. Nebula does not collect Google passwords, API keys, OAuth tokens, cookies, or credential files.

Nebula health polling runs only `gemini --version` with a short timeout. It does not start ACP or launch authentication in the background. A user-started Gemini session launches `gemini --acp`; missing or expired authentication is then surfaced as a provider session error by the CLI.

### Runtime behavior

- New sessions use ACP `session/new` with the canonical Thread workspace.
- Continuations persist the ACP session identifier and use `session/load`.
- Prompts, cancellation, approval requests, output, tool activity, and failures use the shared ACP runtime and normalized provider events.
- The Gemini process starts with the canonical Thread workspace as `cwd`. The shared ACP client currently advertises filesystem proxying as unavailable, so Gemini CLI uses its own filesystem tools; Task ownership validates the resulting Git change set before completion.
- Gemini's unstable ACP session-model method is isolated inside the Gemini adapter.
- Gemini supports multiple sessions through one provider instance. Multiple configured Gemini instances are not advertised until independently proven.

### Models

The default Nebula choice is **Auto**, which leaves model routing to Gemini CLI. Users may add an explicit model identifier in provider model settings; Nebula passes that identifier to ACP session model selection.

Gemini CLI does not provide a stable standalone machine-readable command for enumerating every account-available model. Nebula does not scrape the interactive `/model` menu and does not ship a supposedly exhaustive hard-coded catalog. The ACP session handshake may report models for that authenticated session, but the current provider snapshot intentionally remains `Auto` plus user-configured manual identifiers so background status checks never trigger login.

### Known limitations

- Authentication state is reported as unknown until a user starts a session.
- Nebula does not yet enable ACP filesystem proxying. The Task worktree is the process workspace, but worktree isolation is not an OS sandbox and ownership remains post-change enforcement.
- Provider-side rollback is not available through Gemini ACP; Nebula's Git checkpoint and Task recovery systems remain available.
- Model changes use Gemini's unstable ACP session-model capability and may require adaptation when the upstream protocol changes.
- Audio prompts exposed by Gemini ACP are not currently represented by Nebula's attachment contract.
- Live QA on 2026-08-22 was blocked by a Google service response stating that Gemini Code Assist for individuals is no longer supported for this client and directing the account to Antigravity. The adapter must not be marked release-ready until a supported Gemini CLI account/authentication path completes a real session.
