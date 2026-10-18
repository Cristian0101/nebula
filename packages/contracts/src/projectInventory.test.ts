import { describe, expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";
import { GetProjectInventoryInput, GetProjectWorkspaceContextInput } from "./projectInventory.ts";
import { ExecutionEnvironmentCapabilities } from "./environment.ts";
import { WsRpcGroup, WS_METHODS } from "./rpc.ts";
import { ORCHESTRATION_WS_METHODS } from "./orchestration.ts";
const decodeInventory = Schema.decodeUnknownSync(GetProjectInventoryInput);
const decodeContext = Schema.decodeUnknownSync(GetProjectWorkspaceContextInput);
const decodeCapabilities = Schema.decodeUnknownSync(ExecutionEnvironmentCapabilities);

describe("Project inventory wire compatibility", () => {
  it("accepts canonical identity only and ignores renderer filesystem or environment authority", () => {
    expect(
      decodeInventory({
        projectId: "p",
        cwd: "/private",
        root: "/other",
        environmentId: "other-host",
      }),
    ).toEqual({ projectId: "p" });
    expect(
      decodeContext({ projectId: "p", workspaceKey: "a".repeat(64), worktreePath: "/other" }),
    ).toEqual({ projectId: "p", workspaceKey: "a".repeat(64) });
  });
  it.each([0, -1, 201, 1.5])("rejects an unbounded or invalid page limit %j", (limit) => {
    expect(() => decodeInventory({ projectId: "p", limit })).toThrow();
  });
  it.each(["/arbitrary/path", "../traversal", "main", "", "z".repeat(64)])(
    "rejects non-opaque workspace selectors %j",
    (workspaceKey) => {
      expect(() => decodeContext({ projectId: "p", workspaceKey })).toThrow();
    },
  );
  it("requires Project identity and bounds cursor offsets", () => {
    expect(() => decodeInventory({})).toThrow();
    expect(() =>
      decodeInventory({
        projectId: "p",
        cursor: { snapshotId: "a".repeat(64), refs: 10_001, worktrees: 0 },
      }),
    ).toThrow();
  });
  it("advertises additive queries without requiring old servers to support them", () => {
    expect(decodeCapabilities({ repositoryIdentity: true }).projectInventory).toBeUndefined();
    expect(WsRpcGroup.requests.has(WS_METHODS.vcsGetProjectInventory)).toBe(true);
    expect(WsRpcGroup.requests.has(ORCHESTRATION_WS_METHODS.getProjectWorkspaceContext)).toBe(true);
  });
});
