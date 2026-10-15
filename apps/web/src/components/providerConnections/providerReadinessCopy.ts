import type { ProviderAuthenticationStatus } from "@t3tools/contracts";
import type { ProviderReadiness, ReadinessFact } from "@t3tools/shared/providerReadiness";

export const READINESS_FACTS = [
  ["registered", "Registered driver"],
  ["installed", "Executable installed"],
  ["authentication", "Sign-in"],
  ["account", "Account identity"],
  ["subscriptionEntitlement", "Subscription entitlement"],
  ["modelAvailability", "Selected/default model"],
  ["runtime", "Runtime preflight"],
] as const;
export type FactKey = (typeof READINESS_FACTS)[number][0];
const FACT_COPY: Record<FactKey, Record<ReadinessFact, string>> = {
  registered: {
    verified: "Driver available",
    blocked: "Driver unavailable in this build",
    unknown: "Not reported",
  },
  installed: { verified: "Installed", blocked: "Not installed", unknown: "Not verified" },
  authentication: { verified: "Signed in", blocked: "Signed out", unknown: "Not verified" },
  account: { verified: "Verified", blocked: "Not reported", unknown: "Not reported" },
  subscriptionEntitlement: {
    verified: "Verified",
    blocked: "Not verified",
    unknown: "Not verified",
  },
  modelAvailability: {
    verified: "Available",
    blocked: "Model not offered to this account",
    unknown: "Not verified",
  },
  runtime: { verified: "Preflight passed", blocked: "Blocked", unknown: "Not verified" },
};
export const factCopy = (key: FactKey, fact: ReadinessFact) => FACT_COPY[key][fact];
export const BILLING_COPY: Record<ProviderReadiness["billingRoute"], string> = {
  subscription: "Provider subscription",
  api: "API billing",
  "provider-managed": "Provider managed",
  unknown: "Not reported",
};
export const LIFECYCLE_COPY: Record<ProviderAuthenticationStatus["state"], string> = {
  "not-installed": "Not installed",
  "login-required": "Sign-in required",
  available: "Ready to sign in",
  "in-progress": "Starting sign-in",
  "waiting-for-user": "Waiting for you",
  authenticated: "Signed in",
  cancelled: "Sign-in cancelled",
  failed: "Sign-in didn't complete",
  expired: "Sign-in expired",
  unsupported: "Sign-in not available here",
  "verification-needed": "Verification needed",
};
export const RECOVERY_COPY: Record<ProviderAuthenticationStatus["reason"], string> = {
  none: "Authentication and subscription entitlement are separate facts.",
  disabled: "Enable this provider instance before signing in.",
  unsupported:
    "Interactive login is not supported by this provider or installed protocol. Use its official tools, then refresh readiness.",
  "environment-mismatch":
    "The execution host changed. Showing the current host; check status again.",
  "instance-unavailable":
    "This provider instance is unavailable. Return to all providers and check its configuration.",
  "missing-executable":
    "Install the official CLI or correct this instance's executable path on the selected host.",
  "login-required": "Sign in with the provider's official flow on this execution host.",
  "process-failed":
    "The official login process stopped before finishing. Check the CLI version, network and configuration, then try again.",
  timeout: "This sign-in expired after 5 minutes. Start a new sign-in.",
  "verification-failed":
    "The last check couldn't finish. Check status before relying on the connection.",
  cancelled:
    "Your existing provider sign-in, if any, wasn't changed. Shared provider authentication was not logged out.",
  "stale-attempt":
    "This sign-in changed in another window. Check its current status before cancelling again.",
  "api-override":
    "An API or external credential override takes precedence over account sign-in. Review it on the execution host. Nebula will not remove it or switch billing automatically.",
  "provider-restarted":
    "The provider restarted or has not yet been checked. Request fresh verification.",
};
export function verificationCopy(readiness: ProviderReadiness, now: number) {
  if (!readiness.verifiedAt) return "Never checked";
  const age = now - Date.parse(readiness.verifiedAt);
  if (!Number.isFinite(age) || age < 0) return "Verification needed";
  const relative = age < 60_000 ? "just now" : `${Math.floor(age / 60_000)} min ago`;
  return `${readiness.fresh ? "Checked" : "Verification expired · checked"} ${relative}`;
}
