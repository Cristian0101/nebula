# Provider authentication dogfood

Automated acceptance uses fake providers and synthetic processes. Real-account login is a separate approval gate: obtain explicit approval naming the execution host, provider instance and route. Do not run paid turns to establish connection status.

1. Confirm the host, instance, installed executable/version, provider-owned home/config directory, and override names without exposing values. Check whether another provider application shares the store. Never log out or revoke shared authentication as setup.
2. Use fresh task-owned Nebula state and an administrative session with `access:write`. Keep pairing data private. Verify ordinary execution credentials are denied the authentication RPC.
3. Codex: inspect the installed schema, approve browser login, complete it privately, then verify correlated completion, fresh account/read and E1 readiness. Separately approve device-code testing if supported. Cancel an unfinished attempt and confirm unrelated processes continue running.
4. Cursor: confirm the configured executable is Cursor, start official CLI login, complete the private browser handoff, and inspect fresh readiness. Test cancellation and failure. Do not infer X migration, model entitlement or third-party subscription coverage.
5. Claude: use the official user-controlled terminal flow with the same executable, environment and `CLAUDE_CONFIG_DIR` as the selected instance. Review API/token/helper/cloud-provider precedence. Do not use setup-token, extract credentials, implement OAuth, or choose Console/API billing without separate authorization. Check fresh official status afterward and record current applicable provider guidance.
6. Reconnect the client, restart only the task-owned host, and replace a fixture instance. Old active state must become unverified. Test another host/instance to confirm identity isolation. Simulate expiry with fixtures; never invalidate a real shared login merely to test recovery.
7. Retain only redacted versions, identity, outcomes and readiness facts. Never retain URLs, device codes, credentials or pairing screens. Report deterministic, real-account, desktop/browser and hosted/release evidence separately.

Stop at unsupported flows, missing account authorization or paid-execution boundaries. E3 is outside this procedure.

## Bounded approval matrix

Approve each route separately with the exact execution host and provider instance. Each managed
attempt has a five-minute bound. Record only versions, identity, timestamps, redacted outcomes and
independent E1 readiness facts; never retain ceremony URLs, codes or account credentials.

| Provider / route                   | Acceptance after explicit approval                                                                                                                          | Boundaries                                                                                                                                                               |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Codex / App Server ChatGPT browser | One private ceremony, correlated completion, fresh `account/read` and E1 readiness; cancel only the owned unfinished attempt when approved.                 | Default launch configuration and installed protocol support required. No logout, API fallback or inference.                                                              |
| Codex / device code                | Separately approved private device-code ceremony, correlated completion and fresh readiness.                                                                | Never retain the URL/code. Test expiry with fixtures rather than invalidating a shared login.                                                                            |
| Cursor / official CLI browser      | Verify the executable is Cursor; fixed `login` with `NO_OPEN_BROWSER=1`, private handoff, then fresh about/ACP readiness.                                   | No X Subscription migration, model entitlement or third-party coverage claim. No paid turn.                                                                              |
| Claude / user-controlled terminal  | Verify executable, environment, `CLAUDE_CONFIG_DIR`, shared-store effects and override names; human completes official login, then fresh structured status. | Review current official eligibility guidance. No token extraction, SDK OAuth implementation or automatic Console/API selection. Cancel tracking and terminal separately. |

Reconnect or restart only the task-owned Nebula environment, then verify identity and fresh status.
Use synthetic instances for replacement and recovery. Existing shared provider stores and applications
must remain untouched by setup or cleanup.
