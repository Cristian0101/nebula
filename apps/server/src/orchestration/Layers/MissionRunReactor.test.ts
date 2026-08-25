import { describe, expect, it } from "vite-plus/test";

import {
  activeReplacementOwnsProviderTurn,
  isRequiredGateFailureStatus,
  missionProviderTurnInFlight,
  providerSupportsStructuredReview,
  reviewSnapshotCoversLatestTurn,
  shouldReconcileMissionRunEventType,
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

  it("does not treat historical stale gates as fresh failures", () => {
    expect(isRequiredGateFailureStatus("stale")).toBe(false);
    expect(isRequiredGateFailureStatus("failed")).toBe(true);
    expect(isRequiredGateFailureStatus("timed_out")).toBe(true);
  });

  it("does not reuse a review snapshot that predates the latest remediation turn", () => {
    expect(
      reviewSnapshotCoversLatestTurn(
        { reviewSnapshot: { capturedAt: "2026-08-25T13:52:48.638Z" } },
        { latestTurn: { requestedAt: "2026-08-25T13:53:26.551Z" } },
      ),
    ).toBe(false);
    expect(
      reviewSnapshotCoversLatestTurn(
        { reviewSnapshot: { capturedAt: "2026-08-25T13:54:37.900Z" } },
        { latestTurn: { requestedAt: "2026-08-25T13:53:26.551Z" } },
      ),
    ).toBe(true);
  });

  it("does not wake the scheduler from its own reconciliation output", () => {
    expect(shouldReconcileMissionRunEventType("mission.run.reconciled")).toBe(false);
    expect(shouldReconcileMissionRunEventType("integration.updated")).toBe(true);
  });
});
