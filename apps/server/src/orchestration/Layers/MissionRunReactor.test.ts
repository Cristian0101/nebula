import { describe, expect, it } from "vite-plus/test";

import {
  activeReplacementOwnsProviderTurn,
  missionProviderTurnInFlight,
  providerSupportsStructuredReview,
} from "./MissionRunReactor.ts";

describe("MissionRunReactor recovery", () => {
  it("does not start a second remediation while the provider turn is in flight", () => {
    expect(
      missionProviderTurnInFlight({
        session: { status: "starting" },
        latestTurn: { state: "completed" },
      }),
    ).toBe(true);
    expect(
      missionProviderTurnInFlight({
        session: { status: "running" },
        latestTurn: { state: "running" },
      }),
    ).toBe(true);
    expect(
      missionProviderTurnInFlight({
        session: { status: "ready" },
        latestTurn: { state: "completed" },
      }),
    ).toBe(false);
  });

  it("keeps an in-flight replacement out of the original Task start path", () => {
    expect(
      activeReplacementOwnsProviderTurn(
        {
          attempts: [
            {
              kind: "replacement",
              status: "active",
            },
          ],
        },
        { session: { status: "starting" }, latestTurn: null },
      ),
    ).toBe(true);
  });

  it("routes independent review only to providers with structured generation", () => {
    expect(providerSupportsStructuredReview({ textGeneration: {} })).toBe(false);
    expect(
      providerSupportsStructuredReview({
        textGeneration: { generateStructured: () => undefined },
      }),
    ).toBe(true);
  });
});
