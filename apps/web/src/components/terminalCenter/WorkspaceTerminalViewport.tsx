import { useAtomCommand } from "../../state/use-atom-command";
import { terminalEnvironment } from "../../state/terminal";
import { Button } from "../ui/button";
import { useAtomValue } from "@effect/atom-react";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { memo, useMemo } from "react";

import { primaryServerKeybindingsAtom } from "../../state/server";
import { useKnownTerminalSessions } from "../../state/terminalSessions";
import { EMPTY_TERMINAL_SESSION_STATE } from "@t3tools/client-runtime/state/terminal";
import { TerminalViewport } from "../ThreadTerminalDrawer";

export const WorkspaceTerminalViewport = memo(function WorkspaceTerminalViewport({
  environmentId,
  hostThreadId,
  terminalId,
  cwd,
  worktreePath,
  title,
  statusLabel,
  autoFocus,
  sizeEpoch,
}: {
  readonly environmentId: EnvironmentId;
  readonly hostThreadId: string;
  readonly terminalId: string;
  readonly cwd: string;
  readonly worktreePath?: string | null;
  readonly title: string;
  readonly statusLabel?: string;
  readonly autoFocus: boolean;
  readonly sizeEpoch: number;
}) {
  const threadId = useMemo(() => ThreadId.make(hostThreadId), [hostThreadId]);
  const openTerminal = useAtomCommand(terminalEnvironment.open, { reportFailure: false });
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  const sessions = useKnownTerminalSessions({ environmentId, threadId });
  const known = sessions.find((session) => session.target.terminalId === terminalId);
  const session = known?.state ?? EMPTY_TERMINAL_SESSION_STATE;
  const contextMatches =
    !session.summary ||
    (session.summary.cwd === cwd && session.summary.worktreePath === (worktreePath ?? null));
  const resolvedStatusLabel =
    statusLabel ??
    (session.hasRunningSubprocess
      ? "Running"
      : session.status === "running"
        ? "Shell ready"
        : session.status);

  return (
    <div className="relative h-full min-h-0 overflow-hidden bg-[var(--terminal-background)]">
      <div className="pointer-events-none absolute right-2 top-1 z-10 rounded bg-background/70 px-1.5 py-0.5 text-[10px] text-muted-foreground backdrop-blur-sm">
        {resolvedStatusLabel}
      </div>
      {session.status !== "running" || !contextMatches ? (
        <div className="absolute inset-x-2 top-8 z-10 rounded-md border border-border bg-background p-3 text-sm">
          <p>
            {!contextMatches
              ? "Terminal context differs from this saved pane. Restore the original binding before attaching."
              : "Terminal unavailable. Navigation does not start or restart processes."}
          </p>
          <Button
            size="sm"
            variant="outline"
            disabled={!contextMatches}
            onClick={() =>
              void openTerminal({
                environmentId,
                input: {
                  threadId,
                  terminalId,
                  cwd,
                  ...(worktreePath !== undefined ? { worktreePath } : {}),
                },
              })
            }
          >
            Start shell
          </Button>
        </div>
      ) : null}
      {known && contextMatches ? (
        <TerminalViewport
          attachOnly
          advancedTypography={false}
          threadRef={{ environmentId, threadId }}
          threadId={threadId}
          terminalId={terminalId}
          terminalLabel={title}
          cwd={cwd}
          {...(worktreePath !== undefined ? { worktreePath } : {})}
          onSessionExited={() => undefined}
          onAddTerminalContext={() => undefined}
          focusRequestId={autoFocus ? 1 : 0}
          autoFocus={autoFocus}
          resizeEpoch={sizeEpoch}
          drawerHeight={360 + sizeEpoch}
          keybindings={keybindings}
        />
      ) : null}
    </div>
  );
});
