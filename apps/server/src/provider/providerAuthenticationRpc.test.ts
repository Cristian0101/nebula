import { assert, it } from "@effect/vitest";
import {
  EnvironmentId,
  ProviderInstanceId,
  ProviderDriverKind,
  WS_METHODS,
  type ExecutionEnvironmentDescriptor,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { requiredScopeForRpcMethod } from "../auth/RpcAuthorization.ts";
import { ServerEnvironment } from "../environment/ServerEnvironment.ts";
import type { ProviderInstance } from "./ProviderDriver.ts";
import { ProviderInstanceRegistry } from "./Services/ProviderInstanceRegistry.ts";
import { makeProviderAuthenticationRpc } from "./providerAuthenticationRpc.ts";
import { unsupportedAuthentication } from "./providerAuthentication.ts";

const descriptor = (id: string): ExecutionEnvironmentDescriptor => ({
  environmentId: EnvironmentId.make(id),
  label: `Execution host ${id}`,
  platform: { os: "linux", arch: "x64" },
  serverVersion: "test",
  capabilities: { repositoryIdentity: true },
});
it.effect(
  "scopes attempts to the exact environment and provider instance and invalidates replaced instances",
  () =>
    Effect.gen(function* () {
      let calls = 0;
      let instance: ProviderInstance | undefined;
      const first = {
        instanceId: ProviderInstanceId.make("personal"),
        driverKind: ProviderDriverKind.make("cursor"),
        authentication: {
          execute: () =>
            Effect.sync(() => {
              calls++;
              return { ...unsupportedAuthentication(), capability: "official-cli" as const };
            }),
        },
      } as unknown as ProviderInstance;
      instance = first;
      const resolve = yield* makeProviderAuthenticationRpc.pipe(
        Effect.provide(
          Layer.mergeAll(
            Layer.mock(ServerEnvironment)({ getDescriptor: Effect.succeed(descriptor("host-a")) }),
            Layer.mock(ProviderInstanceRegistry)({
              getInstance: (id) =>
                Effect.sync(() => (id === instance?.instanceId ? instance : undefined)),
            }),
          ),
        ),
      );
      const base = {
        environmentId: EnvironmentId.make("host-a"),
        instanceId: ProviderInstanceId.make("personal"),
        operation: "begin" as const,
      };
      assert.equal(
        (yield* resolve({ ...base, environmentId: EnvironmentId.make("host-b") })).reason,
        "environment-mismatch",
      );
      assert.equal(
        (yield* resolve({ ...base, instanceId: ProviderInstanceId.make("work") })).reason,
        "instance-unavailable",
      );
      assert.equal(calls, 0);
      const response = yield* resolve(base);
      assert.equal(response.environmentId, "host-a");
      assert.equal(response.instanceId, "personal");
      assert.equal(response.driver, "cursor");
      assert.equal(calls, 1);
      instance = {
        ...first,
        authentication: {
          execute: () =>
            Effect.sync(() => {
              instance = undefined;
              return unsupportedAuthentication();
            }),
        },
      };
      assert.equal((yield* resolve(base)).reason, "provider-restarted");
    }),
);

it("requires account management rather than provider execution authority", () => {
  assert.equal(requiredScopeForRpcMethod(WS_METHODS.serverProviderAuthentication), "access:write");
});
