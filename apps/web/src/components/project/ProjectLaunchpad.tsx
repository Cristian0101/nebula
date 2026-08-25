import { useAtomValue } from "@effect/atom-react";
import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowRightIcon,
  BotIcon,
  Clock3Icon,
  LayoutDashboardIcon,
  MessageSquarePlusIcon,
  Settings2Icon,
  SparklesIcon,
  WorkflowIcon,
} from "lucide-react";
import { useMemo } from "react";

import { isElectron } from "../../env";
import { useNewThreadHandler } from "../../hooks/useHandleNewThread";
import { environmentSnapshotAtom } from "../../state/shell";
import { Button } from "../ui/button";
import { SidebarInset } from "../ui/sidebar";
import {
  WorkspaceBreadcrumb,
  WorkspaceBreadcrumbItem,
  WorkspaceBreadcrumbSeparator,
} from "../WorkspaceBreadcrumb";
import { WorkspacePageHeader } from "../WorkspacePageHeader";
import { useSettingsProjectGroups } from "../settings/ProjectSettingsPanel";

function relativeTime(value: string): string {
  const elapsedMinutes = Math.max(0, Math.round((Date.now() - Date.parse(value)) / 60_000));
  if (elapsedMinutes < 1) return "now";
  if (elapsedMinutes < 60) return `${elapsedMinutes}m ago`;
  const hours = Math.round(elapsedMinutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function ProjectLaunchpadPage({ projectKey }: { readonly projectKey: string }) {
  const groups = useSettingsProjectGroups();
  const group = groups.find((candidate) => candidate.projectKey === projectKey) ?? null;
  const project =
    group?.memberProjects.find(
      (member) => member.environmentId === group.environmentId && member.id === group.id,
    ) ??
    group?.memberProjects[0] ??
    null;
  if (!group || !project) {
    return (
      <SidebarInset className="flex h-dvh min-h-0 items-center justify-center bg-background text-sm text-muted-foreground">
        This project is no longer available.
      </SidebarInset>
    );
  }

  return <ProjectLaunchpad projectKey={projectKey} group={group} project={project} />;
}

function ProjectLaunchpad({
  projectKey,
  group,
  project,
}: {
  readonly projectKey: string;
  readonly group: ReturnType<typeof useSettingsProjectGroups>[number];
  readonly project: ReturnType<typeof useSettingsProjectGroups>[number]["memberProjects"][number];
}) {
  const navigate = useNavigate();
  const createQuickThread = useNewThreadHandler();
  const snapshot = useAtomValue(environmentSnapshotAtom(project.environmentId));
  const projectThreads = useMemo(
    () =>
      (snapshot?.threads ?? [])
        .filter((thread) => thread.projectId === project?.id)
        .toSorted((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    [project?.id, snapshot?.threads],
  );
  const projectMissions = useMemo(
    () =>
      (snapshot?.missions ?? [])
        .filter((mission) => mission.projectId === project?.id)
        .toSorted((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    [project?.id, snapshot?.missions],
  );
  const activeMissionRun = (snapshot?.missionRuns ?? []).find(
    (run) =>
      run.projectId === project?.id &&
      (run.status === "running" || run.status === "paused" || run.status === "attention"),
  );
  const activeMission = projectMissions.find(
    (mission) => mission.id === activeMissionRun?.missionId,
  );

  const openTerminalCenter = () =>
    void navigate({ to: "/projects/$projectKey/terminal-center", params: { projectKey } });
  const runSwarm = () =>
    void navigate({
      to: "/projects/$projectKey/command-deck",
      params: { projectKey },
      search: { mode: "swarm" },
    });

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden bg-background text-foreground isolate">
      <div className="flex h-full min-h-0 flex-col">
        <WorkspacePageHeader electron={isElectron} className="border-b border-border/70 bg-card/75">
          <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
            <WorkspaceBreadcrumb ariaLabel="Project Home breadcrumb">
              <WorkspaceBreadcrumbItem>Projects</WorkspaceBreadcrumbItem>
              <WorkspaceBreadcrumbSeparator />
              <WorkspaceBreadcrumbItem>{group.displayName}</WorkspaceBreadcrumbItem>
              <WorkspaceBreadcrumbSeparator />
              <WorkspaceBreadcrumbItem current>Project Home</WorkspaceBreadcrumbItem>
            </WorkspaceBreadcrumb>
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label="Project settings"
              onClick={() =>
                void navigate({ to: "/projects/$projectKey/settings", params: { projectKey } })
              }
            >
              <Settings2Icon />
            </Button>
          </div>
        </WorkspacePageHeader>

        <main className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
          <div className="mx-auto w-full max-w-6xl">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-sm text-primary">
                  <SparklesIcon className="size-4" aria-hidden />
                  <span>Nebula workspace</span>
                </div>
                <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
                  How do you want to work?
                </h1>
                <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                  Stay hands-on in Terminal Center or give Architect an objective and let a reviewed
                  Swarm coordinate the work.
                </p>
              </div>
              <Button variant="outline" onClick={() => void navigate({ to: "/terminal-center" })}>
                Global Terminal Center <ArrowRightIcon />
              </Button>
            </div>

            <section
              className="mt-6 grid gap-4 lg:grid-cols-[1fr_1fr_0.68fr]"
              aria-label="Project modes"
            >
              <button
                type="button"
                onClick={openTerminalCenter}
                className="group min-h-56 rounded-2xl border border-border bg-card p-5 text-left shadow-sm transition hover:border-primary/40 hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
                  <LayoutDashboardIcon className="size-5" aria-hidden />
                </span>
                <h2 className="mt-8 text-xl font-semibold">Terminal Center</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Work manually with Codex, Antigravity, and your configured providers in a spatial
                  engineering canvas.
                </p>
                <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-primary">
                  Open Terminal Center{" "}
                  <ArrowRightIcon className="size-4 transition group-hover:translate-x-0.5" />
                </span>
              </button>

              <button
                type="button"
                onClick={runSwarm}
                className="group min-h-56 rounded-2xl border border-primary/25 bg-primary/[0.06] p-5 text-left shadow-sm transition hover:border-primary/50 hover:bg-primary/[0.09] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground">
                  <WorkflowIcon className="size-5" aria-hidden />
                </span>
                <h2 className="mt-8 text-xl font-semibold">Run a Swarm</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Give Architect an objective, review the Mission plan, then let Nebula coordinate
                  isolated agents, review, and integration.
                </p>
                <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-primary">
                  Plan with Architect{" "}
                  <ArrowRightIcon className="size-4 transition group-hover:translate-x-0.5" />
                </span>
              </button>

              <button
                type="button"
                onClick={() =>
                  void createQuickThread(scopeProjectRef(project.environmentId, project.id))
                }
                className="group min-h-56 rounded-2xl border border-border bg-card/70 p-5 text-left transition hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="grid size-10 place-items-center rounded-xl bg-muted text-muted-foreground">
                  <MessageSquarePlusIcon className="size-5" aria-hidden />
                </span>
                <h2 className="mt-8 text-lg font-semibold">Quick Thread</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Open a normal coding conversation when you only need one agent.
                </p>
                <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium">
                  New Thread{" "}
                  <ArrowRightIcon className="size-4 transition group-hover:translate-x-0.5" />
                </span>
              </button>
            </section>

            <section className="mt-8" aria-labelledby="continue-heading">
              <div className="flex items-center gap-2">
                <Clock3Icon className="size-4 text-muted-foreground" aria-hidden />
                <h2 id="continue-heading" className="text-sm font-medium">
                  Continue
                </h2>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {activeMission ? (
                  <button
                    type="button"
                    onClick={runSwarm}
                    className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 text-left hover:bg-accent/30"
                  >
                    <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
                      <BotIcon className="size-4" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {activeMission.title}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        Active Mission · {activeMissionRun?.status}
                      </span>
                    </span>
                    <ArrowRightIcon className="size-4 text-muted-foreground" aria-hidden />
                  </button>
                ) : null}
                {projectThreads.slice(0, activeMission ? 3 : 4).map((thread) => (
                  <button
                    type="button"
                    key={thread.id}
                    onClick={() =>
                      void navigate({
                        to: "/$environmentId/$threadId",
                        params: { environmentId: project.environmentId, threadId: thread.id },
                      })
                    }
                    className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 text-left hover:bg-accent/30"
                  >
                    <span className="grid size-9 place-items-center rounded-lg bg-muted text-muted-foreground">
                      <MessageSquarePlusIcon className="size-4" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{thread.title}</span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        {thread.modelSelection.instanceId} · {relativeTime(thread.updatedAt)}
                      </span>
                    </span>
                    <ArrowRightIcon className="size-4 text-muted-foreground" aria-hidden />
                  </button>
                ))}
                {!activeMission && projectThreads.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground md:col-span-2">
                    Your recent Threads and Missions will appear here.
                  </div>
                ) : null}
              </div>
            </section>
          </div>
        </main>
      </div>
    </SidebarInset>
  );
}
