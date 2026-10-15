import * as Schema from "effect/Schema";
import { EnvironmentId, IsoDateTime } from "./baseSchemas.ts";
import { ProviderDriverKind, ProviderInstanceId } from "./providerInstance.ts";

export const ProviderAuthenticationCeremony = Schema.Literals([
  "browser",
  "device-code",
  "terminal",
]);
export type ProviderAuthenticationCeremony = typeof ProviderAuthenticationCeremony.Type;
export const ProviderAuthenticationState = Schema.Literals([
  "not-installed",
  "login-required",
  "available",
  "in-progress",
  "waiting-for-user",
  "authenticated",
  "cancelled",
  "failed",
  "expired",
  "unsupported",
  "verification-needed",
]);
export type ProviderAuthenticationState = typeof ProviderAuthenticationState.Type;
export const ProviderAuthenticationInput = Schema.Struct({
  environmentId: EnvironmentId,
  instanceId: ProviderInstanceId,
  operation: Schema.Literals(["begin", "status", "cancel", "refresh"]),
  ceremony: Schema.optionalKey(ProviderAuthenticationCeremony),
  // Cancellation is correlated to an attempt; a stale renderer cannot cancel its successor.
  attemptId: Schema.optionalKey(Schema.String),
});
export type ProviderAuthenticationInput = typeof ProviderAuthenticationInput.Type;
export const ProviderAuthenticationStatus = Schema.Struct({
  environmentId: EnvironmentId,
  environmentLabel: Schema.String,
  instanceId: ProviderInstanceId,
  driver: ProviderDriverKind,
  capability: Schema.Literals([
    "managed-app-server",
    "official-cli",
    "guided-terminal",
    "unsupported",
  ]),
  ceremonies: Schema.Array(ProviderAuthenticationCeremony),
  state: ProviderAuthenticationState,
  attemptId: Schema.NullOr(Schema.String),
  expiresAt: Schema.NullOr(IsoDateTime),
  verifiedAt: Schema.NullOr(IsoDateTime),
  reason: Schema.Literals([
    "none",
    "disabled",
    "unsupported",
    "environment-mismatch",
    "instance-unavailable",
    "missing-executable",
    "login-required",
    "process-failed",
    "timeout",
    "verification-failed",
    "cancelled",
    "stale-attempt",
    "api-override",
    "provider-restarted",
  ]),
  // Ephemeral ceremony data: never persist, log, put in history, or cache on disk.
  handoff: Schema.NullOr(
    Schema.Struct({
      url: Schema.String,
      userCode: Schema.optionalKey(Schema.String),
    }),
  ),
  // Display-only guidance; never executed by an RPC or interpolated into a shell.
  guidance: Schema.NullOr(Schema.String),
});
export type ProviderAuthenticationStatus = typeof ProviderAuthenticationStatus.Type;
