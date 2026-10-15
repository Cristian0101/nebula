import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import {
  EnvironmentId,
  ProviderInstanceId,
  ProviderDriverKind,
  type ProviderAuthenticationStatus,
} from "@t3tools/contracts";
import { reactHookHarness as hooks } from "../../test/reactHookHarness";

const client = vi.hoisted(() => ({
  scopes: ["access:write"],
  phase: "connected",
  generation: 1,
  execute: vi.fn(),
}));
const effects = vi.hoisted(() => {
  type Slot = { deps: readonly unknown[] | undefined; cleanup?: (() => void) | undefined };
  let index = 0;
  let slots: Slot[] = [];
  let work: (() => void)[] = [];
  return {
    begin() {
      index = 0;
    },
    use(callback: () => void | (() => void), deps?: readonly unknown[]) {
      const i = index++;
      const previous = slots[i];
      if (!previous || !deps || deps.some((value, n) => value !== previous.deps?.[n])) {
        work.push(() => {
          previous?.cleanup?.();
          slots[i] = { deps, cleanup: callback() ?? undefined };
        });
      }
    },
    flush() {
      const pending = work;
      work = [];
      pending.forEach((run) => run());
    },
    unmount() {
      slots.forEach((slot) => slot.cleanup?.());
      slots = [];
      work = [];
      index = 0;
    },
  };
});
vi.mock("react", async (original) => {
  const actual = await original<typeof import("react")>();
  const { reactHookHarness } = await import("../../test/reactHookHarness");
  return {
    ...actual,
    useState: reactHookHarness.useState,
    useRef: reactHookHarness.useRef,
    useCallback: reactHookHarness.useCallback,
    useEffect: effects.use,
  };
});
vi.mock("zustand", () => ({
  create: (initialize: () => unknown) => {
    let value = initialize();
    const hook = (select: (state: unknown) => unknown) => select(value);
    hook.getState = () => value;
    hook.setState = (update: (state: unknown) => unknown) => {
      value = { ...(value as object), ...(update(value) as object) };
    };
    return hook;
  },
}));
vi.mock("../../state/environments", () => ({
  useEnvironmentConnectionState: () => ({
    data: { phase: client.phase, generation: client.generation },
    error: null,
  }),
}));
vi.mock("../../state/session", () => ({
  useEnvironmentSessionState: () => ({
    data: { authenticated: true, scopes: client.scopes },
    hasError: false,
  }),
}));
vi.mock("../../state/server", () => ({ serverEnvironment: { providerAuthentication: {} } }));
vi.mock("../../state/use-atom-command", () => ({ useAtomCommand: () => client.execute }));
import {
  useProviderAuthenticationAttempt,
  useProviderConnectionAttempts,
} from "./useProviderAuthenticationAttempt";
const environmentId = EnvironmentId.make("synthetic-host");
const instanceId = ProviderInstanceId.make("codex");
const idle: ProviderAuthenticationStatus = {
  environmentId,
  instanceId,
  environmentLabel: "Synthetic host",
  driver: ProviderDriverKind.make("codex"),
  capability: "managed-app-server",
  ceremonies: ["browser", "device-code"],
  state: "login-required",
  reason: "login-required",
  attemptId: null,
  expiresAt: null,
  verifiedAt: null,
  handoff: null,
  guidance: null,
};
function waiting(): ProviderAuthenticationStatus {
  return {
    ...idle,
    state: "waiting-for-user",
    reason: "none",
    attemptId: "synthetic-attempt",
    expiresAt: new Date(Date.now() + 300000).toISOString(),
    handoff: { url: "https://auth.openai.com/synthetic", userCode: "XXXX-XXXX" },
  };
}
let foreground = true;
let revision: unknown;
function render() {
  hooks.beginRender();
  effects.begin();
  const result = useProviderAuthenticationAttempt({
    environmentId,
    instanceId,
    foreground,
    instanceRevision: revision,
  });
  effects.flush();
  return result;
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-15T20:00:00Z"));
  hooks.reset();
  vi.stubGlobal("window", globalThis);
  vi.stubGlobal("document", {
    visibilityState: "visible",
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  client.scopes = ["access:write"];
  client.phase = "connected";
  client.generation++;
  client.execute.mockReset();
  foreground = true;
  revision = undefined;
  useProviderConnectionAttempts.setState(() => ({ attempts: {} }));
  client.execute.mockResolvedValue({ _tag: "Success", value: waiting() });
});
afterEach(() => {
  effects.unmount();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe("shared authentication lifecycle boundaries", () => {
  it("ordinary execution scopes cannot begin, inspect, refresh or cancel login", async () => {
    client.scopes = ["orchestration:read", "orchestration:operate"];
    const hook = render();
    await hook.begin("browser");
    await hook.readStatus();
    await hook.refresh();
    await hook.cancel();
    expect(client.execute).not.toHaveBeenCalled();
    expect(hook.canManage).toBe(false);
  });
  it("keeps handoff only in the foreground presentation and polls background every 5s", async () => {
    await render().begin("device-code");
    expect(render().status?.handoff?.userCode).toBe("XXXX-XXXX");
    expect(JSON.stringify(useProviderConnectionAttempts.getState())).not.toMatch(
      /XXXX|handoff|auth.openai/,
    );
    foreground = false;
    expect(render().status?.handoff).toBeNull();
    client.execute.mockClear();
    await vi.advanceTimersByTimeAsync(4999);
    expect(client.execute).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(client.execute).toHaveBeenCalledTimes(1);
    expect(render().status?.handoff).toBeNull();
  });
  it.each(["disconnect", "permission", "generation", "instance"] as const)(
    "discards late replies after %s reset",
    async (cause) => {
      let release!: (value: unknown) => void;
      client.execute.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            release = resolve;
          }),
      );
      const pending = render().begin("browser");
      if (cause === "disconnect") client.phase = "backoff";
      if (cause === "permission") client.scopes = [];
      if (cause === "generation") client.generation++;
      if (cause === "instance") revision = {};
      render();
      release({ _tag: "Success", value: waiting() });
      await pending;
      expect(render().status?.handoff ?? null).toBeNull();
      expect(JSON.stringify(useProviderConnectionAttempts.getState())).not.toContain(
        "synthetic-attempt",
      );
    },
  );
  it("allows fresh status for a replaced instance while its predecessor is pending", async () => {
    let release!: (value: unknown) => void;
    client.execute.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const pending = render().begin("browser");
    revision = {};
    render();
    client.execute.mockResolvedValueOnce({ _tag: "Success", value: idle });
    await render().readStatus();
    expect(render().status?.state).toBe("login-required");
    release({ _tag: "Success", value: waiting() });
    await pending;
    expect(render().status?.state).toBe("login-required");
  });
  it("polls foreground at 1s, stops after completion, and never promotes readiness", async () => {
    await render().begin("browser");
    render();
    client.execute.mockClear();
    await vi.advanceTimersByTimeAsync(1000);
    expect(client.execute).toHaveBeenCalledTimes(1);
    client.execute.mockResolvedValueOnce({
      _tag: "Success",
      value: { ...idle, state: "authenticated", reason: "none" },
    });
    await render().refresh();
    expect(render().status?.handoff).toBeNull();
    client.execute.mockClear();
    await vi.advanceTimersByTimeAsync(10000);
    expect(client.execute).not.toHaveBeenCalled();
  });
  it("clears handoff on transport failure and suspends polling until explicit retry", async () => {
    await render().begin("browser");
    render();
    client.execute.mockResolvedValueOnce({ _tag: "Failure", cause: "private raw error" });
    await render().readStatus();
    expect(render().status?.handoff).toBeNull();
    expect(render().error).toBe(true);
    client.execute.mockClear();
    await vi.advanceTimersByTimeAsync(10000);
    expect(client.execute).not.toHaveBeenCalled();
  });
  it("correlates cancellation and refresh to the current exact host and attempt", async () => {
    await render().begin("browser");
    render();
    await render().cancel();
    expect(client.execute).toHaveBeenLastCalledWith({
      environmentId,
      input: { environmentId, instanceId, operation: "cancel", attemptId: "synthetic-attempt" },
    });
  });
  it("ignores a mismatched host/instance response", async () => {
    client.execute.mockResolvedValueOnce({
      _tag: "Success",
      value: { ...waiting(), instanceId: ProviderInstanceId.make("other-instance") },
    });
    await render().begin("browser");
    expect(render().error).toBe(true);
    expect(render().status).toBeNull();
  });
  it("stops timers and discards metadata on unmount", async () => {
    await render().begin("browser");
    render();
    effects.unmount();
    client.execute.mockClear();
    await vi.advanceTimersByTimeAsync(10000);
    expect(client.execute).not.toHaveBeenCalled();
    expect(useProviderConnectionAttempts.getState().attempts).toEqual({});
  });
  it("expires locally, discards the code, and sends no status RPC past the deadline", async () => {
    client.execute.mockResolvedValueOnce({
      _tag: "Success",
      value: { ...waiting(), expiresAt: new Date(Date.now() + 1000).toISOString() },
    });
    await render().begin("device-code");
    render();
    client.execute.mockClear();
    await vi.advanceTimersByTimeAsync(1001);
    expect(render().status?.state).toBe("expired");
    expect(render().status?.handoff).toBeNull();
    await vi.advanceTimersByTimeAsync(10000);
    expect(client.execute).not.toHaveBeenCalled();
  });
  it("reopening obtains a ceremony only through a fresh authorized status request", async () => {
    await render().begin("device-code");
    render();
    foreground = false;
    render();
    foreground = true;
    expect(render().status?.handoff).toBeNull();
    await render().readStatus();
    expect(render().status?.handoff?.userCode).toBe("XXXX-XXXX");
  });
  it("observes a hidden document at the bounded background rate", async () => {
    vi.stubGlobal("document", {
      visibilityState: "hidden",
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    await render().begin("browser");
    render();
    client.execute.mockClear();
    await vi.advanceTimersByTimeAsync(4999);
    expect(client.execute).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(client.execute).toHaveBeenCalledTimes(1);
  });
  it.each([null, "not-a-timestamp"])(
    "does not poll an active response without a valid expiry: %s",
    async (expiresAt) => {
      client.execute.mockResolvedValueOnce({ _tag: "Success", value: { ...waiting(), expiresAt } });
      await render().begin("browser");
      expect(render().status?.state).toBe("verification-needed");
      expect(render().status?.handoff).toBeNull();
      client.execute.mockClear();
      await vi.advanceTimersByTimeAsync(10000);
      expect(client.execute).not.toHaveBeenCalled();
    },
  );
});
