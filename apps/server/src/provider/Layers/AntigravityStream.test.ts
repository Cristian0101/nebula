import { describe, expect, it } from "@effect/vitest";
import {
  antigravityTurnState,
  parseAntigravityStreamLine,
  safeAntigravitySummary,
} from "../antigravity/AntigravityStream.ts";

describe("Antigravity stream-json", () => {
  it("parses init metadata", () => {
    expect(
      parseAntigravityStreamLine(
        JSON.stringify({
          event: "init",
          conversation_id: "conv-1",
          init: { cwd: "/tmp/worktree", tools: ["view_file"], permission_mode: "default" },
        }),
      ),
    ).toMatchObject({
      event: "init",
      conversationId: "conv-1",
      cwd: "/tmp/worktree",
      tools: ["view_file"],
      permissionMode: "default",
    });
  });
  it("parses agent text and tool lifecycle events", () => {
    expect(
      parseAntigravityStreamLine(
        JSON.stringify({
          event: "step_update",
          step_update: {
            step_index: 1,
            state: "ACTIVE",
            step_type: "agent_response",
            text_delta: "Hello",
          },
        }),
      ),
    ).toMatchObject({ event: "step_update", stepType: "agent_response", text: "Hello" });
    expect(
      parseAntigravityStreamLine(
        JSON.stringify({
          event: "step_update",
          step_update: {
            step_index: 2,
            state: "DONE",
            step_type: "tool",
            tool_name: "write_file",
            tool_info: { parameters: { path: "fixture-owned/a.txt" }, output: "ok" },
          },
        }),
      ),
    ).toMatchObject({
      event: "step_update",
      tool: { name: "write_file", parameters: { path: "fixture-owned/a.txt" }, output: "ok" },
    });
  });
  it("parses results, usage, and lifecycle states", () => {
    expect(
      parseAntigravityStreamLine(
        JSON.stringify({
          event: "result",
          result: {
            conversation_id: "conv-2",
            status: "SUCCESS",
            response: "done",
            usage: { total_tokens: 6 },
          },
        }),
      ),
    ).toMatchObject({
      event: "result",
      conversationId: "conv-2",
      status: "SUCCESS",
      usage: { total_tokens: 6 },
    });
    expect(antigravityTurnState("SUCCESS")).toBe("completed");
    expect(antigravityTurnState("CANCELED")).toBe("cancelled");
    expect(antigravityTurnState("WAITING")).toBe("failed");
    expect(
      parseAntigravityStreamLine(
        JSON.stringify({
          event: "result",
          result: {
            status: "ERROR",
            response: "A partial response",
            error: "permission denied",
          },
        }),
      ),
    ).toMatchObject({ status: "ERROR", error: "permission denied" });
  });
  it("surfaces malformed lines without throwing", () => {
    expect(parseAntigravityStreamLine("not-json")).toMatchObject({
      event: "malformed",
      message: "invalid JSON",
    });
    expect(parseAntigravityStreamLine('{"event":"step_update","step_update":[]}')).toMatchObject({
      event: "malformed",
    });
  });
  it("bounds safe summaries", () => {
    expect(safeAntigravitySummary({ command: "echo hello" }, 12)).toBe('{"command":"');
  });
});
