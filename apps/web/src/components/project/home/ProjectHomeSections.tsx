import {
  ArrowRightIcon,
  ArrowUpIcon,
  CircleDotIcon,
  GitBranchIcon,
  MessageSquarePlusIcon,
  MonitorIcon,
  TerminalIcon,
  TriangleAlertIcon,
  WorkflowIcon,
} from "lucide-react";
import {
  Component,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import type { ProjectWorkspaceContext } from "@t3tools/contracts";
import { Button } from "../../ui/button";
import type {
  HomeDestination,
  ProjectAttention,
  ProjectResumeItem,
  ResumeFilter,
} from "./projectHomeSelectors";
import { RESUME_FILTERS } from "./projectHomeSelectors";
import type { HomeService } from "./projectHomeActivity";

export function homeRelativeTime(value: string, now: number): string {
  const minutes = Math.max(0, Math.floor((now - Date.parse(value)) / 60_000));
  if (!Number.isFinite(minutes)) return "Time unavailable";
  return minutes < 1
    ? "now"
    : minutes < 60
      ? `${minutes}m ago`
      : minutes < 1440
        ? `${Math.floor(minutes / 60)}h ago`
        : `${Math.floor(minutes / 1440)}d ago`;
}
export class HomeCardBoundary extends Component<
  { children: ReactNode; label: string },
  { failed: boolean }
> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? (
      <section className="rounded-xl border border-border bg-card p-4" role="status">
        <p>{this.props.label} unavailable.</p>
        <Button variant="outline" onClick={() => this.setState({ failed: false })}>
          Retry
        </Button>
      </section>
    ) : (
      this.props.children
    );
  }
}
export function HomeQueryState({
  label,
  pending,
  unavailable,
  retry,
}: {
  label: string;
  pending: boolean;
  unavailable: boolean;
  retry: () => void;
}) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!pending) {
      setSlow(false);
      return;
    }
    const timer = window.setTimeout(() => setSlow(true), 10_000);
    return () => window.clearTimeout(timer);
  }, [pending]);
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground" role="status">
      <span>
        {pending
          ? `${slow ? "Still loading" : "Loading"} ${label}…`
          : unavailable
            ? `${label} unavailable. Other Project information remains available.`
            : `${label} not observed.`}
      </span>
      <Button size="xs" variant="ghost" onClick={retry}>
        Retry {label}
      </Button>
    </div>
  );
}
export function ProjectContextBlock({
  name,
  host,
  path,
  context,
  evidence,
  refresh,
}: {
  name: string;
  host: string;
  path: string;
  context: ProjectWorkspaceContext | null;
  evidence: string;
  refresh: () => void;
}) {
  return (
    <section aria-label="Project execution context" className="min-w-0 py-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="break-words text-2xl font-semibold tracking-tight">{name}</h1>
        <Button variant="ghost" size="xs" onClick={refresh}>
          Refresh context
        </Button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1">
          <MonitorIcon className="size-3.5" aria-hidden />
          {host}
        </span>
        <span
          dir="rtl"
          className="min-w-0 max-w-[min(24rem,100%)] truncate rounded-md border border-border bg-card px-2 py-1 font-mono"
        >
          {"\u200e" + (context?.identity?.projectRoot ?? path)}
        </span>
        <span className="inline-flex max-w-full items-center gap-1 break-all rounded-md border border-border bg-card px-2 py-1">
          <GitBranchIcon className="size-3.5 shrink-0" aria-hidden />
          <span>
            {context?.git?.branchRef?.replace(/^refs\/heads\//u, "") ??
              (context?.git?.detached ? "Detached HEAD" : "Branch unknown")}{" "}
            · Current checkout
          </span>
        </span>
        {context?.git ? (
          <>
            <span className="rounded-md border border-border bg-card px-2 py-1">
              {context.git.trackedChanges || context.git.untrackedCount
                ? `${context.git.trackedChanges} changed · ${context.git.untrackedCount} untracked`
                : "Clean at observation"}
            </span>
            {context.git.headSha ? (
              <code className="rounded-md border border-border bg-card px-2 py-1">
                HEAD {context.git.headSha.slice(0, 8)}
              </code>
            ) : null}
          </>
        ) : null}
      </div>
      {context?.workspace ? (
        <p className="mt-2 break-all font-mono text-[0.65rem] text-muted-foreground">
          Worktree {context.workspace.workspaceKey.slice(0, 12)} ·{" "}
          {context.workspace.isMain ? "Main" : "Linked"} · {context.workspace.availability}
        </p>
      ) : null}
      <p className="mt-2 text-xs text-muted-foreground" role="status">
        {evidence}
      </p>
    </section>
  );
}
/** Arrow navigation supplements normal Tab/Enter, without trapping focus. */
export function homeListKeyDown(event: KeyboardEvent<HTMLElement>) {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  const rows = [
    ...event.currentTarget.querySelectorAll<HTMLButtonElement>("button[data-home-row]"),
  ];
  const index = rows.indexOf(event.target as HTMLButtonElement);
  if (index < 0) return;
  event.preventDefault();
  rows[(index + (event.key === "ArrowDown" ? 1 : -1) + rows.length) % rows.length]?.focus();
}
const rowClass =
  "flex w-full min-w-0 items-center gap-3 border-b border-border/60 px-4 py-2 text-left last:border-0 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";
export function ProjectAttentionList({
  items,
  open,
  now,
  partial = false,
}: {
  partial?: boolean;
  items: readonly ProjectAttention[];
  open: (destination: HomeDestination) => void;
  now: number;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <section aria-labelledby="home-attention-heading">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h2 id="home-attention-heading" className="text-sm font-medium">
          Needs you
        </h2>
        <span aria-live="polite" className="rounded-full bg-warning/10 px-2 text-xs text-warning">
          {items.length} items
        </span>
        <span className="ml-auto text-xs text-muted-foreground">
          Decisions, failures, reviews and access
        </span>
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {items.length ? (
          <ul onKeyDown={homeListKeyDown}>
            {(expanded ? items : items.slice(0, 4)).map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  data-home-row
                  data-home-row-key={`attention:${item.id}`}
                  className={rowClass}
                  onClick={() => open(item.destination)}
                >
                  <TriangleAlertIcon className="size-4 shrink-0 text-warning" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-sm font-medium">{item.label}</span>
                    <span className="mt-0.5 block break-words text-xs text-muted-foreground">
                      {item.title}
                    </span>
                  </span>
                  <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">
                    {homeRelativeTime(item.updatedAt, now)}
                  </span>
                  <ArrowRightIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="p-4 text-sm text-muted-foreground">
            {partial
              ? "No attention in available data. Some Project activity is unavailable."
              : "Nothing needs your attention."}
          </p>
        )}
        {items.length > 4 ? (
          <Button
            variant="ghost"
            size="sm"
            aria-expanded={expanded}
            className="m-1"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? "Show fewer" : `Show all ${items.length}`}
          </Button>
        ) : null}
      </div>
    </section>
  );
}
export function ProjectResumeList({
  items,
  filter,
  setFilter,
  open,
  now,
}: {
  items: readonly ProjectResumeItem[];
  filter: ResumeFilter;
  setFilter: (filter: ResumeFilter) => void;
  open: (destination: HomeDestination) => void;
  now: number;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <section
      aria-labelledby="home-resume-heading"
      className="min-w-0 overflow-hidden rounded-xl border border-border bg-card"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-3">
        <h2 id="home-resume-heading" className="text-sm font-medium">
          Resume work
        </h2>
        <div
          role="radiogroup"
          aria-label="Resume work filter"
          className="flex max-w-full flex-wrap gap-1 rounded-lg bg-muted/50 p-1"
          onKeyDown={(event) => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
            event.preventDefault();
            const index =
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? 3
                  : (RESUME_FILTERS.indexOf(filter) + (event.key === "ArrowRight" ? 1 : -1) + 4) %
                    4;
            setFilter(RESUME_FILTERS[index]!);
            event.currentTarget.querySelectorAll<HTMLButtonElement>("button")[index]?.focus();
          }}
        >
          {RESUME_FILTERS.map((value) => (
            <Button
              key={value}
              role="radio"
              aria-checked={value === filter}
              tabIndex={value === filter ? 0 : -1}
              variant={value === filter ? "secondary" : "ghost"}
              size="xs"
              onClick={() => setFilter(value)}
            >
              {value}
            </Button>
          ))}
        </div>
      </div>
      {items.length ? (
        <ul onKeyDown={homeListKeyDown}>
          {(expanded ? items : items.slice(0, 8)).map((item) => (
            <li key={`${item.kind}:${item.id}`}>
              <button
                type="button"
                data-home-row
                data-home-row-key={`resume:${item.kind}:${item.id}`}
                className={rowClass}
                onClick={() => open(item.destination)}
              >
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-sm font-medium">{item.title}</span>
                  <span className="mt-1 block break-words text-xs text-muted-foreground">
                    {item.kind} · {item.status}
                  </span>
                  <span className="mt-1 block break-all font-mono text-[0.65rem] text-muted-foreground">
                    {item.detail ? `${item.detail} · ${item.id}` : item.id}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {homeRelativeTime(item.updatedAt, now)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="p-4 text-sm text-muted-foreground">
          No recent work. Start a thread below or open the Workbench.
        </p>
      )}
      {items.length > 8 ? (
        <Button
          variant="ghost"
          size="sm"
          aria-expanded={expanded}
          className="m-1"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "Show fewer" : `Show all ${items.length}`}
        </Button>
      ) : null}
    </section>
  );
}
export function ProjectLiveNow({
  agents,
  services,
  terminals,
  terminalMessage,
  serviceMessage,
  open,
  workbench,
}: {
  agents: readonly {
    id: string;
    title: string;
    status: string;
    detail: string;
    destination: HomeDestination;
  }[];
  services: readonly HomeService[];
  terminals: { open: number; busy: number } | null;
  terminalMessage: ReactNode;
  serviceMessage: ReactNode;
  open: (destination: HomeDestination) => void;
  workbench: (workspaceId?: string | null) => void;
}) {
  return (
    <section
      aria-labelledby="home-live-heading"
      className="min-w-0 overflow-hidden rounded-xl border border-border bg-card"
    >
      <h2 id="home-live-heading" className="border-b border-border p-4 text-sm font-medium">
        Live now
      </h2>
      <div className="p-4">
        <h3 className="mb-2 text-xs text-muted-foreground">Agents · {agents.length}</h3>
        {agents.length ? (
          <ul onKeyDown={homeListKeyDown}>
            {agents.slice(0, 5).map((agent) => (
              <li key={agent.id}>
                <button
                  type="button"
                  data-home-row
                  data-home-row-key={`agent:${agent.id}`}
                  className="my-1 flex w-full min-w-0 gap-2 rounded-md py-2 text-left hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => open(agent.destination)}
                >
                  <CircleDotIcon className="mt-1 size-3.5 shrink-0 text-info" aria-hidden />
                  <span className="min-w-0">
                    <span className="block break-words text-sm">{agent.title}</span>
                    <span className="block break-words text-xs text-muted-foreground">
                      {agent.status} · {agent.detail}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No running agents.</p>
        )}
        {agents.length > 5 ? (
          <p className="text-xs text-muted-foreground">+{agents.length - 5} more in Resume</p>
        ) : null}
      </div>
      <div className="border-t border-border p-4">
        <h3 className="mb-2 text-xs text-muted-foreground">Development servers</h3>
        {services.length ? (
          <ul className="space-y-3">
            {services.map((service) => (
              <li key={service.id} className="flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0">
                  <span className="block break-words text-sm">{service.title}</span>
                  <span className="block text-xs text-muted-foreground">{service.status}</span>
                </span>
                <Button variant="outline" size="xs" onClick={() => workbench(service.workspaceId)}>
                  {service.status === "Discovered external server"
                    ? "Attach in Workbench"
                    : "Open Workbench"}
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No verified running services.</p>
        )}
        {serviceMessage}
      </div>
      <div className="border-t border-border p-4">
        <h3 className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
          <TerminalIcon className="size-3.5" aria-hidden />
          Terminals
        </h3>
        {terminals ? (
          <p className="text-sm">
            {terminals.open} open · {terminals.busy} running a process
          </p>
        ) : (
          terminalMessage
        )}
        <Button variant="ghost" size="xs" className="mt-2" onClick={() => workbench()}>
          Open Workbench <ArrowRightIcon />
        </Button>
        <p className="mt-2 text-xs text-muted-foreground">
          Navigation preserves shells and hidden Previews.
        </p>
      </div>
    </section>
  );
}
export function ProjectLaunchBar({
  name,
  disabledReason,
  readiness,
  launch,
  gitAvailable,
  text,
  setText,
}: {
  name: string;
  disabledReason: string | null;
  readiness: string;
  launch: (kind: "chat" | "task" | "mission", text: string) => Promise<void>;
  gitAvailable: boolean;
  text: string;
  setText: (value: string) => void;
}) {
  const sectionRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const bar = sectionRef.current;
    const scrollHost = bar?.closest<HTMLElement>("[data-project-checkout]");
    if (!bar || !scrollHost) return;
    const previousPadding = scrollHost.style.scrollPaddingBottom;
    const updatePadding = () => {
      scrollHost.style.scrollPaddingBottom =
        getComputedStyle(bar).position === "sticky"
          ? `${bar.getBoundingClientRect().height + 16}px`
          : previousPadding;
    };
    updatePadding();
    const observer = new ResizeObserver(updatePadding);
    observer.observe(bar);
    return () => {
      observer.disconnect();
      scrollHost.style.scrollPaddingBottom = previousPadding;
    };
  }, []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (kind: "chat" | "task" | "mission") => {
    if (busy || disabledReason) return;
    setBusy(true);
    setError(null);
    try {
      await launch(kind, text);
    } catch {
      setError("Could not open this draft. Your idea is retained; try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section
      ref={sectionRef}
      aria-label="Start new work"
      className="z-10 mt-6 bg-background/95 pb-3 pt-2 backdrop-blur-sm md:sticky md:bottom-0"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit("chat");
        }}
        className="flex items-center gap-2 rounded-[1.375rem] border border-border bg-card p-2 pl-4 focus-within:ring-2 focus-within:ring-ring"
      >
        <label htmlFor="home-launch" className="sr-only">
          Describe new work for {name}
        </label>
        <input
          id="home-launch"
          className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground"
          placeholder={`Describe a change, bug or question for ${name}…`}
          value={text}
          disabled={busy || disabledReason !== null}
          onChange={(event) => setText(event.target.value)}
          aria-describedby="home-launch-context"
        />
        <Button
          type="submit"
          size="icon"
          className="shrink-0 rounded-full"
          disabled={busy || disabledReason !== null}
          aria-label="Open Chat draft"
        >
          <ArrowUpIcon aria-hidden />
        </Button>
      </form>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          disabled={busy || disabledReason !== null || !gitAvailable}
          onClick={() => void submit("task")}
        >
          <MessageSquarePlusIcon />
          New Task
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={busy || disabledReason !== null || !gitAvailable}
          onClick={() => void submit("mission")}
        >
          <WorkflowIcon />
          Plan a Mission
        </Button>
        <p id="home-launch-context" className="min-w-0 text-xs text-muted-foreground">
          {disabledReason ?? `Opens a draft on this checkout. ${readiness}`}
        </p>
      </div>
      {!gitAvailable ? (
        <p className="mt-1 text-xs text-muted-foreground">
          Tasks and Missions need verified Git context.
        </p>
      ) : null}
      {error ? (
        <p className="mt-2 text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
export function EmptyProjectHero({
  name,
  onIdea,
}: {
  name: string;
  onIdea: (idea: string) => void;
}) {
  return (
    <section className="relative my-8 overflow-hidden rounded-2xl border border-border bg-card px-5 py-10 text-center">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-radial from-primary/10 to-transparent"
      />
      <MessageSquarePlusIcon className="relative mx-auto size-10 text-primary" aria-hidden />
      <h2 className="relative mt-5 break-words text-2xl font-semibold">
        What should we build in {name}?
      </h2>
      <p className="relative mt-3 text-sm text-muted-foreground">
        Start with an idea. Review a plan, shape a Task, or work hands-on.
      </p>
      <div className="relative mt-5 flex flex-wrap justify-center gap-2">
        {["Explore this codebase", "Fix a bug", "Build a feature", "Review recent changes"].map(
          (label) => (
            <Button key={label} size="sm" variant="outline" onClick={() => onIdea(label)}>
              {label}
            </Button>
          ),
        )}
      </div>
    </section>
  );
}
