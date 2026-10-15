import { useState } from "react";
import type { EnvironmentId, ExecutionContext, ThreadId } from "@t3tools/contracts";
import { MapPinIcon } from "lucide-react";
import { useEnvironmentPresentation } from "../../state/presentation";
import { useEnvironmentQuery } from "../../state/query";
import { threadEnvironment } from "../../state/threads";
import { Button } from "../ui/button";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";

const PERMISSIONS = {
  "approval-required": "Supervised",
  "full-access": "Full access",
  auto: "Auto",
  "auto-accept-edits": "Auto-accept edits",
} as const;

export function ExecutionContextFacts({ context }: { readonly context: ExecutionContext }) {
  const facts = [
    ["Environment", context.environmentLabel],
    ["Project", context.project.title],
    ["Conversation", context.threadId],
    ["Repository", context.repositoryKey ?? "Not identified"],
    ["Current branch", context.currentBranch ?? "Detached or unavailable"],
    ["Recorded branch", context.recordedBranch ?? "Not recorded"],
    [
      "Worktree",
      context.worktreePath ?? (context.workspacePath ? "Project checkout" : "Unavailable"),
    ],
    ["Workspace", context.workspacePath ?? "Unavailable"],
    ["Task", context.task?.title ?? "No Task bound"],
    [
      "Provider session",
      context.providerSession
        ? `${context.providerSession.instanceId ?? "Unknown instance"} (${context.providerSession.driver}) · ${context.providerSession.status}`
        : "No live provider session",
    ],
    [
      "Chat continuation",
      context.providerSession?.continuation === "recorded"
        ? "Recorded by provider; resume not verified"
        : "Not reported",
    ],
    ["Permissions", PERMISSIONS[context.permissions]],
  ];
  return (
    <div className="space-y-3">
      {context.issues.length > 0 ? (
        <p role="status" className="text-xs text-warning">
          Context needs attention:{" "}
          {context.issues.map((issue) => issue.replaceAll("-", " ")).join(", ")}
        </p>
      ) : null}
      <dl className="space-y-2 text-xs">
        {facts.map(([label, value]) => (
          <div key={label} className="grid grid-cols-[7rem_1fr] gap-2">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="min-w-0 break-all">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-muted-foreground">
        Observed {new Date(context.observedAt).toLocaleTimeString()}. Display only; execution
        revalidates its own context.
      </p>
      <p className="text-xs text-muted-foreground">
        CLI terminals are separate sessions. A recorded provider continuation is managed by Chat; it
        does not enable Terminal resume.
      </p>
    </div>
  );
}

/** Fetch on demand through the canonical environment query cache. No separate context store. */
export function ExecutionContextDetails({
  environmentId,
  threadId,
}: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
}) {
  const [open, setOpen] = useState(false);
  const { presentation } = useEnvironmentPresentation(environmentId);
  const supported = presentation?.serverConfig?.environment.capabilities.executionContext === true;
  const connected = presentation?.connection.phase === "connected";
  const query = useEnvironmentQuery(
    open && supported && connected
      ? threadEnvironment.executionContext({ environmentId, input: { threadId } })
      : null,
  );
  const context =
    query.data?.environmentId === environmentId && query.data.threadId === threadId
      ? query.data
      : null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button variant="ghost" size="icon-sm" aria-label="Show execution context">
            <MapPinIcon className="size-4" />
          </Button>
        }
      />
      <PopoverPopup side="bottom" align="end" className="w-[min(24rem,calc(100vw-1.5rem))]">
        <div className="space-y-3">
          <p className="text-sm font-medium">Execution context</p>
          {!connected ? (
            <p className="text-xs text-muted-foreground">
              Environment disconnected. Context is not verified.
            </p>
          ) : !supported ? (
            <p className="text-xs text-muted-foreground">
              This server does not report execution context yet.
            </p>
          ) : query.error ? (
            <p className="text-xs text-warning">Could not verify context. Try refreshing.</p>
          ) : context ? (
            <ExecutionContextFacts context={context} />
          ) : (
            <p className="h-12 animate-pulse text-xs text-muted-foreground motion-reduce:animate-none">
              Resolving context…
            </p>
          )}
          {supported && connected ? (
            <Button size="sm" variant="outline" onClick={query.refresh} disabled={query.isPending}>
              Refresh context
            </Button>
          ) : null}
        </div>
      </PopoverPopup>
    </Popover>
  );
}
