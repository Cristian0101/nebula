# Provider Connections

Open **Provider Connections** from the sidebar, the command palette, a provider warning, the
composer's recovery link, the model picker, or Provider Settings. The toolbar also offers
**Connect providers** while an enabled primary provider has an actionable problem.

Connections opens over the current route. The project, checkout and composer draft remain in
place. Escape closes the sheet without cancelling a sign-in. **All providers** returns from a
detail to the list. On screens at least 1920 pixels wide, the list and detail share the sheet.

## Execution host and permissions

Choose the execution host before signing in. Each host and provider instance has separate
configuration and authentication. Changing the host never changes the project's execution host.

| Action                                            | Existing scope          |
| ------------------------------------------------- | ----------------------- |
| Read readiness                                    | `orchestration:read`    |
| Check providers                                   | `orchestration:operate` |
| Inspect, begin, cancel or refresh account sign-in | `access:write`          |

Connections never requests or upgrades these permissions. A disconnected host cannot check or
manage accounts. Cached readiness remains visible as unverified when the session has Read access.

On opening, stale enabled instances are checked once, at most once per minute per instance.
**Check all** requests the existing provider refresh explicitly. Neither operation sends a paid
inference request.

## Readiness and billing

Installation, authentication, account identity, reported billing route, subscription entitlement,
model availability and runtime preflight are independent facts. Connections composes the existing
`deriveProviderReadiness`; registration alone does not mean an account is connected.

**Ready** means **Preflight passed**. It does not prove a successful inference. A successful login
does not prove model access, included usage or subscription entitlement. Plan labels are displayed
only as provider reports. Verification older than five minutes is neutral **Verification expired**,
not a problem counted under **Needs attention**. Disabled instances do not inflate triage counts.

## Official sign-in

- **Codex:** the existing managed App Server offers browser and device-code ceremonies when its
  configuration supports them. Remote hosts prefer device code. Custom launch configurations may
  require the provider's own tools instead.
- **Cursor:** the existing lifecycle runs the configured official Cursor executable's login.
  An executable named `agent` is not assumed to be Cursor. X Subscription migration remains unknown.
- **Claude:** follow the numbered instructions in your own terminal on the selected host. The
  executable, configuration directory and fixed `auth login` subcommand are displayed separately.
  Nebula does not compose a shell command, open Claude OAuth or collect provider tokens. Stop
  tracking does not cancel a CLI you started yourself. Plan eligibility in third-party applications
  remains subject to Anthropic's terms and is not verified by Nebula.
- **Other drivers:** use their official tools and check readiness. No unsupported managed login is
  invented for Grok, Antigravity, OpenCode or custom drivers.

A sign-in handoff opens only after a click. Its host name is visible; the private URL is not printed.
Device codes are masked until revealed. Handoff data stays in the mounted presentation and is
cleared on expiry, completion, disconnect, permission loss, host or instance replacement, or close.
It never enters navigation, browser storage, diagnostics, notifications or the volatile status
mirror. Reopening reads current status from the authorized host; it does not restore a saved code.
Foreground attempts poll once per second; background observation is limited to once every five
seconds and stops on completion, expiry, disconnect or unmount.

Use **Advanced Provider Settings** for executable paths, enablement, model configuration and other
provider configuration. Diagnostics omit account identities, handoff URLs, codes and attempt IDs.
Existing API or external credential overrides are never removed, and billing is never switched
automatically.

The visual reference is D0.2 at
[`a275bc24489dc246e9de1686a23797fbb401e016`](https://github.com/Cristian0101/nebula/tree/a275bc24489dc246e9de1686a23797fbb401e016/docs/nebula/super-ade).
E3 uses the active theme and does not change the application theme default.
