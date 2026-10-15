import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { EnvironmentId, ProviderInstanceId } from "@t3tools/contracts";
import { ProviderAuthenticationControls } from "./ProviderAuthenticationControls";

const state = vi.hoisted(() => ({ scopes: [] as string[], execute: vi.fn() }));
vi.mock("../../state/session", () => ({
  useEnvironmentSessionState: () => ({
    data: { authenticated: true, scopes: state.scopes },
    hasError: false,
  }),
}));
vi.mock("../../state/server", () => ({ serverEnvironment: { providerAuthentication: {} } }));
vi.mock("../../state/use-atom-command", () => ({ useAtomCommand: () => state.execute }));

describe("bounded provider authentication controls", () => {
  beforeEach(() => {
    state.scopes = [];
    state.execute.mockClear();
  });
  const render = () =>
    renderToStaticMarkup(
      <ProviderAuthenticationControls
        environmentId={EnvironmentId.make("remote-host")}
        instanceId={ProviderInstanceId.make("work-account")}
      />,
    );
  it("keeps execution credentials out of account management", () => {
    state.scopes = ["orchestration:read", "orchestration:operate", "terminal:operate"];
    const markup = render();
    expect(markup).toContain("Manage access permission");
    expect(markup).not.toContain(">Sign in<");
    expect(state.execute).not.toHaveBeenCalled();
  });
  it("shows host and instance identity and waits for a deliberate status request", () => {
    state.scopes = ["access:write"];
    const markup = render();
    expect(markup).toContain("remote-host");
    expect(markup).toContain("work-account");
    expect(markup).toContain("Check status");
    expect(markup).toContain("other environments have separate authentication");
    expect(state.execute).not.toHaveBeenCalled();
  });
});
