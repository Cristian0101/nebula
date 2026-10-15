import type { ProviderAuthenticationInput, ProviderAuthenticationStatus } from "@t3tools/contracts";
import { ProviderDriverKind } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import { ServerEnvironment } from "../environment/ServerEnvironment.ts";
import { ProviderInstanceRegistry } from "./Services/ProviderInstanceRegistry.ts";
import { unsupportedAuthentication } from "./providerAuthentication.ts";

/** Transport scope authorization runs before this resolver. No caller-supplied commands or paths. */
export const makeProviderAuthenticationRpc = Effect.gen(function* () {
  const instances = yield* ProviderInstanceRegistry;
  const environment = yield* ServerEnvironment;
  return (input: ProviderAuthenticationInput): Effect.Effect<ProviderAuthenticationStatus> =>
    Effect.gen(function* () {
      const descriptor = yield* environment.getDescriptor;
      const base = {
        environmentId: descriptor.environmentId,
        environmentLabel: descriptor.label,
        instanceId: input.instanceId,
        driver: ProviderDriverKind.make("unknown"),
      };
      if (input.environmentId !== descriptor.environmentId)
        return { ...base, ...unsupportedAuthentication("environment-mismatch") };
      const instance = yield* instances.getInstance(input.instanceId);
      if (!instance) return { ...base, ...unsupportedAuthentication("instance-unavailable") };
      const status = instance.authentication
        ? yield* instance.authentication.execute(input)
        : unsupportedAuthentication();
      // Reconfiguration/restart during a request invalidates the previous instance's response.
      if ((yield* instances.getInstance(input.instanceId)) !== instance) {
        return {
          ...base,
          driver: instance.driverKind,
          ...unsupportedAuthentication("provider-restarted"),
          state: "verification-needed",
        };
      }
      return { ...base, driver: instance.driverKind, ...status };
    });
});
