import type { DevServerProfile, EnvironmentId, OrchestrationThreadShell } from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import { ExternalLinkIcon, FileTextIcon, PlayIcon, RotateCcwIcon, SquareIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { usePrimarySettings } from "../../hooks/useSettings";
import { previewEnvironment } from "../../state/preview";
import { terminalEnvironment } from "../../state/terminal";
import { useKnownTerminalSessions } from "../../state/terminalSessions";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";
import { stackedThreadToast, toastManager } from "../ui/toast";

export const devServerTerminalId = (profileId: string) => `dev-server-${profileId}`;

export function resolveDevServerCwd(
  workspaceRoot: string,
  workingDirectory: string,
): string | null {
  const normalized = workingDirectory.trim().replaceAll("\\", "/");
  if (!normalized || normalized === ".") return workspaceRoot;
  if (normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized)) return null;
  const segments = normalized.split("/").filter((segment) => segment && segment !== ".");
  if (segments.some((segment) => segment === "..")) return null;
  const separator = workspaceRoot.includes("\\") ? "\\" : "/";
  return `${workspaceRoot.replace(/[\\/]$/, "")}${separator}${segments.join(separator)}`;
}

export function describeDevServerStatus(input: {
  readonly status: "starting" | "running" | "exited" | "error" | "closed" | undefined;
  readonly hasRunningSubprocess: boolean;
}): "Stopped" | "Starting" | "Running" | "Failed" {
  if (input.status === "error") return "Failed";
  if (input.hasRunningSubprocess) return "Running";
  if (input.status === "starting") return "Starting";
  return "Stopped";
}

export function DevServerControls({
  environmentId,
  projectKey,
  projectWorkspaceRoot,
  thread,
  compact = false,
}: {
  readonly environmentId: EnvironmentId;
  readonly projectKey: string;
  readonly projectWorkspaceRoot: string;
  readonly thread: OrchestrationThreadShell;
  readonly compact?: boolean;
}) {
  const navigate = useNavigate();
  const profiles = usePrimarySettings(
    (settings) => settings.devServerProfilesByProject[projectKey] ?? [],
  );
  const allProfiles = usePrimarySettings((settings) => settings.devServerProfilesByProject);
  const sessions = useKnownTerminalSessions({ environmentId, threadId: null });
  const openTerminal = useAtomCommand(terminalEnvironment.open, { reportFailure: false });
  const writeTerminal = useAtomCommand(terminalEnvironment.write, { reportFailure: false });
  const closeTerminal = useAtomCommand(terminalEnvironment.close, { reportFailure: false });
  const openPreview = useAtomCommand(previewEnvironment.open, { reportFailure: false });
  const [busyProfileId, setBusyProfileId] = useState<string | null>(null);
  const [pendingRestart, setPendingRestart] = useState<DevServerProfile | null>(null);
  const workspaceRoot = thread.worktreePath ?? projectWorkspaceRoot;

  const profileByTerminalId = useMemo(
    () =>
      new Map(
        Object.values(allProfiles)
          .flat()
          .map((profile) => [devServerTerminalId(profile.id), profile] as const),
      ),
    [allProfiles],
  );

  const notifyFailure = (title: string, description: string) =>
    toastManager.add(stackedThreadToast({ type: "error", title, description }));

  const run = async (profile: DevServerProfile, restart: boolean) => {
    const cwd = resolveDevServerCwd(workspaceRoot, profile.workingDirectory);
    if (!cwd) {
      notifyFailure(
        "Invalid Dev Server directory",
        "Use . or a project-relative directory without parent traversal.",
      );
      return;
    }
    if (profile.preferredPort !== null) {
      const conflict = sessions.find((session) => {
        if (!session.state.hasRunningSubprocess) return false;
        const other = profileByTerminalId.get(session.target.terminalId);
        return other?.preferredPort === profile.preferredPort && other.id !== profile.id;
      });
      if (conflict) {
        notifyFailure(
          `Port ${profile.preferredPort} is already assigned`,
          "Stop the other Nebula Dev Server or approve a different port before starting this one.",
        );
        return;
      }
    }
    const terminalId = devServerTerminalId(profile.id);
    setBusyProfileId(profile.id);
    const existing = sessions.find(
      (session) =>
        session.target.threadId === thread.id && session.target.terminalId === terminalId,
    );
    if (restart && existing?.state.hasRunningSubprocess) {
      const interruptResult = await writeTerminal({
        environmentId,
        input: { threadId: thread.id, terminalId, data: "\x03" },
      });
      if (interruptResult._tag === "Failure") {
        setBusyProfileId(null);
        notifyFailure(
          "Could not restart Dev Server",
          "Nebula could not interrupt the approved process.",
        );
        return;
      }
      setPendingRestart(profile);
      return;
    }
    const lifecycleInput = {
      threadId: thread.id,
      terminalId,
      cwd,
      ...(thread.worktreePath ? { worktreePath: thread.worktreePath } : {}),
      cols: 120,
      rows: 30,
    };
    const lifecycleResult = await openTerminal({ environmentId, input: lifecycleInput });
    if (lifecycleResult._tag === "Failure") {
      setBusyProfileId(null);
      notifyFailure(
        restart ? "Could not restart Dev Server" : "Could not start Dev Server",
        restart
          ? "Nebula could not restart the project terminal."
          : "Nebula could not open the project terminal.",
      );
      return;
    }
    const writeResult = await writeTerminal({
      environmentId,
      input: { threadId: thread.id, terminalId, data: `${profile.command}\r` },
    });
    setBusyProfileId(null);
    if (writeResult._tag === "Failure") {
      notifyFailure("Could not start Dev Server", "The approved command could not be written.");
    }
  };

  useEffect(() => {
    if (!pendingRestart) return;
    const terminalId = devServerTerminalId(pendingRestart.id);
    const session = sessions.find(
      (candidate) =>
        candidate.target.threadId === thread.id && candidate.target.terminalId === terminalId,
    );
    if (session?.state.hasRunningSubprocess) return;
    const profile = pendingRestart;
    setPendingRestart(null);
    void run(profile, false);
  }, [pendingRestart, sessions]);

  const stop = async (profile: DevServerProfile) => {
    setBusyProfileId(profile.id);
    await closeTerminal({
      environmentId,
      input: {
        threadId: thread.id,
        terminalId: devServerTerminalId(profile.id),
        deleteHistory: false,
      },
    });
    setBusyProfileId(null);
  };

  if (profiles.length === 0) {
    return compact ? null : (
      <p className="text-xs text-muted-foreground">
        No approved Dev Server profiles. Add one in Project Settings.
      </p>
    );
  }

  return (
    <div className={compact ? "space-y-1.5" : "space-y-3"}>
      {profiles.map((profile) => {
        const terminalId = devServerTerminalId(profile.id);
        const session = sessions.find(
          (candidate) =>
            candidate.target.threadId === thread.id && candidate.target.terminalId === terminalId,
        );
        const status = describeDevServerStatus({
          status: session?.state.status,
          hasRunningSubprocess: session?.state.hasRunningSubprocess ?? false,
        });
        const running = status === "Running" || status === "Starting";
        return (
          <div
            key={profile.id}
            className={
              compact
                ? "rounded-md border border-border bg-muted/20 px-2 py-1.5"
                : "rounded-lg border border-border bg-muted/20 p-3"
            }
          >
            <div className="flex min-w-0 items-center gap-2">
              <span
                className={`size-2 shrink-0 rounded-full ${status === "Running" ? "bg-emerald-500" : status === "Failed" ? "bg-destructive" : status === "Starting" ? "bg-primary" : "bg-muted-foreground/45"}`}
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate text-xs font-medium">{profile.name}</span>
              <span className="text-[10px] text-muted-foreground">
                {status}
                {profile.preferredPort ? ` · :${profile.preferredPort}` : ""}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {running ? (
                <Button
                  size="micro"
                  variant="outline"
                  disabled={busyProfileId === profile.id}
                  onClick={() => void stop(profile)}
                >
                  <SquareIcon /> Stop
                </Button>
              ) : (
                <Button
                  size="micro"
                  variant="outline"
                  disabled={busyProfileId === profile.id}
                  onClick={() => void run(profile, false)}
                >
                  <PlayIcon /> Start
                </Button>
              )}
              <Button
                size="micro"
                variant="ghost"
                disabled={busyProfileId === profile.id}
                onClick={() => void run(profile, true)}
              >
                <RotateCcwIcon /> Restart
              </Button>
              {profile.previewUrl ? (
                <Button
                  size="micro"
                  variant="ghost"
                  disabled={!running}
                  onClick={() =>
                    void openPreview({
                      environmentId,
                      input: { threadId: thread.id, url: profile.previewUrl },
                    })
                  }
                >
                  <ExternalLinkIcon /> Preview
                </Button>
              ) : null}
              <Button
                size="micro"
                variant="ghost"
                onClick={() =>
                  void navigate({
                    to: "/$environmentId/$threadId",
                    params: { environmentId, threadId: thread.id },
                  })
                }
              >
                <FileTextIcon /> Logs
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
