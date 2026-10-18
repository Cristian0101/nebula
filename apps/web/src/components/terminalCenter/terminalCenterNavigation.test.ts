import { describe, expect, it } from "vite-plus/test";

import { parseTerminalCenterSearch } from "./terminalCenterNavigation";

describe("Terminal Center navigation", () => {
  it("retains inspection presentation intent without filesystem authority", () => {
    expect(
      parseTerminalCenterSearch({ checkout: "invalid-explicit", inspect: true, cwd: "/foreign" }),
    ).toEqual({ checkout: "invalid-explicit", inspect: true });
    expect(parseTerminalCenterSearch({ inspect: "true" })).toEqual({});
  });
  it("preserves a canonical Task selection", () => {
    expect(parseTerminalCenterSearch({ taskId: "task-mission-backend" })).toEqual({
      taskId: "task-mission-backend",
    });
  });

  it("drops missing, blank, and non-string Task selections", () => {
    expect(parseTerminalCenterSearch({})).toEqual({});
    expect(parseTerminalCenterSearch({ taskId: "  " })).toEqual({});
    expect(parseTerminalCenterSearch({ taskId: 42 })).toEqual({});
  });
});
