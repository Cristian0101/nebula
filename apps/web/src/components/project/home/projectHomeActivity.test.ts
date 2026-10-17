import { describe, expect, it } from "vite-plus/test";
import {
  ThreadId,
  type TerminalSummary,
  type DiscoveredLocalServer,
  type DevServerProfile,
} from "@t3tools/contracts";
import {
  createDefaultTerminalWorkspaceProjectState,
  createTerminalWorkspacePane,
  terminalWorkspaceHostThreadId,
} from "../../terminalCenter/terminalWorkspace";
import { deriveProjectServices, selectProjectTerminals } from "./projectHomeActivity";
const now = "2026-10-17T12:00:00.000Z";
const profile: DevServerProfile = {
  id: "web",
  name: "Web",
  command: "npm run dev",
  workingDirectory: ".",
  preferredPort: 5173,
  previewUrl: "http://localhost:5173",
  approvedAt: now,
};
const workspace = createDefaultTerminalWorkspaceProjectState({
  projectId: "project",
  workspacePath: "/fixture",
  now,
}).workspaces[0]!;
const threadId = terminalWorkspaceHostThreadId("project", workspace.id);
const terminal: TerminalSummary = {
  threadId,
  terminalId: "dev-server-web",
  cwd: "/fixture",
  worktreePath: null,
  status: "running",
  pid: 111,
  exitCode: null,
  exitSignal: null,
  hasRunningSubprocess: true,
  label: "Web",
  updatedAt: now,
};
const server: DiscoveredLocalServer = {
  host: "localhost",
  port: 5173,
  url: "http://localhost:5173",
  pid: 111,
  processName: "node",
  terminal: { threadId: ThreadId.make(threadId), terminalId: terminal.terminalId },
};
const pane = createTerminalWorkspacePane({
  id: "server",
  type: "dev_server",
  title: "Web",
  workspacePath: "/fixture",
  terminalId: terminal.terminalId,
  devServerProfileId: profile.id,
  previewUrl: profile.previewUrl,
  now,
});
const input = {
  projectId: "project",
  threadIds: [],
  workspaces: [{ ...workspace, panes: [pane] }],
  profiles: [profile],
  terminals: [terminal],
  servers: [server],
};
describe("Home process authority", () => {
  it("requires approved profile, bound running terminal and linked listener for managed status", () => {
    expect(deriveProjectServices(input)).toMatchObject([
      { status: "Started by Nebula", workspaceId: workspace.id },
    ]);
    expect(deriveProjectServices({ ...input, terminals: [] })).toMatchObject([
      { status: "Unavailable / stale", url: null },
    ]);
    expect(
      deriveProjectServices({ ...input, servers: [{ ...server, terminal: null }] }),
    ).toMatchObject([{ status: "Discovered external server" }]);
  });
  it("does not claim external listeners just because their port matches a profile", () => {
    expect(
      deriveProjectServices({ ...input, workspaces: [], servers: [{ ...server, terminal: null }] }),
    ).toEqual([]);
    expect(
      deriveProjectServices({ ...input, workspaces: [], profiles: [], threadIds: [threadId] }),
    ).toMatchObject([{ status: "From a Nebula terminal" }]);
  });
  it("shows explicit attachment without lifecycle authority, then stale on process replacement", () => {
    const attachedPane = {
      ...pane,
      type: "preview" as const,
      externalServer: {
        host: server.host,
        port: server.port,
        url: server.url,
        pid: 111,
        processName: null,
        attachedAt: now,
      },
    };
    const attached = {
      ...input,
      workspaces: [{ ...workspace, panes: [attachedPane] }],
      servers: [{ ...server, terminal: null }],
    };
    expect(deriveProjectServices(attached)).toMatchObject([{ status: "Attached Preview" }]);
    expect(
      deriveProjectServices({ ...attached, servers: [{ ...server, pid: 222 }] }),
    ).toMatchObject([{ status: "Unavailable / stale" }]);
  });
  it("returns no protected terminal metadata without permission", () => {
    expect(selectProjectTerminals({ ...input, allowed: false })).toBeNull();
    expect(selectProjectTerminals({ ...input, allowed: true })).toEqual({ open: 1, busy: 1 });
    expect(
      selectProjectTerminals({ ...input, projectId: "other", workspaces: [], allowed: true }),
    ).toEqual({ open: 0, busy: 0 });
  });
  it("preserves workspace, terminal IDs and hidden Preview state", () => {
    const before = JSON.stringify(input);
    deriveProjectServices(input);
    selectProjectTerminals({ ...input, allowed: true });
    expect(JSON.stringify(input)).toBe(before);
  });
});
