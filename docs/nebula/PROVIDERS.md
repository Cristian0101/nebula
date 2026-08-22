# Nebula providers

Nebula providers extend the inherited ProviderDriver SPI. Authentication, credentials, model execution, and provider-specific tools remain owned by the provider CLI. Nebula stores only non-secret configuration, the resolved binary path, normalized runtime state, and continuation metadata.

## Antigravity CLI — implemented

Antigravity is the supported Google first-party terminal provider for individual Google accounts. Nebula invokes the official `agy` headless interface:

```text
agy -p <prompt> --output-format stream-json
```

The adapter uses the inherited child-process spawner, sets the process working directory to the effective Thread workspace, and validates an `init.cwd` reported by Antigravity against the canonical Task worktree. A first turn includes `--new-project` so that working directory becomes the Antigravity workspace. Later turns supply the stored conversation ID through `--conversation`.

The NDJSON parser handles `init`, `step_update`, and `result` events. Assistant text, tool lifecycle summaries, errors, usage, and terminal states become normalized provider-runtime events; raw Antigravity envelopes do not become Task or UI state. Task identity remains independent from Antigravity conversation identity.

Background readiness checks execute only `agy --version`. An installed binary therefore reports authentication as required or unverified until a user starts a session; polling never opens a browser. Connect and first-run authentication remain official Antigravity flows, and Nebula never reads or stores Google passwords, OAuth tokens, browser cookies, or keyring contents.

Nebula never uses ACP, undocumented Google endpoints, or `--dangerously-skip-permissions`. Workspace editing uses Antigravity's supported `accept-edits` mode. Antigravity can still soft-deny commands or actions outside its policy, and those errors surface without changing global Antigravity settings. Provider permissions, Git worktree isolation, and Task ownership are complementary layers.

The installed CLI's `agy models` output is human-readable rather than a stable machine-readable contract. Nebula therefore exposes the provider default (`auto`) plus manual model IDs and passes a selected value through `--model`. Supported reasoning effort is passed through `--effort`. Structured text-generation operations use official `--output-format json --json-schema` execution without a separate Gemini API key.

Current limitations:

- Antigravity headless image attachments and provider conversation rollback are not supported by this adapter.
- Interactive approval and question events cannot currently be answered through Nebula; the run fails or waits honestly.
- The installed CLI may report an error result after a user interrupt; Nebula uses the managed cancellation intent as the authoritative normalized lifecycle.
- Model catalog discovery remains provider-default plus manual model ID until `agy` exposes a stable machine-readable catalog.
- Antigravity usage totals are retained only where they fit the existing provider usage contract.

## Gemini CLI — experimental and blocked

The Gemini CLI adapter prototype is preserved on its experimental branch but is not merged or registered as an implemented mainline provider. Individual Google-account authentication is blocked by the current provider transition.

Potential future value is limited to enterprise Code Assist, API-key authentication, or future CLI compatibility. Until one of those paths is verified, individual Google-account users should select Antigravity.
