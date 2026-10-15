# Super ADE interaction states

**Status:** Proposed (D0.2). Defines every state the Super ADE surfaces must render, how each is derived from existing data, and its exact presentation. Engineers implement these as pure derivation functions with table-driven tests. Components render only the derived result.

Section 1 separates **delivered** behavior (E1 readiness, E2 authentication lifecycle) from **proposed** E3 presentation. Every other section is proposed.

## 1. Provider readiness and authentication

**Reconciled in D0.2** against delivered code. The D0 version of this section predated E1 and E2. It derived readiness from raw snapshot fields, parsed plan labels for billing and described sign-in as a copied CLI command. All three assumptions are withdrawn.

Two delivered systems feed Provider Connections. They stay separate in data, in code and on screen. E3 adds presentation only.

| System                          | Status                                                                      | Source of truth                                                                                                                                         | Transport and scope                                                                                                                     | Answers                                                                                                                             |
| ------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **E1** Provider readiness       | **Delivered.** PR #37, merged at `1f78e8473`                                | `deriveProviderReadiness` in `packages/shared/src/providerReadiness.ts`, over the `ServerProvider` snapshot stream                                      | Existing snapshot subscription (`orchestration:read`). Refresh with `server.refreshProviders({ instanceId })` (`orchestration:operate`) | Is this instance installed, signed in and identified? Which billing route does it report? Is the model offered? Did preflight pass? |
| **E2** Authentication lifecycle | **Delivered locally.** PR #40 open at `4b2a955`, E2.5 local acceptance PASS | Instance-owned volatile attempt in `apps/server/src/provider/providerAuthentication.ts`. Contract in `packages/contracts/src/providerAuthentication.ts` | `server.providerAuthentication` (`access:write`). Feature flag `ExecutionEnvironmentCapabilities.providerAuthentication`                | Which official sign-in ceremony does this instance support, and where does the current attempt stand?                               |
| **E3** Provider Connections UI  | **Proposed** (this package)                                                 | A pure presentation derivation over E1, E2, connection state and session scopes                                                                         | Consumes the two systems above. Adds no RPC, event, store or persisted field                                                            | What to show, and the one next action                                                                                               |

Rules that hold everywhere:

1. **Readiness facts come only from E1.** E3 renders `deriveProviderReadiness` output. It never recomputes a fact from raw snapshot fields and never parses `auth.label` or `auth.type`.
2. **Lifecycle state comes only from E2 responses.** A lifecycle `authenticated` does not turn an E1 fact green. The next fresh snapshot does.
3. **A successful login proves sign-in only.** Model availability, subscription entitlement, included usage and runtime preflight stay separate facts. Success copy says so.
4. **Ceremony state is volatile.** Reconnect, a transport generation change, a host change, instance replacement, a permission change and expiry each discard all client-side ceremony state and fall back to "Verification needed".
5. **Unknown stays unknown.** No fact, route or entitlement is inferred from an account name, plan label, executable name or registration.

### 1.1 E1 readiness facts (delivered)

Every fact is one of three values (`ReadinessFact`). There is no `attention` or `n/a` fact level. D0's five-level ladder is withdrawn.

| Value      | Default label | Icon (Lucide)  | Tone        | Text style    |
| ---------- | ------------- | -------------- | ----------- | ------------- |
| `verified` | Verified      | `CircleCheck`  | `success`   | Normal        |
| `blocked`  | Unavailable   | `CircleX`      | `error`     | Medium weight |
| `unknown`  | Not verified  | `CircleDashed` | `iconMuted` | Muted         |

Every value renders icon **and** text. Color is never the only cue.

E3 replaces the default labels with fact-specific copy. The rule column summarizes E1. The code is authoritative.

| Fact                      | E1 rule (summary)                                                                                                  | `verified` copy                    | `blocked` copy                          | `unknown` copy                                                                                    |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `registered`              | Snapshot exists for the exact environment and instance, and `availability` is not `unavailable`                    | "Driver available"                 | "Driver unavailable in this build"      | "Not reported"                                                                                    |
| `installed`               | Fresh, `installed`, and a `version` is reported                                                                    | "Installed · v{version}"           | "Not installed"                         | "Not verified"                                                                                    |
| `authentication`          | Fresh `auth.status`                                                                                                | "Signed in"                        | "Signed out"                            | "Not verified"                                                                                    |
| `account`                 | Authentication verified **and** `auth.accountVerified`. A label alone is not identity                              | "Verified" plus the redacted email | never produced                          | "Not reported"                                                                                    |
| `subscriptionEntitlement` | Authentication verified **and** `auth.subscriptionEntitlement === "verified"`. No current probe sets this          | "Verified"                         | never produced                          | "Not verified"                                                                                    |
| `modelAvailability`       | Fresh, authentication verified, `modelCatalogSource === "provider"`, selected/default model present and not custom | "{model} available"                | "{model} isn't offered to this account" | "Not verified" plus the reason: static catalog, custom model, not signed in, or no model selected |
| `runtime`                 | Connected, not disabled, nothing blocked, fresh, installed and authentication verified, `status === "ready"`       | "Preflight passed"                 | "Blocked" plus the E1 headline          | "Not verified"                                                                                    |

**Freshness.** E1 marks a snapshot `fresh` only when the environment is connected, `inspection.status === "completed"` and `verifiedAt` is at most five minutes old (`PROVIDER_READINESS_MAX_AGE_MS`). Pending, cached, older-server and disconnected snapshots are not fresh, so their facts are `unknown`.

**Design consequence.** Stale is the **normal idle state**. Five minutes after the last check every instance reads "Not verified". E3 must treat staleness as neutral: muted tone, no warning, no CTA, no count under "Needs attention". It always states when the last check passed: "Verification expired · checked 12 min ago".

**Advisories are not facts.** They render as separate chips, never as a fact value:

| Advisory           | Source                                                                     | Chip                                        | Tone              |
| ------------------ | -------------------------------------------------------------------------- | ------------------------------------------- | ----------------- |
| Update available   | `versionAdvisory.status === "behind_latest"`                               | "Update available" + existing update action | `update`          |
| Disabled in Nebula | `enabled === false`                                                        | "Disabled"                                  | muted, hollow dot |
| API billing        | `billingRoute === "api"` ([§1.2](#12-reported-billing-route-delivered-e1)) | "API billing"                               | `warning` outline |

### 1.2 Reported billing route (delivered E1)

E1 exposes `billingRoute: "subscription" | "api" | "provider-managed" | "unknown"`, produced by provider probes. It is `unknown` unless authentication is verified. D0's label-mapping table and its proposed `cloud` value are withdrawn.

| `billingRoute`     | Label            | Sub-text (detail)                                                                                 | Tone                                                  |
| ------------------ | ---------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `subscription`     | Subscription     | "Reported by {Provider}. Entitlement and remaining usage aren't verified."                        | neutral                                               |
| `api`              | API billing      | "Reported by {Provider}. Requests bill to your API account."                                      | `warning` outline (a money consequence, not an error) |
| `provider-managed` | Provider-managed | "Reported by {Provider}. Billed through a cloud or provider account, for example Amazon Bedrock." | neutral                                               |
| `unknown`          | Not reported     | "{Provider} didn't report a billing route."                                                       | muted                                                 |

Rules:

- The route label always carries **"reported"** (card fact label "Billing · reported"; detail sub-text above).
- `auth.label` (for example a plan name) appears **only** in the detail, as "Plan label reported by {Provider}: {label}". It is never parsed, counted, toned or used to choose a route.
- **Subscription entitlement is always its own row**, currently "Not verified" for every driver. A subscription route never implies entitlement or included usage.

Evidence each driver reports today (from E1/E2 probes):

| Driver                            | `subscription` when                                                                              | `api` when                     | `provider-managed` when      | Entitlement |
| --------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------ | ---------------------------- | ----------- |
| `codex`                           | App Server account type `chatgpt`                                                                | account type `apiKey`          | account type `amazonBedrock` | unknown     |
| `claudeAgent`                     | Official status reports an `oauth`/`claude.ai` method, or SDK capabilities report a subscription | API key method or token source | API provider `bedrock`       | unknown     |
| `cursor`                          | `about` output reports a subscription type                                                       | —                              | —                            | unknown     |
| `grok`, `antigravity`, `opencode` | —                                                                                                | —                              | —                            | unknown     |

Cursor detail adds one fixed row: **"X Subscription migration: Unknown"**, with the note "Cursor sign-in doesn't establish whether a unified X Subscription covers this usage." It changes only if a provider probe reports it.

### 1.3 E2 authentication lifecycle (delivered)

**Operations** (`server.providerAuthentication`, exact `environmentId` and `instanceId`, `access:write`):

| Operation | Server behavior                                                                                                                                 | E3 use                                                                                                                            |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `status`  | Returns the current lifecycle snapshot. Starts no process. During an attempt it returns `attemptId`, `expiresAt` and any `handoff`              | On detail open, to learn capability and ceremonies. Poll every 1s while an attempt is visible; every 5s while the sheet is closed |
| `begin`   | Runs a fresh verification (up to 30s), then starts the chosen advertised ceremony as a five-minute attempt. Concurrent begins reuse the attempt | "Sign in…" buttons. Shows a "Preparing sign-in…" step while the request is in flight                                              |
| `cancel`  | Cancels only the attempt whose `attemptId` matches. Never logs out shared credentials                                                           | Cancel (Codex, Cursor) and Stop tracking (Claude)                                                                                 |
| `refresh` | Runs a fresh verification. Completes an active guided-terminal attempt when the official status reports a sign-in                               | Claude "Check sign-in status". "Verify again" after `failed` or `verification-needed`                                             |

**Capabilities and ceremonies:**

| `capability`         | Instances                                                                                                                   | `ceremonies`             | Who performs the sign-in                                                                               |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------ |
| `managed-app-server` | Codex with the default local App Server launch configuration                                                                | `browser`, `device-code` | Nebula runs the official Codex App Server. The provider hosts the sign-in and completion pages         |
| `official-cli`       | Cursor                                                                                                                      | `browser`                | Nebula runs the **configured** Cursor executable's fixed `login` command with `NO_OPEN_BROWSER=1`      |
| `guided-terminal`    | Claude                                                                                                                      | `terminal`               | The person, in their own terminal, with the instance's executable, environment and `CLAUDE_CONFIG_DIR` |
| `unsupported`        | Codex with custom launch arguments or a shell-only launcher; Grok, Antigravity, OpenCode and any driver without a lifecycle | none                     | The provider's official tools, outside Nebula. Then "Check again"                                      |

**Attempt timeline:**

```
begin ─► fresh verification (≤30s) ─┬─► in-progress ─► waiting-for-user (handoff) ─► authenticated
                                    │        │                │         │
                                    │        │                │         ├─ cancel ──► cancelled
                                    │        │                │         ├─ 5 min ───► expired (timeout)
                                    │        └────────────────┴─────────┴─ process ─► failed
                                    ├─► not-installed (missing-executable)
                                    ├─► verification-needed (api-override | verification-failed)
                                    └─► unsupported
Guided terminal: begin ─► waiting-for-user (no handoff) ─► refresh ─► authenticated │ still waiting-for-user
```

**Lifecycle state presentation.** One row per E2 `state`. Reasons refine the copy ([§1.5](#15-recovery-states)).

| E2 `state`            | Label                   | Icon                 | Tone      | Primary action                                           | Secondary                                        |
| --------------------- | ----------------------- | -------------------- | --------- | -------------------------------------------------------- | ------------------------------------------------ |
| `not-installed`       | Not installed           | `CircleX`            | `error`   | Install guide                                            | Check again; link "Set executable path"          |
| `login-required`      | Sign-in required        | `LogIn`              | `warning` | Provider sign-in ([§1.4](#14-provider-specific-sign-in)) | Device code (Codex)                              |
| `available`           | Ready to sign in        | `LogIn`              | neutral   | Provider sign-in                                         | —                                                |
| `in-progress`         | Starting sign-in        | `Spinner`            | `info`    | none                                                     | Cancel                                           |
| `waiting-for-user`    | Waiting for you         | `Hourglass` (static) | `info`    | Open sign-in page · Show code · Check sign-in status     | Cancel · Stop tracking (Claude)                  |
| `authenticated`       | Signed in               | `CircleCheck`        | `success` | Done                                                     | View readiness                                   |
| `cancelled`           | Sign-in cancelled       | `CircleSlash`        | muted     | Start again                                              | —                                                |
| `failed`              | Sign-in didn't complete | `CircleX`            | `error`   | Try again                                                | Use a device code (Codex), otherwise Check again |
| `expired`             | Expired                 | `TimerOff`           | `warning` | Start a new sign-in                                      | —                                                |
| `unsupported`         | Not available here      | `Ban`                | muted     | Per reason ([§1.5](#15-recovery-states))                 | Open Provider Settings                           |
| `verification-needed` | Verification needed     | `CircleDashed`       | muted     | Check again                                              | Per reason                                       |

`available` exists in the contract but no current flow emits it. Render it as specified so a future server needs no UI change.

**Client-only states** (no E2 value; E3 derives them):

| Client state       | Detected from                                     | Label                                          | Icon          | Action                                                  |
| ------------------ | ------------------------------------------------- | ---------------------------------------------- | ------------- | ------------------------------------------------------- |
| Preparing          | `begin` request in flight                         | "Preparing sign-in…"                           | `Spinner`     | none. After 10s: "Still checking {Provider} on {host}…" |
| No access          | Session scopes lack `access:write`                | "Needs Manage access"                          | `Lock`        | none for sign-in. Facts and Check again stay            |
| Disconnected       | Connection phase is not `connected`               | "Disconnected"                                 | `WifiOff`     | Reconnect                                               |
| Older host         | `providerAuthentication` capability absent        | "Sign-in from Nebula unavailable on this host" | `Info`        | Update Nebula on {host} · Check again                   |
| Status unavailable | `server.providerAuthentication` transport failure | "Status unavailable"                           | `CircleAlert` | Retry. Never shows an RPC cause                         |

### 1.4 Provider-specific sign-in

There is no "Connect with one click" control and no Claude OAuth anywhere. Each sign-in names who performs it and where.

| Provider                                | Ceremonies (E2)                    | Entry copy                                                                                                                                                                                                    | After sign-in                                                                                                                   |
| --------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Codex** (OpenAI)                      | `browser` (primary), `device-code` | "Sign in with ChatGPT through the official Codex App Server on {host}. OpenAI API billing is a separate route."                                                                                               | Fresh `account/read` with token refresh, then fresh E1 readiness. "Signed in. Entitlement and remaining usage aren't verified." |
| **Cursor**                              | `browser`                          | "Nebula runs Cursor's official `login` with the configured executable on {host} and shows you the sign-in link." Shows the executable path, with "A command named `agent` may belong to a different product." | Fresh readiness and ACP probe. "X Subscription migration: Unknown."                                                             |
| **Claude** (Anthropic)                  | `terminal`                         | "Claude sign-in runs in your own terminal, under your control. Nebula doesn't open Claude OAuth or collect tokens."                                                                                           | Fresh official `claude auth status --json`. Eligibility caveat ([§1.4.3](#143-claude-guided-terminal))                          |
| **Grok, Antigravity, OpenCode, others** | none (`unsupported`)               | "Sign-in from Nebula isn't available for {Provider}. Use its official CLI on {host}, then check again."                                                                                                       | Readiness only                                                                                                                  |

#### 1.4.1 Codex: browser and device code

1. **Choose.** "Sign in with ChatGPT" is primary. "Use a device code instead" is secondary.
   - On a **remote** host, device code becomes primary. Note: "Browser sign-in finishes on {host}. Use a device code when your browser isn't on that machine." The callback for the browser ceremony returns to the execution host, not to the client.
   - With custom launch arguments the capability is `unsupported`. Show the E2 `guidance` text and "Open Provider Settings". Never offer a managed sign-in.
2. **Preparing** (`begin` in flight). "Preparing sign-in… checking Codex on {host}."
3. **Starting** (`in-progress`, no handoff yet). "Starting the official Codex sign-in…" plus Cancel.
4. **Browser handoff** (`waiting-for-user`, `handoff.url`). Primary "Open ChatGPT sign-in" with an external-link icon. Beneath it, the destination **host name only** ("auth.openai.com"), never the full URL. Expiry countdown. Cancel.
5. **Device code** (`waiting-for-user`, `handoff.userCode`). Verification host name plus "Open verification page". The code is masked (`••••-••••`) until "Show code" is pressed. Then it renders in `type-mono-display` with Copy. Note: "Enter this code only on {host name}. Don't share it." Expiry countdown. Cancel.
6. **Outcome.** `authenticated` → success panel. `failed` → fixed copy, Try again, and "Use a device code" when the browser ceremony failed. `expired` → Start a new sign-in. `cancelled` → "Your existing Codex sign-in, if any, wasn't changed."

#### 1.4.2 Cursor: official CLI browser handoff

1. **Start.** "Sign in with Cursor". The panel shows **Executable:** `{binaryPath}` from the instance configuration (mono, start-truncated, copyable).
2. **Preparing**, then **Starting** (`in-progress`) while the CLI starts.
3. **Browser handoff** (`waiting-for-user`, `handoff.url` on a Cursor domain). "Open Cursor sign-in", host name only, countdown, Cancel. Cancel stops the CLI login process.
4. **Outcome.** `authenticated` → success panel with fresh readiness, the reported plan label (detail only) and **"X Subscription migration: Unknown"**. Other outcomes as for Codex.

#### 1.4.3 Claude: guided terminal

1. **Start.** "Start terminal sign-in" calls `begin` with `terminal`. The attempt moves to `waiting-for-user` immediately, without a handoff.
2. **Guided steps** (numbered list, every value from the instance configuration, nothing executed by Nebula):
   1. "Open a terminal on {host}." Remote hosts add "connected to {host}".
   2. **Executable:** `{binaryPath}` (Copy). **Configuration directory (`CLAUDE_CONFIG_DIR`):** `{homePath}` or "Default (not set)" (Copy).
   3. "Run `auth login` with that executable." The subcommand renders as fixed mono text. No composed shell line ([founder decision F15](SUPER_ADE_DESIGN_CONTRACT.md#15-founder-decisions)).
   4. "Finish the prompts in your terminal and browser."
   5. "Come back and choose **Check sign-in status**." This calls `refresh`.
3. **Not yet.** When `refresh` returns `waiting-for-user`: "Claude doesn't report a sign-in on {host} yet. Finish the terminal sign-in, then check again."
4. **Stop tracking.** Calls `cancel`. Copy: "Nebula stopped tracking. Cancel the CLI sign-in yourself in your terminal."
5. **Never offered:** "Open terminal in Nebula" for this ceremony. Terminal scrollback can retain the sign-in URL, and a Nebula terminal does not guarantee the instance's environment.
6. **Eligibility caveat** ([founder decision F4](SUPER_ADE_DESIGN_CONTRACT.md#15-founder-decisions)), shown on the start step and on success:

   > Claude reports your account and sign-in method. Whether your Claude plan covers use in third-party apps like Nebula depends on Anthropic's current terms for your account. Nebula doesn't verify entitlement or remaining usage. API keys, auth tokens, key helpers and cloud-provider settings can take precedence over this sign-in.

#### 1.4.4 Success panel (all providers)

- Title: "Signed in to {Provider} on {host}". Account: redacted email when `account` is verified, otherwise "Account not reported".
- Live list of the E1 facts that a sign-in does **not** settle: model availability, subscription entitlement ("Not verified"), runtime preflight. Each shows its current value as the fresh snapshot arrives.
- Fixed line: "Signing in doesn't guarantee a model or included usage."
- Primary "Done" closes the sheet and returns focus to the launcher (for example the composer). Secondary "View readiness".

### 1.5 Recovery states

Every state names the problem, the host and one next action. The first thirteen rows are the required D0.2 set.

| #   | State                                | Detected from                                                                                                                     | Card label                               | Detail message                                                                                                                                                                                        | Primary                                              | Secondary                                        |
| --- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------ |
| 1   | Provider not installed               | E1 `installed: blocked`, or E2 `not-installed` / `missing-executable`                                                             | Not installed                            | "Nebula can't find {Provider} at `{binaryPath}` on {host}."                                                                                                                                           | Install guide (official docs)                        | Check again; inline link "Set executable path"   |
| 2   | Login required                       | E1 `authentication: blocked`, or E2 `login-required`                                                                              | Sign-in required                         | "{Provider} isn't signed in on {host}."                                                                                                                                                               | Provider sign-in                                     | Device code (Codex)                              |
| 3   | Waiting for user                     | E2 `waiting-for-user`                                                                                                             | Waiting for you                          | Ceremony step ([§1.4](#14-provider-specific-sign-in)) with the expiry countdown                                                                                                                       | Open sign-in page / Show code / Check sign-in status | Cancel / Stop tracking                           |
| 4   | Authentication in progress           | Client preparing, or E2 `in-progress`                                                                                             | Starting sign-in                         | "Starting the official {Provider} sign-in on {host}…"                                                                                                                                                 | none                                                 | Cancel (once an `attemptId` exists)              |
| 5   | Successful authentication            | E2 `authenticated` after an attempt in this view                                                                                  | Signed in                                | Success panel ([§1.4.4](#144-success-panel-all-providers))                                                                                                                                            | Done                                                 | View readiness                                   |
| 6   | Verification needed                  | E1 not fresh (pending, cached or older than 5 min), or E2 `verification-needed` with `provider-restarted` / `verification-failed` | Verification needed · checked {relative} | "Nebula hasn't confirmed {Provider}'s status recently." `verification-failed` adds "The last check couldn't finish."                                                                                  | Check again                                          | —                                                |
| 7   | Authentication expired               | E2 `expired` with `timeout` (attempt), or E2 `expired` with `login-required` (a previous sign-in ended)                           | Sign-in expired                          | Attempt: "This sign-in expired after 5 minutes." Account: "Your {Provider} sign-in on {host} has ended."                                                                                              | Start a new sign-in / Sign in again                  | —                                                |
| 8   | Cancelled                            | E2 `cancelled`                                                                                                                    | Sign-in cancelled                        | "Your existing {Provider} sign-in, if any, wasn't changed."                                                                                                                                           | Start again                                          | —                                                |
| 9   | Failed                               | E2 `failed` / `process-failed`                                                                                                    | Sign-in didn't complete                  | "The official {Provider} sign-in stopped before finishing. Check the CLI version, network and configuration, then try again."                                                                         | Try again                                            | Use a device code (Codex), otherwise Check again |
| 10  | Unsupported configuration            | E2 `unsupported` / `unsupported`, or capability `unsupported`                                                                     | Sign-in not available here               | E2 `guidance` when present (for example Codex custom launch arguments). Otherwise "Use {Provider}'s official tools on {host}, then check again."                                                      | Open Provider Settings                               | Check again                                      |
| 11  | Missing access-management permission | Session scopes lack `access:write`                                                                                                | Needs Manage access                      | "Signing in requires Manage access on {host}. Readiness stays visible." Uses `Lock`, never error tone                                                                                                 | none                                                 | Check again (when `orchestration:operate`)       |
| 12  | Disconnected remote host             | Connection phase is not `connected`                                                                                               | Disconnected (scope banner)              | "{host} is disconnected. Provider status will refresh after reconnecting." Facts show "Not verified" plus "Last checked before disconnect: {time}". All ceremony state is discarded                   | Reconnect                                            | —                                                |
| 13  | API override detected                | E2 `verification-needed` / `api-override`                                                                                         | API credential overrides sign-in         | "An API credential is configured for this instance on {host}. It takes precedence over account sign-in, so Nebula won't start one." Lists the variable **names** for the driver (below). Never values | Review in Provider Settings                          | Check again                                      |
| 14  | Disabled in Nebula                   | `enabled === false`                                                                                                               | Disabled                                 | "This instance can't start new sessions until it's enabled."                                                                                                                                          | Enable                                               | —                                                |
| 15  | Driver unavailable                   | E1 `registered: blocked`                                                                                                          | Driver unavailable                       | "This build of Nebula can't run {driver}."                                                                                                                                                            | Open Provider Settings                               | —                                                |
| 16  | Selected model unavailable           | E1 `modelAvailability: blocked`                                                                                                   | Model not offered                        | "{model} isn't offered to this account."                                                                                                                                                              | Choose another model                                 | —                                                |
| 17  | Older host                           | Capability flag absent                                                                                                            | (detail only)                            | "This host runs a Nebula version without sign-in support. Update Nebula on {host}, or sign in with {Provider}'s CLI and check again."                                                                 | Check again                                          | —                                                |
| 18  | Environment changed                  | E2 `environment-mismatch`, or a response whose `environmentId`/`instanceId` differs                                               | (detail only)                            | "The execution host changed. Showing the current host."                                                                                                                                               | Re-read status (automatic)                           | —                                                |
| 19  | Instance unavailable                 | E2 `instance-unavailable`                                                                                                         | Instance unavailable                     | "This provider instance no longer exists on {host}."                                                                                                                                                  | Back to all providers                                | —                                                |
| 20  | Stale attempt                        | E2 `stale-attempt` on cancel                                                                                                      | (detail only)                            | "This sign-in changed in another window. Showing its current status."                                                                                                                                 | Re-read status (automatic)                           | —                                                |

API override variable names by driver (names only, from E2 detection):

| Driver        | Names shown                                                                                                                                                                                                                  |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `codex`       | `OPENAI_API_KEY`, `CODEX_API_KEY`, `CODEX_ACCESS_TOKEN`                                                                                                                                                                      |
| `cursor`      | `CURSOR_API_KEY`, `CURSOR_AUTH_TOKEN`                                                                                                                                                                                        |
| `claudeAgent` | `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `CLAUDE_CODE_OAUTH_TOKEN`, `CLAUDE_CODE_USE_BEDROCK`, `CLAUDE_CODE_USE_VERTEX`, `CLAUDE_CODE_USE_FOUNDRY`. Add: "Key helpers in your Claude settings can also take precedence." |

The response does not say which variable matched, so the copy reads "one of". **Never offer to remove an override.** Removal is the person's decision on the execution host.

### 1.6 Composite connection status (proposed E3)

One pure function, `deriveProviderConnectionStatus`, combines E1 readiness, the E2 lifecycle snapshot (if any), connection state, scopes and `enabled`. Components render its output only. **Precedence, first match wins:**

1. Environment not connected → `disconnected`.
2. Client preparing, or E2 `in-progress` / `waiting-for-user` → `signing-in`.
3. `enabled === false` → `off`.
4. E1 `registered: blocked` → `attention` ("Driver unavailable").
5. E2 `verification-needed` with `api-override` → `attention` (API credential overrides sign-in).
6. E1 `runtime: verified` → `ready`.
7. E1 `runtime: blocked` → `attention`, labelled by the E1 headline.
8. Otherwise → `unverified`, labelled "Verification expired", "Not verified yet", "Checking…" or "Sign-in not verified" from E1 `fresh`, `verifiedAt` and `inspection.status`.

Terminal lifecycle outcomes (`authenticated`, `cancelled`, `failed`, `expired`) do not change the group. They appear as the detail's outcome panel and, until the next check, as the card sub-line "Last sign-in: {outcome}".

| Group          | Triage label    | Counted as        | Dot / icon                   | Card accent              |
| -------------- | --------------- | ----------------- | ---------------------------- | ------------------------ |
| `ready`        | Ready           | Ready             | `success`, filled            | none                     |
| `attention`    | Needs attention | Needs attention   | `error` or `warning`, filled | 2px leading rule in tone |
| `signing-in`   | Signing in      | Needs attention   | `info`, static ring          | 2px leading `info` rule  |
| `unverified`   | Not verified    | Not verified      | `iconMuted`, hollow          | none                     |
| `off`          | Disabled        | not counted       | `iconMuted`, hollow          | none; listed under Other |
| `disconnected` | Disconnected    | scope banner only | `WifiOff`                    | none                     |

"Ready" sub-text is always "Preflight passed". Nebula never claims a completed turn.

**Primary action** (one per card):

- `signing-in` → "Continue sign-in".
- `attention` → the recovery primary from [§1.5](#15-recovery-states). For "Sign-in required" it depends on what the client knows:
  - `access:write` present and an advertised ceremony → the provider sign-in label ("Sign in with ChatGPT", "Sign in with Cursor", "Start terminal sign-in");
  - capability `unsupported`, no lifecycle, or an older host → "How to sign in" (opens the detail with guidance);
  - no `access:write` → no button. The card shows "Needs Manage access" as text with `Lock`.
- `unverified` → "Check again".
- `ready` → none. The card opens the detail.
- `off` → "Enable".
- `disconnected` → none on cards. The scope banner has Reconnect.

The capability comes from one `status` call per enabled instance when the sheet opens. `status` starts no process.

### 1.7 Ceremony data handling

Login URLs and device codes are private and temporary. E2 already keeps them out of snapshots, history, events and diagnostics. E3 keeps them out of everything the client controls:

- **Hold** `handoff` only in the mounted ceremony view's component state. Never in a store that persists, a URL, `localStorage`, `sessionStorage`, IndexedDB, the query cache, the document title, the command palette, the sidebar summary, toasts, OS notifications, analytics, logs, error reports or Task/Mission history.
- **Show** the host name, never the full URL. Open the URL only on an explicit click (`noopener`, `noreferrer`; desktop uses the existing external-open bridge).
- **Mask** device codes until "Show code" is pressed. Copy confirms "Copied. Paste it only at {host name}."
- **Discard** `handoff` on every terminal state, on expiry (client timer from `expiresAt`), on unmount and on any reset key change: `[environmentId, instanceId, connection generation, connection phase, access:write]`. After a reset, re-read with `status`. Late replies from a previous key are ignored (E2 generation guard).
- **Re-reading is allowed.** Reopening the sheet during an attempt calls `status`, which returns the live attempt to the same authorized session. Nothing is restored from client storage.
- **Design artifacts** use placeholders only: `••••@••••` for accounts, `XXXX-XXXX` for codes, host names without paths. No real URLs, codes, emails or pairing values appear in docs, references, screenshots or QA evidence.

### 1.8 Synthetic fixtures

Use these as table-driven tests for `deriveProviderConnectionStatus` and as visual QA states. They are synthetic. D0's observed fixtures are retired because they used withdrawn derivations.

| Fixture              | E1 input (summary)                                                                       | E2 / client input                      | Expected group · label                                       |
| -------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------ |
| Codex ready          | fresh, installed, signed in, account verified, `subscription`, provider catalog, `ready` | none                                   | `ready` · Ready (Preflight passed)                           |
| Codex stale          | same, `verifiedAt` 12 min old                                                            | none                                   | `unverified` · Verification expired · checked 12 min ago     |
| Codex remote browser | fresh, signed out, remote host                                                           | `login-required`                       | `attention` · Sign-in required; device code primary          |
| Codex custom launch  | fresh, signed out                                                                        | capability `unsupported` + guidance    | `attention` · Sign-in required; primary "How to sign in"     |
| Cursor waiting       | fresh, signed out                                                                        | `waiting-for-user` + handoff           | `signing-in` · Waiting for you                               |
| Claude override      | fresh, signed in, `api`                                                                  | `verification-needed` / `api-override` | `attention` · API credential overrides sign-in               |
| Claude guided        | fresh, signed out                                                                        | `waiting-for-user`, no handoff         | `signing-in` · Waiting for you (terminal steps)              |
| Grok unknown         | fresh, `auth.status: unknown`, route unknown                                             | capability `unsupported`               | `unverified` · Sign-in not verified                          |
| Antigravity disabled | `enabled: false`                                                                         | —                                      | `off` · Disabled                                             |
| Remote disconnected  | connected `false`                                                                        | ceremony state discarded               | `disconnected` (scope banner)                                |
| Read-only client     | fresh, signed out                                                                        | scopes lack `access:write`             | `attention` · Sign-in required; action "Needs Manage access" |

### 1.9 Logout

Not offered. E2 adds no logout and cancel never logs out. When a future milestone adds logout, it needs a confirmation that states: "This signs {Provider} out on {host} for every app that uses this {Provider} account store, not just Nebula."

## 2. Execution context states

States for the proposed **Execution Context Chip** and **Context popover**. Data: thread/Task workspace resolution and VCS status (existing contracts).

| State                    | Chip rendering                                             | Popover adds                                                                               | Tone                               |
| ------------------------ | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------- |
| Loading                  | Fixed-width skeleton (`w-48`), no layout shift             | —                                                                                          | neutral                            |
| Current checkout         | `⎇ main · Current checkout`                                | HEAD SHA, dirty count, ahead/behind, path                                                  | neutral                            |
| Worktree                 | `⎇ feat/x · worktree feat-x`                               | worktree path (start-truncated), created-by (Task/thread)                                  | neutral                            |
| Task worktree            | `⎇ nebula/task-42 · Task: Add notes API`                   | Task status, ownership summary, link to Task inspector                                     | neutral                            |
| Remote environment       | `☁ devbox ▸ ⎇ main · Current checkout`                     | host label, connection status (`ConnectionStatusDot`)                                      | neutral; cloud icon always visible |
| Dirty                    | adds `● 3` after branch                                    | changed/untracked counts, "Open Diff"                                                      | neutral (dirty is normal)          |
| Branch mismatch          | `⚠ ⎇ feat/x ≠ HEAD main`                                   | explanation + "Open worktree for feat/x"                                                   | warning                            |
| Detached HEAD            | `⎇ detached @ a1b2c3d`                                     | SHA, "Create branch here…"                                                                 | warning                            |
| Missing worktree         | `⚠ worktree missing`                                       | recorded path; "Recreate worktree" (existing Task restore path only); "Start a new thread" | error                              |
| Environment disconnected | `⛔ devbox offline`                                        | last seen; reconnect hint                                                                  | error                              |
| Not a Git repository     | `Folder · not a Git repository`                            | "Initialize…" is **not** offered from here                                                 | neutral                            |
| Draft (unlocked)         | Chip hidden in toolbar; composer context strip is editable | —                                                                                          | —                                  |

## 3. Session and surface identity

| Surface               | Title                  | Sub-label                                       | Icon                                   |
| --------------------- | ---------------------- | ----------------------------------------------- | -------------------------------------- |
| Chat (thread)         | Thread title           | `{Provider mark} {model}`                       | provider mark                          |
| Shell terminal        | "Shell" or custom name | `{env} · {worktree label}`                      | `SquareTerminal`                       |
| Provider CLI terminal | "{Provider} CLI"       | "Separate session, not linked to this chat"     | provider mark + `SquareTerminal` badge |
| Dev server pane       | script name            | "Started by Nebula" / "Discovered" / "Attached" | `Server`                               |
| Preview               | page title or host     | `localhost:5173` + "on {env}" when remote       | favicon / `Globe`                      |
| File editor           | file name              | worktree label + "Unsaved" / "Saved"            | file icon                              |
| Diff                  | "Changes"              | scope "Branch" / "Unstaged" / "Task"            | `GitCompare`                           |

Linked Chat ↔ Terminal layouts show a `Link2` glyph with the tooltip "Shown together. Conversations are separate."

## 4. Context switching

Switching the **checkout** of a mutable workspace is guarded. Opening a different worktree is always safe and preferred.

```
User picks branch X in Branches view or branch selector
        │
        ├─ X already checked out in a worktree W? ──► Offer "Open W" (primary). No mutation.
        │
        ├─ Current workspace belongs to a Task? ────► Block: "Task worktrees keep their branch."
        │                                              Offer "Open X in a new worktree".
        │
        └─ Otherwise run pre-checks (fresh, server-side):
              • active provider sessions on this checkout
              • running terminals / dev servers
              • dirty or untracked files
              • unpublished commits
                    │
                    ├─ all clear ──► Confirm dialog: "Switch {checkout} from A to X" ─► revalidate ─► switch
                    └─ any found ──► Dialog lists each blocker with its own link.
                                     Primary: "Open X in a new worktree".
                                     No automatic stash, kill or discard. "Switch anyway" is not offered.
```

The confirm dialog repeats the **environment and path** being changed. After the switch, a toast says "Switched {checkout} to X" with the new HEAD SHA.

## 5. Composer states

### 5.1 Intent availability

| Intent       | Enabled when                                                                      | Disabled reason text                                                                      |
| ------------ | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Chat         | E1 `runtime` is not `blocked`. `unknown` shows a non-blocking "Not verified" hint | "{Provider} isn't ready: {headline}" + "Fix" link that opens that instance in Connections |
| Analyze      | provider exposes an enforced read-only mode                                       | "{Provider} can't enforce read-only here. Use Supervised access to approve each action."  |
| Task         | Git repository present; E1 `runtime` not `blocked`                                | "Tasks need a Git repository" / provider reason                                           |
| Mission plan | clean baseline (existing check); E1 `runtime` not `blocked`                       | "Commit or stash changes first. Mission plans start from a clean baseline."               |

Changing intent never clears the draft. Intent persists per draft, not globally.

### 5.2 Primary action states (existing `ComposerPrimaryActions`, restyled)

| State                     | Visual                                                          | `aria-label` (existing strings preserved)                       |
| ------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------- |
| Idle, empty draft         | Violet button at 40% emphasis, `disabled`                       | "Send"                                                          |
| Ready                     | Solid violet `messageAction`, arrow-up icon                     | "Send" / "Analyze" / "Create Task" / "Generate plan" per intent |
| Sending                   | Spinner replaces icon                                           | "Sending"                                                       |
| Preparing worktree        | Spinner + inline "Preparing worktree…"                          | "Preparing worktree"                                            |
| Connecting / disconnected | Neutral button, `WifiOff` icon                                  | "Connecting" / "Environment disconnected"                       |
| Running                   | Neutral square "Stop" (not violet; stop is not the primary act) | "Stop generation"                                               |
| Awaiting answers          | "Submit answer(s)"                                              | existing                                                        |
| Plan ready                | "Implement" + menu / "Refine"                                   | existing                                                        |

### 5.3 Pending panels

Approvals (`ComposerPendingApprovalPanel`) and questions (`ComposerPendingUserInputPanel`) keep their behavior. Design changes:

- Panel uses `warningSurface` for approvals and `infoSurface` for questions, with a 2px leading rule in the tone color.
- Title includes the request kind ("Command approval") and the **execution context** (worktree label) in meta text.
- Buttons order: Cancel · Decline · Always allow this session · **Approve** (primary). Destructive styling is never used for Decline.
- A polite live region announces "Approval needed: {kind}".

## 6. Save states (Notes, file editor)

| State             | Indicator (header, right)                     | Behavior                                                          |
| ----------------- | --------------------------------------------- | ----------------------------------------------------------------- |
| Clean             | none                                          | —                                                                 |
| Editing (unsaved) | `●` dot + "Unsaved" (`textMuted`)             | Navigating away prompts (existing `fileEditorDismissal`)          |
| Saving            | Spinner + "Saving…"                           | Input stays editable                                              |
| Saved             | `CircleCheck` + "Saved" for 2s, then clean    | Polite announcement only after a manual save                      |
| Save failed       | `CircleX` + "Couldn't save" + Retry (`error`) | Assertive announcement. Text is never discarded                   |
| Conflict          | `GitMerge` + "Changed elsewhere" (`warning`)  | Opens compare: Keep mine (new revision) / Take theirs / Copy mine |
| Read-only         | `Lock` + "Read-only"                          | Binary/large files, protected notes for agents                    |

## 7. Control interaction states

Token mapping for every interactive element. Values reference [DESIGN_TOKENS.md](DESIGN_TOKENS.md).

| State              | Primary (violet)                                                                         | Secondary / outline                             | Ghost (toolbar, sidebar row)                  | Tile / card                                  | Input                         |
| ------------------ | ---------------------------------------------------------------------------------------- | ----------------------------------------------- | --------------------------------------------- | -------------------------------------------- | ----------------------------- |
| Default            | `bg-primary text-primary-foreground`                                                     | `bg-secondary border-border`                    | transparent                                   | `bg-surface-raised border-border`            | `bg-transparent border-input` |
| Hover              | `messageActionHover`                                                                     | `toolbarControlHover`                           | `sidebarRowHover` / `toolbarControlHover`     | border → `input`, surface → `surfaceOverlay` | border → `input` + 8% fg mix  |
| Pressed            | hover + `inset 0 1px rgb(0 0 0/8%)` (existing)                                           | darker by one surface step                      | `sidebarRowActive`                            | scale 0.99 (`--motion-instant`)              | —                             |
| Focus-visible      | 2px `ring` + 1px offset `background` (existing button primitive)                         | same                                            | same, inset ring inside sidebar               | same                                         | `--glow-focus`                |
| Selected / current | —                                                                                        | `accentSurface` + `aria-pressed`/`aria-current` | `sidebarRowSelected` + 2px leading violet bar | `accentSurface` border `primary` 45%         | —                             |
| Disabled           | 64% opacity (existing `disabled:opacity-64`), label still readable, tooltip gives reason | same                                            | same                                          | same + `cursor-not-allowed`                  | same                          |
| Loading            | spinner replaces leading icon; width locked                                              | same                                            | same                                          | skeleton                                     | —                             |

Selection always uses **surface + indicator** (bar, check or pressed state), never color alone.

## 8. Empty, loading and error patterns

**Empty states** (existing `ui/empty`):

- Icon (20px, `iconMuted`), a title of eight words or fewer, a one-sentence description, and at most two actions.
- Write them in product language: "No notes yet", not "Nothing here!"
- The hero treatment (display type plus static glow) is reserved for **Project Home with no threads**.

**Loading:**

- Skeletons (existing `ui/skeleton`, duty-cycled shimmer) match the final layout's dimensions.
- Spinners only inside buttons or for sub-second inline work.
- After 10 seconds, swap the skeleton for "Still loading {thing}…" with a Retry action.

**Errors:**

| Error class        | Pattern                                            | Example copy                                                           |
| ------------------ | -------------------------------------------------- | ---------------------------------------------------------------------- |
| Recoverable, local | Inline under the control, `error` text + icon      | "Couldn't read branches. Retry"                                        |
| Surface-level      | `ui/alert` inside the surface, with cause + action | "Preview is only available in the Nebula desktop app. Open in browser" |
| Permission         | Distinct `Lock` icon and wording; never "error"    | "Signing in requires Manage access on {environment}."                  |
| Authentication     | Provider-specific; never generic                   | "{Provider} isn't signed in on {environment}."                         |
| Connection         | `WifiOff`, environment named                       | "devbox is offline. Work there is paused, not lost."                   |

Never show raw stack traces. Show server `message` text verbatim only inside a "Details" disclosure with a copy action.

## 9. Toasts and live regions

| Event                                    | Channel                                                                | Politeness         |
| ---------------------------------------- | ---------------------------------------------------------------------- | ------------------ |
| Provider check finished (user-initiated) | Inline status + live region                                            | polite             |
| Provider signed in / sign-in failed      | Inline outcome + live region. Toast (5s) only when the sheet is closed | polite / assertive |
| Sign-in attempt expires in 1 minute      | Live region (once), countdown text                                     | polite             |
| Approval needed (thread not focused)     | Sidebar pill (existing) + live region                                  | polite             |
| Save failed                              | Inline + live region                                                   | assertive          |
| Context switched                         | Toast (4s)                                                             | polite             |
| Provider update progress                 | Existing update notifications                                          | polite             |

Toasts never carry the only copy of important information, and never include account emails, tokens, login URLs or device codes.

## 10. Keyboard and focus model

**Existing shortcuts are preserved** (`packages/shared/src/keybindings.ts`): `mod+k` palette, `mod+p` files, `mod+shift+f` search, `mod+b` sidebar, `mod+j` terminal, `mod+alt+b` right panel, `mod+shift+j` preview, `mod+d` diff (outside terminal), `mod+shift+m` model picker, `mod+n` new thread, `mod+1…9` thread jump.

**Proposed new commands.** Register them in `DEFAULT_KEYBINDINGS`. **No default key unless it is conflict-free.** Default keys are a founder/Codex decision after a conflict check.

| Command id                       | Suggested key               | `when`           |
| -------------------------------- | --------------------------- | ---------------- |
| `providers.open`                 | none by default             | —                |
| `context.open` (Context popover) | none by default             | `!terminalFocus` |
| `composer.intent.next`           | `mod+shift+i` (verify free) | `composerFocus`  |
| `notes.new`                      | none by default             | `!terminalFocus` |
| `project.home`                   | none by default             | —                |

Focus rules:

- Dialogs and sheets trap focus and return it to the launcher on close.
- The tool tile grid uses arrow keys (existing `RightPanelEmptyState` behavior). Single-letter shortcuts (B/T/F/D/P/A) are active only while the grid has focus.
- The surface toggle group is one Tab stop with arrow-key navigation (`role="toolbar"`).
- Skip link "Skip to main content" is the first focusable element in the shell (proposed).
- The terminal owns all keys while focused except the documented escape chord (existing behavior).
