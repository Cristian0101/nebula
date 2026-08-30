import { describe, expect, it } from "vite-plus/test";

import {
  activeExecutionAttemptOwnsProviderTurn,
  activeReplacementOwnsProviderTurn,
  beginReviewRemediationAttempt,
  finalizeAttemptForAttention,
  finalizeSuccessfulProviderExecution,
  finalizeTerminalTaskAttempts,
  interruptRestartedReplacementAttempt,
  interruptedReplacementRequiresAttention,
  isRequiredGateFailureStatus,
  missionProviderTurnInFlight,
  needsTerminalThreadHydration,
  providerCapabilityMismatchForAttempt,
  providerExecutionFailureDetail,
  providerSupportsStructuredReview,
  refreshProviderEscalationAvailability,
  replacementAttemptNeedsProjectionContinuation,
  replacementAttemptNeedsTurnStart,
  replacementAttemptOwnsTurnStart,
  reviewSnapshotCoversLatestTurn,
  shouldReconcileMissionRunEvent,
  shouldReconcileMissionRunEventType,
  shouldInterruptCancelledTaskProvider,
  taskActivationCommandPhase,
} from "./MissionRunReactor.ts";

describe("MissionRunReactor recovery", () => {
  const recoveryState = (overrides: Record<string, unknown> = {}) =>
    ({
      taskId: "task-a",
      transientRetries: 0,
      remediationRounds: 0,
      attempts: [
        {
          number: 1,
          kind: "initial",
          providerInstanceId: "claude",
          threadId: "thread-a",
          status: "active",
          failureClass: null,
          summary: "Initial execution.",
          startedAt: "2026-08-29T12:00:00.000Z",
          completedAt: null,
        },
      ],
      latestFailureClass: null,
      latestFailureSignature: null,
      attentionRequired: false,
      updatedAt: "2026-08-29T12:00:00.000Z",
      ...overrides,
    }) as never;

  it("finalizes the active attempt when its canonical Task completes", () => {
    const [state] = finalizeTerminalTaskAttempts({
      recovery: [recoveryState()],
      tasks: [
        {
          id: "task-a" as never,
          status: "completed",
          completedAt: "2026-08-29T12:05:00.000Z",
          cancelledAt: null,
          updatedAt: "2026-08-29T12:05:00.000Z",
        },
      ],
    });
    expect(state?.attempts).toEqual([
      expect.objectContaining({
        number: 1,
        status: "completed",
        completedAt: "2026-08-29T12:05:00.000Z",
      }),
    ]);
  });

  it("clears stale attention when a canonical Task is already terminal", () => {
    const [state] = finalizeTerminalTaskAttempts({
      recovery: [
        recoveryState({
          attempts: [
            {
              number: 1,
              kind: "replacement",
              providerInstanceId: "codex",
              threadId: "thread-a",
              status: "interrupted",
              failureClass: "transport_transient",
              summary: "Provider process did not survive restart.",
              startedAt: "2026-08-29T12:00:00.000Z",
              completedAt: "2026-08-29T12:01:00.000Z",
            },
          ],
          attentionRequired: true,
        }),
      ],
      tasks: [
        {
          id: "task-a" as never,
          status: "completed",
          completedAt: "2026-08-29T12:05:00.000Z",
          cancelledAt: null,
          updatedAt: "2026-08-29T12:05:00.000Z",
        },
      ],
    });
    expect(state).toMatchObject({ attentionRequired: false });
    expect(state?.attempts[0]?.status).toBe("interrupted");
  });

  it("finalizes the active attempt when retry exhaustion requires attention", () => {
    const state = finalizeAttemptForAttention({
      state: recoveryState({
        attempts: [
          {
            number: 2,
            kind: "retry",
            providerInstanceId: "codex",
            threadId: "thread-a",
            status: "active",
            failureClass: null,
            summary: "Retry execution.",
            startedAt: "2026-08-29T12:01:00.000Z",
            completedAt: null,
          },
        ],
      }),
      failureClass: "transport_transient",
      detail: "network timeout",
      completedAt: "2026-08-29T12:02:00.000Z",
      failureSignature: "transport:turn-2",
    });
    expect(state).toMatchObject({ attentionRequired: true });
    expect(state.attempts).toEqual([
      expect.objectContaining({
        number: 2,
        status: "failed",
        failureClass: "transport_transient",
        completedAt: "2026-08-29T12:02:00.000Z",
      }),
    ]);
  });

  it("keeps successful execution completed when its review requests changes", () => {
    const completed = finalizeSuccessfulProviderExecution({
      state: recoveryState(),
      threadId: "thread-a" as never,
      completedAt: "2026-08-29T12:01:00.000Z",
    });
    const changesRequested = finalizeAttemptForAttention({
      state: completed,
      failureClass: "review_request_changes",
      detail: "Add coverage for the fallback.",
      completedAt: "2026-08-29T12:02:00.000Z",
      failureSignature: "review:request-changes",
    });

    expect(changesRequested).toMatchObject({
      latestFailureClass: "review_request_changes",
      attentionRequired: true,
    });
    expect(changesRequested.attempts).toEqual([
      expect.objectContaining({
        number: 1,
        status: "completed",
        failureClass: null,
        completedAt: "2026-08-29T12:01:00.000Z",
      }),
    ]);
  });

  it("records review remediation as a new execution attempt and leaves both terminal", () => {
    const completed = finalizeSuccessfulProviderExecution({
      state: recoveryState(),
      threadId: "thread-a" as never,
      completedAt: "2026-08-29T12:01:00.000Z",
    });
    const changesRequested = finalizeAttemptForAttention({
      state: completed,
      failureClass: "review_request_changes",
      detail: "Add coverage for the fallback.",
      completedAt: "2026-08-29T12:02:00.000Z",
      failureSignature: "review:request-changes",
    });
    const remediation = beginReviewRemediationAttempt({
      state: changesRequested,
      providerInstanceId: "claude" as never,
      threadId: "thread-a" as never,
      startedAt: "2026-08-29T12:03:00.000Z",
    });
    expect(remediation).not.toBeNull();
    expect(
      beginReviewRemediationAttempt({
        state: remediation!,
        providerInstanceId: "claude" as never,
        threadId: "thread-a" as never,
        startedAt: "2026-08-29T12:03:00.000Z",
      }),
    ).toBeNull();

    const approved = finalizeSuccessfulProviderExecution({
      state: remediation!,
      threadId: "thread-a" as never,
      completedAt: "2026-08-29T12:04:00.000Z",
    });
    expect(approved.remediationRounds).toBe(1);
    expect(approved.attempts).toEqual([
      expect.objectContaining({ number: 1, status: "completed", failureClass: null }),
      expect.objectContaining({
        number: 2,
        kind: "remediation",
        status: "completed",
        failureClass: null,
      }),
    ]);
    expect(approved.attempts.some((attempt) => attempt.status === "active")).toBe(false);
  });

  it("keeps the replaced attempt terminal and finalizes only the active replacement", () => {
    const [state] = finalizeTerminalTaskAttempts({
      recovery: [
        recoveryState({
          attempts: [
            {
              number: 1,
              kind: "initial",
              providerInstanceId: "claude",
              threadId: "thread-a",
              status: "replaced",
              failureClass: "provider_execution_error",
              summary: "Provider failed.",
              startedAt: "2026-08-29T12:00:00.000Z",
              completedAt: "2026-08-29T12:01:00.000Z",
            },
            {
              number: 2,
              kind: "replacement",
              providerInstanceId: "codex",
              threadId: "thread-b",
              status: "active",
              failureClass: null,
              summary: "Replacement execution.",
              startedAt: "2026-08-29T12:01:00.000Z",
              completedAt: null,
            },
          ],
        }),
      ],
      tasks: [
        {
          id: "task-a" as never,
          status: "completed",
          completedAt: "2026-08-29T12:05:00.000Z",
          cancelledAt: null,
          updatedAt: "2026-08-29T12:05:00.000Z",
        },
      ],
    });
    expect(state?.attempts.map((attempt) => attempt.status)).toEqual(["replaced", "completed"]);
    expect(state?.attempts.filter((attempt) => attempt.status === "active")).toHaveLength(0);
  });

  it("reconciles a successful replacement after an earlier stale capability classification", () => {
    const state = recoveryState({
      attempts: [
        {
          number: 1,
          kind: "initial",
          providerInstanceId: "claude",
          threadId: "thread-a",
          status: "replaced",
          failureClass: "provider_capability_mismatch",
          summary: "Structured generation was unavailable.",
          startedAt: "2026-08-29T12:00:00.000Z",
          completedAt: "2026-08-29T12:01:00.000Z",
        },
        {
          number: 2,
          kind: "replacement",
          providerInstanceId: "codex",
          threadId: "thread-b",
          status: "failed",
          failureClass: "provider_capability_mismatch",
          summary: "Stale capability evidence was observed before the replacement turn.",
          startedAt: "2026-08-29T12:02:00.000Z",
          completedAt: "2026-08-29T12:02:01.000Z",
        },
      ],
      latestFailureClass: "provider_capability_mismatch",
      attentionRequired: true,
    });
    expect(
      providerCapabilityMismatchForAttempt({
        state,
        threadId: "thread-b" as never,
        handoff: {
          generationError: "This provider does not support structured Architect generation.",
          updatedAt: "2026-08-29T12:01:30.000Z",
        },
      }),
    ).toBeNull();

    const completed = finalizeSuccessfulProviderExecution({
      state,
      threadId: "thread-b" as never,
      completedAt: "2026-08-29T12:05:00.000Z",
    });
    expect(completed.attempts).toEqual([
      expect.objectContaining({ number: 1, status: "replaced" }),
      expect.objectContaining({
        number: 2,
        status: "completed",
        failureClass: null,
        completedAt: "2026-08-29T12:05:00.000Z",
      }),
    ]);
    expect(completed.attempts.filter((attempt) => attempt.status === "active")).toHaveLength(0);
    expect(completed).toMatchObject({
      latestFailureClass: null,
      providerEscalation: null,
      attentionRequired: false,
    });
  });

  it("refreshes a no-alternative recommendation when a provider becomes ready", () => {
    const state = recoveryState({
      attempts: [
        {
          number: 1,
          kind: "initial",
          providerInstanceId: "claude",
          threadId: "thread-a",
          status: "failed",
          failureClass: "provider_capability_mismatch",
          summary: "The provider cannot satisfy a required capability.",
          startedAt: "2026-08-29T12:00:00.000Z",
          completedAt: "2026-08-29T12:01:00.000Z",
        },
      ],
      latestFailureClass: "provider_capability_mismatch",
      providerEscalation: {
        failedProviderInstanceId: "claude",
        recommendedProviderInstanceId: null,
        reason: "No alternative provider is currently ready.",
        status: "recommended",
        createdAt: "2026-08-29T12:01:00.000Z",
        resolvedAt: null,
      },
      attentionRequired: true,
    });

    const refreshed = refreshProviderEscalationAvailability({
      state,
      candidates: [
        {
          instanceId: "claude",
          driverKind: "claude",
          model: "claude-sonnet-5",
          ready: true,
          activeLoad: 0,
        },
        {
          instanceId: "codex",
          driverKind: "codex",
          model: "gpt-5.6-sol",
          ready: true,
          activeLoad: 0,
        },
      ] as never,
      refreshedAt: "2026-08-29T12:02:00.000Z",
    });

    expect(refreshed.providerEscalation).toMatchObject({
      failedProviderInstanceId: "claude",
      recommendedProviderInstanceId: "codex",
      status: "recommended",
      createdAt: "2026-08-29T12:01:00.000Z",
    });
    expect(refreshed.attempts).toEqual(
      (state as unknown as { readonly attempts: ReadonlyArray<unknown> }).attempts,
    );
    expect(refreshed.updatedAt).toBe("2026-08-29T12:02:00.000Z");
  });

  it("interrupts a dead replacement once and leaves no active attempt for repeat reconciliation", () => {
    const state = recoveryState({
      attempts: [
        {
          number: 1,
          kind: "initial",
          providerInstanceId: "claude",
          threadId: "thread-a",
          status: "replaced",
          failureClass: "provider_execution_error",
          summary: "Provider failed.",
          startedAt: "2026-08-29T12:00:00.000Z",
          completedAt: "2026-08-29T12:01:00.000Z",
        },
        {
          number: 2,
          kind: "replacement",
          providerInstanceId: "codex",
          threadId: "thread-b",
          status: "active",
          failureClass: null,
          summary: "Replacement execution.",
          startedAt: "2026-08-29T12:01:00.000Z",
          completedAt: null,
        },
      ],
    });
    const thread = {
      id: "thread-b" as never,
      latestTurn: {
        turnId: "turn-b" as never,
        state: "error" as const,
        requestedAt: "2026-08-29T12:01:00.000Z",
        completedAt: "2026-08-29T12:02:00.000Z",
      },
      session: {
        status: "error" as const,
        lastError: "Provider process did not survive a server restart.",
      },
    } as never;
    const first = interruptRestartedReplacementAttempt({
      state,
      thread,
      interruptedAt: "2026-08-29T12:02:00.000Z",
      failureSignature: "restart:turn-b",
    });
    expect(first).toMatchObject({ attentionRequired: true });
    expect(first?.attempts.map((attempt) => attempt.status)).toEqual(["replaced", "interrupted"]);
    expect(interruptedReplacementRequiresAttention(first!)).toBe(true);
    expect(
      interruptRestartedReplacementAttempt({
        state: first!,
        thread,
        interruptedAt: "2026-08-29T12:03:00.000Z",
        failureSignature: "restart:turn-b",
      }),
    ).toBeNull();
    expect(first?.attempts).toHaveLength(2);
  });

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
    expect(
      activeExecutionAttemptOwnsProviderTurn(recoveryState(), {
        id: "thread-a" as never,
        session: { status: "running" },
        latestTurn: { state: "running" },
      } as never),
    ).toBe(true);
  });

  it("lets the Task Inspector own the provider turn for a manual replacement", () => {
    expect(
      replacementAttemptOwnsTurnStart(
        recoveryState({
          attempts: [
            {
              number: 2,
              kind: "replacement",
              providerInstanceId: "antigravity",
              threadId: "thread-b",
              status: "active",
              failureClass: null,
              summary: "Provider execution replaced through the canonical Task inspector.",
              startedAt: "2026-08-29T12:01:00.000Z",
              completedAt: null,
            },
          ],
        }),
        "thread-b" as never,
      ),
    ).toBe(true);
    expect(replacementAttemptOwnsTurnStart(recoveryState(), "thread-a" as never)).toBe(false);
  });

  it("continues a projected replacement until the Task is rebound to its thread", () => {
    const state = recoveryState({
      attempts: [
        {
          number: 1,
          kind: "initial",
          providerInstanceId: "claude",
          threadId: "thread-a",
          status: "failed",
          failureClass: "provider_capability_mismatch",
          summary: "Claude authentication failed.",
          startedAt: "2026-08-29T12:00:00.000Z",
          completedAt: "2026-08-29T12:01:00.000Z",
        },
        {
          number: 2,
          kind: "replacement",
          providerInstanceId: "codex",
          threadId: "thread-b",
          status: "active",
          failureClass: null,
          summary: "Approved provider replacement.",
          startedAt: "2026-08-29T12:02:00.000Z",
          completedAt: null,
        },
      ],
    });

    expect(replacementAttemptNeedsProjectionContinuation(state, "thread-a" as never)).toBe(true);
    expect(replacementAttemptNeedsProjectionContinuation(state, "thread-b" as never)).toBe(false);
    expect(
      replacementAttemptNeedsTurnStart(state, {
        id: "thread-b" as never,
        latestTurn: null,
        messages: [],
      }),
    ).toBe(true);
    expect(
      replacementAttemptNeedsTurnStart(state, {
        id: "thread-b" as never,
        latestTurn: { state: "completed" } as never,
        messages: [],
      }),
    ).toBe(false);
  });

  it("interrupts only the cancelled Task's own in-flight provider turn", () => {
    const taskThreadId = "thread-a" as never;
    expect(
      shouldInterruptCancelledTaskProvider({
        taskThreadId,
        thread: {
          id: taskThreadId,
          session: { status: "running" },
          latestTurn: { state: "running" },
        },
      }),
    ).toBe(true);
    expect(
      shouldInterruptCancelledTaskProvider({
        taskThreadId,
        thread: {
          id: "thread-b" as never,
          session: { status: "running" },
          latestTurn: { state: "running" },
        },
      }),
    ).toBe(false);
    expect(
      shouldInterruptCancelledTaskProvider({
        taskThreadId,
        thread: {
          id: taskThreadId,
          session: { status: "ready" },
          latestTurn: { state: "completed" },
        },
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
    expect(
      providerExecutionFailureDetail({
        latestTurn: { turnId: "turn-2", state: "completed" },
        session: { status: "ready", lastError: null },
        messages: [
          {
            turnId: null,
            role: "assistant",
            text: "Failed to authenticate. API Error: 401 stale provider output.",
          },
          { turnId: "turn-2", role: "assistant", text: "Implemented the module." },
        ],
      } as never),
    ).toBeNull();
  });

  it("hydrates terminal Task threads when the command snapshot omits message bodies", () => {
    expect(
      needsTerminalThreadHydration({
        latestTurn: { state: "completed" },
        messages: [],
      } as never),
    ).toBe(true);
    expect(
      needsTerminalThreadHydration({
        latestTurn: { state: "running" },
        messages: [],
      } as never),
    ).toBe(false);
    expect(
      needsTerminalThreadHydration({
        latestTurn: { state: "completed" },
        messages: [{ role: "assistant", text: "Already hydrated." }],
      } as never),
    ).toBe(false);
  });

  it("redacts secrets before provider recovery evidence is serialized", () => {
    const detail = providerExecutionFailureDetail({
      latestTurn: { turnId: "turn-secret", state: "error" },
      session: {
        status: "error",
        lastError: "network timeout token=fake-secret password:also-secret",
      },
      messages: [],
    } as never);
    expect(detail).toBe("network timeout token=[REDACTED] password=[REDACTED]");
    expect(detail).not.toContain("fake-secret");
    expect(detail).not.toContain("also-secret");
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
    expect(shouldReconcileMissionRunEventType("thread.created")).toBe(true);
    expect(shouldReconcileMissionRunEventType("integration.updated")).toBe(true);
  });

  it("wakes exactly on the reconciliation that resolves provider substitution", () => {
    const resolvedAt = "2026-08-29T12:05:00.000Z";
    const event = {
      type: "mission.run.reconciled",
      occurredAt: resolvedAt,
      payload: {
        run: {
          decisions: [{ kind: "replacement", occurredAt: resolvedAt }],
        },
      },
    };
    expect(shouldReconcileMissionRunEvent(event as never)).toBe(true);
    expect(
      shouldReconcileMissionRunEvent({
        ...event,
        occurredAt: "2026-08-29T12:06:00.000Z",
      } as never),
    ).toBe(false);
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
