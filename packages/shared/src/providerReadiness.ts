import type { EnvironmentId, ProviderInstanceId, ServerProvider } from "@t3tools/contracts";

export type ReadinessFact = "verified" | "blocked" | "unknown";
export const PROVIDER_READINESS_MAX_AGE_MS = 5 * 60 * 1000;

/** A display projection of the existing registry, never permission or execution authority. */
export function deriveProviderReadiness(input: {
  readonly environmentId: EnvironmentId;
  readonly instanceId: ProviderInstanceId;
  readonly snapshot?:
    | { readonly environmentId: EnvironmentId; readonly provider: ServerProvider }
    | undefined;
  readonly connected: boolean;
  readonly selectedModel?: string | undefined;
  readonly now: number;
}) {
  const candidate = input.snapshot;
  const provider =
    candidate?.environmentId === input.environmentId &&
    candidate.provider.instanceId === input.instanceId
      ? candidate.provider
      : undefined;
  const verifiedAt = provider?.inspection?.verifiedAt ?? null;
  const age = verifiedAt === null ? NaN : input.now - Date.parse(verifiedAt);
  const fresh =
    input.connected &&
    provider?.inspection?.status === "completed" &&
    Number.isFinite(age) &&
    age >= 0 &&
    age <= PROVIDER_READINESS_MAX_AGE_MS;
  const registered: ReadinessFact = !provider
    ? "unknown"
    : provider.availability === "unavailable"
      ? "blocked"
      : "verified";
  const installed: ReadinessFact = !fresh
    ? "unknown"
    : provider?.installed
      ? provider.version
        ? "verified"
        : "unknown"
      : "blocked";
  const authentication: ReadinessFact = !fresh
    ? "unknown"
    : provider?.auth.status === "authenticated"
      ? "verified"
      : provider?.auth.status === "unauthenticated"
        ? "blocked"
        : "unknown";
  const account: ReadinessFact =
    authentication === "verified" && provider?.auth.accountVerified === true
      ? "verified"
      : "unknown";
  const subscriptionEntitlement: ReadinessFact =
    authentication === "verified" && provider?.auth.subscriptionEntitlement === "verified"
      ? "verified"
      : "unknown";
  const billingRoute =
    authentication === "verified" ? (provider?.auth.billingRoute ?? "unknown") : "unknown";
  const selectedModel =
    input.selectedModel ?? provider?.models.find((model) => model.isDefault)?.slug;
  const model = provider?.models.find((entry) => entry.slug === selectedModel);
  // Static lists, custom slugs and legacy caches are not account-level model discovery.
  const modelAvailability: ReadinessFact =
    !fresh ||
    authentication !== "verified" ||
    !selectedModel ||
    provider?.modelCatalogSource !== "provider" ||
    model?.isCustom
      ? "unknown"
      : model
        ? "verified"
        : "blocked";
  const runtime: ReadinessFact =
    !input.connected ||
    registered === "blocked" ||
    provider?.enabled === false ||
    installed === "blocked" ||
    authentication === "blocked" ||
    modelAvailability === "blocked" ||
    (fresh && provider?.status === "error")
      ? "blocked"
      : fresh &&
          installed === "verified" &&
          authentication === "verified" &&
          provider?.status === "ready"
        ? "verified"
        : "unknown";
  const headline = !input.connected
    ? "Environment disconnected"
    : registered === "blocked"
      ? "Provider driver unavailable"
      : provider?.enabled === false
        ? "Disabled in Nebula"
        : !fresh
          ? "Verification needed"
          : installed === "blocked"
            ? "Not installed"
            : authentication === "blocked"
              ? "Sign in required"
              : authentication === "unknown"
                ? "Sign-in not verified"
                : modelAvailability === "blocked"
                  ? "Selected model unavailable"
                  : runtime === "blocked"
                    ? "Runtime unavailable"
                    : runtime === "unknown"
                      ? "Runtime not verified"
                      : "Preflight checks passed";
  return {
    environmentId: input.environmentId,
    instanceId: input.instanceId,
    registered,
    installed,
    authentication,
    account,
    subscriptionEntitlement,
    billingRoute,
    modelAvailability,
    runtime,
    verifiedAt,
    fresh,
    headline,
  } as const;
}

export type ProviderReadiness = ReturnType<typeof deriveProviderReadiness>;
