import type { ProviderAuthenticationStatus } from "@t3tools/contracts";
import type { ProviderReadiness } from "@t3tools/shared/providerReadiness";
import { verificationCopy } from "./providerReadinessCopy";
export type ConnectionGroup =
  | "ready"
  | "attention"
  | "signing-in"
  | "unverified"
  | "off"
  | "disconnected";
export type ConnectionAction =
  | "details"
  | "sign-in"
  | "check"
  | "settings"
  | "models"
  | "install"
  | null;
export interface ConnectionStatus {
  icon: "check" | "alert" | "waiting" | "unverified" | "off" | "disconnected";
  group: ConnectionGroup;
  label: string;
  subline: string;
  tone: "success" | "destructive" | "warning" | "muted" | "info";
  primaryAction: ConnectionAction;
  actionLabel: string | null;
}
export type AuthenticationMetadata = Omit<ProviderAuthenticationStatus, "handoff" | "guidance">;
export function deriveProviderConnectionStatus(input: {
  readiness: ProviderReadiness;
  lifecycle?: AuthenticationMetadata | null;
  connected: boolean;
  enabled: boolean;
  canManage: boolean;
  canOperate: boolean;
  capabilityAvailable: boolean;
  preparing?: boolean;
  now: number;
}): ConnectionStatus {
  const { readiness: r, lifecycle: l } = input;
  const result = (
    group: ConnectionGroup,
    label: string,
    tone: ConnectionStatus["tone"],
    primaryAction: ConnectionAction = null,
    actionLabel: string | null = null,
    subline = "",
  ): ConnectionStatus => ({
    icon: (
      {
        ready: "check",
        attention: "alert",
        "signing-in": "waiting",
        unverified: "unverified",
        off: "off",
        disconnected: "disconnected",
      } as const
    )[group],
    group,
    label,
    tone,
    primaryAction,
    actionLabel,
    subline,
  });
  if (!input.connected) return result("disconnected", "Disconnected", "muted");
  if (input.preparing || l?.state === "in-progress" || l?.state === "waiting-for-user")
    return result(
      "signing-in",
      l?.state === "waiting-for-user" ? "Waiting for you" : "Starting sign-in",
      "info",
      "details",
      "Continue sign-in",
    );
  if (!input.enabled) return result("off", "Disabled", "muted", "settings", "Enable in Settings");
  if (r.registered === "blocked")
    return result(
      "attention",
      "Driver unavailable",
      "destructive",
      "settings",
      "Open Provider Settings",
    );
  if (l?.state === "verification-needed" && l.reason === "api-override")
    return result(
      "attention",
      "API credential overrides sign-in",
      "warning",
      "settings",
      "Review in Settings",
    );
  if (r.runtime === "verified")
    return result("ready", "Ready", "success", null, null, "Preflight passed");
  if (r.runtime === "blocked") {
    if (r.installed === "blocked")
      return result("attention", "Not installed", "destructive", "install", "Install guide");
    if (r.authentication === "blocked")
      return result(
        "attention",
        "Sign-in required",
        "warning",
        input.canManage ? "sign-in" : null,
        input.canManage
          ? input.capabilityAvailable && l?.ceremonies.length
            ? "Sign in"
            : "How to sign in"
          : null,
        input.canManage ? "" : "Needs Manage access",
      );
    if (r.modelAvailability === "blocked")
      return result("attention", "Model not offered", "warning", "models", "Choose another model");
    return result(
      "attention",
      r.headline,
      "destructive",
      input.canOperate ? "check" : "settings",
      input.canOperate ? "Check again" : "Open Provider Settings",
    );
  }
  return result(
    "unverified",
    !r.fresh
      ? r.verifiedAt
        ? "Verification expired"
        : "Not verified yet"
      : r.authentication === "unknown"
        ? "Sign-in not verified"
        : "Runtime not verified",
    "muted",
    input.canOperate ? "check" : null,
    input.canOperate ? "Check again" : null,
    verificationCopy(r, input.now),
  );
}
