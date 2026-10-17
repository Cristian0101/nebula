import type { DevServerProfile, DiscoveredLocalServer, TerminalSummary } from "@t3tools/contracts";
import {
  terminalWorkspaceHostThreadId,
  type TerminalWorkspace,
} from "../../terminalCenter/terminalWorkspace";

export interface HomeService {
  readonly id: string;
  readonly title: string;
  readonly status:
    | "Started by Nebula"
    | "From a Nebula terminal"
    | "Discovered external server"
    | "Attached Preview"
    | "Unavailable / stale";
  readonly url: string | null;
  readonly workspaceId: string | null;
}
/** A port is never ownership. Only canonical terminal bindings or explicit attachments join a service. */
export function deriveProjectServices(input: {
  readonly projectId: string;
  readonly threadIds: readonly string[];
  readonly workspaces: readonly TerminalWorkspace[];
  readonly profiles: readonly DevServerProfile[];
  readonly terminals: readonly TerminalSummary[];
  readonly servers: readonly DiscoveredLocalServer[];
}): readonly HomeService[] {
  const items: HomeService[] = [];
  const used = new Set<string>();
  for (const workspace of input.workspaces)
    for (const pane of workspace.panes) {
      const hostThreadId =
        pane.terminalThreadId ?? terminalWorkspaceHostThreadId(input.projectId, workspace.id);
      const terminal = input.terminals.find(
        (item) => item.threadId === hostThreadId && item.terminalId === pane.terminalId,
      );
      const profile = input.profiles.find(
        (item) => item.id === pane.devServerProfileId && item.approvedAt,
      );
      const server = input.servers.find(
        (item) =>
          item.terminal?.threadId === hostThreadId && item.terminal.terminalId === pane.terminalId,
      );
      if (pane.type === "dev_server" && profile) {
        const running = terminal?.status === "running" && server !== undefined;
        // A saved, scoped Preview target can be discovered externally. It does
        // not establish process ownership or permission to control the listener.
        const external =
          !server && pane.previewUrl
            ? input.servers.find(
                (item) =>
                  !item.terminal &&
                  item.url.replace(/\/$/u, "") === pane.previewUrl!.replace(/\/$/u, ""),
              )
            : undefined;
        items.push({
          id: `${workspace.id}:${pane.id}`,
          title: pane.title,
          status: running
            ? "Started by Nebula"
            : external
              ? "Discovered external server"
              : "Unavailable / stale",
          url: running ? server.url : (external?.url ?? null),
          workspaceId: workspace.id,
        });
        if (server) used.add(`${server.host}:${server.port}`);
        if (external) used.add(`${external.host}:${external.port}`);
      } else if (pane.externalServer) {
        const attached = pane.externalServer;
        const live = input.servers.find(
          (item) =>
            item.host === attached.host &&
            item.port === attached.port &&
            (attached.pid === null || item.pid === attached.pid),
        );
        items.push({
          id: `${workspace.id}:${pane.id}`,
          title: pane.title,
          status: live ? "Attached Preview" : "Unavailable / stale",
          url: live?.url ?? null,
          workspaceId: workspace.id,
        });
        if (live) used.add(`${live.host}:${live.port}`);
      }
    }
  const threadIds = new Set(input.threadIds);
  for (const server of input.servers) {
    if (
      used.has(`${server.host}:${server.port}`) ||
      !server.terminal ||
      !threadIds.has(server.terminal.threadId)
    )
      continue;
    items.push({
      id: `${server.host}:${server.port}`,
      title: `Server :${server.port}`,
      status: "From a Nebula terminal",
      url: server.url,
      workspaceId: null,
    });
  }
  return items;
}

export function selectProjectTerminals(input: {
  readonly allowed: boolean;
  readonly projectId: string;
  readonly threadIds: readonly string[];
  readonly workspaces: readonly TerminalWorkspace[];
  readonly terminals: readonly TerminalSummary[];
}) {
  if (!input.allowed) return null;
  const hosts = new Set([
    ...input.threadIds,
    ...input.workspaces.map((workspace) =>
      terminalWorkspaceHostThreadId(input.projectId, workspace.id),
    ),
  ]);
  const terminals = input.terminals.filter(
    (terminal) =>
      hosts.has(terminal.threadId) &&
      (terminal.status === "starting" || terminal.status === "running"),
  );
  return {
    open: terminals.length,
    busy: terminals.filter((item) => item.hasRunningSubprocess).length,
  };
}
