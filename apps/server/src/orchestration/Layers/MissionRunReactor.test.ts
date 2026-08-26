import { describe, expect, it } from "vite-plus/test";

import {
  activeReplacementOwnsProviderTurn,
  isRequiredGateFailureStatus,
  missionProviderTurnInFlight,
  providerExecutionFailureDetail,
  providerSupportsStructuredReview,
  reviewSnapshotCoversLatestTurn,
  shouldReconcileMissionRunEventType,
  taskActivationCommandPhase,
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

  it("treats a terminal provider authentication response as execution failure evidence", () => {
    expect(
      providerExecutionFailureDetail({
        latestTurn: { turnId: "turn-1", state: "completed" },
        session: { status: "ready", lastError: null },
        messages: [
          {
            turnId: "turn-1",
            role: "assistant",
            text: "Failed to authenticate. API Error: 401 OAuth access token has expired.",
          },
        ],
      } as never),
    ).toContain("Failed to authenticate");
    expect(
      providerExecutionFailureDetail({
        latestTurn: { turnId: "turn-1", state: "completed" },
        session: { status: "ready", lastError: null },
        messages: [{ turnId: "turn-1", role: "assistant", text: "Implemented the module." }],
      } as never),
    ).toBeNull();
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

  it("opens a fresh activation command epoch after ownership is revalidated", () => {
    const initial = taskActivationCommandPhase({
      updatedAt: "2026-08-25T13:52:00.000Z",
      ownership: {
        validatedAt: "2026-08-25T13:52:01.000Z",
        updatedAt: "2026-08-25T13:52:01.000Z",
      },
    } as never);
    const retried = taskActivationCommandPhase({
      updatedAt: "2026-08-25T13:52:00.000Z",
      ownership: {
        validatedAt: "2026-08-25T13:53:01.000Z",
        updatedAt: "2026-08-25T13:53:01.000Z",
      },
    } as never);

    expect(initial).not.toBe(retried);
    expect(
      taskActivationCommandPhase({
        updatedAt: "2026-08-25T13:52:00.000Z",
        ownership: null,
      } as never),
    ).toBe("activate:2026-08-25T13:52:00.000Z");
  });
});
