import { useAtomValue } from "@effect/atom-react";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { memo, useMemo } from "react";

import { primaryServerKeybindingsAtom } from "../../state/server";
import { useAttachedTerminalSession } from "../../state/terminalSessions";
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
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  const session = useAttachedTerminalSession({
    environmentId,
    terminal: {
      threadId,
      terminalId,
      cwd,
      ...(worktreePath !== undefined ? { worktreePath } : {}),
    },
  });
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
      <TerminalViewport
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
    </div>
  );
});
