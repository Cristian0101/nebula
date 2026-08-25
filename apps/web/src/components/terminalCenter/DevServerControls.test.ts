import { describe, expect, it } from "vite-plus/test";

import {
  describeDevServerStatus,
  devServerTerminalId,
  resolveDevServerCwd,
} from "./DevServerControls";

describe("Dev Server controls", () => {
  it("binds profiles to stable terminal ids", () => {
    expect(devServerTerminalId("profile-1")).toBe("dev-server-profile-1");
  });

  it("resolves only project-relative working directories", () => {
    expect(resolveDevServerCwd("/repo", ".")).toBe("/repo");
    expect(resolveDevServerCwd("/repo", "apps/web")).toBe("/repo/apps/web");
    expect(resolveDevServerCwd("C:\\repo", "apps/web")).toBe("C:\\repo\\apps\\web");
    expect(resolveDevServerCwd("/repo", "../secret")).toBeNull();
    expect(resolveDevServerCwd("/repo", "/tmp/other")).toBeNull();
  });

  it("derives running state only from live terminal metadata", () => {
    expect(describeDevServerStatus({ status: undefined, hasRunningSubprocess: false })).toBe(
      "Stopped",
    );
    expect(describeDevServerStatus({ status: "running", hasRunningSubprocess: false })).toBe(
      "Stopped",
    );
    expect(describeDevServerStatus({ status: "running", hasRunningSubprocess: true })).toBe(
      "Running",
    );
    expect(describeDevServerStatus({ status: "error", hasRunningSubprocess: false })).toBe(
      "Failed",
    );
  });
});
