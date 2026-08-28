import { SidebarInset } from "../ui/sidebar";
import { useSettingsProjectGroups } from "../settings/ProjectSettingsPanel";
import { ProjectTerminalWorkspace } from "./ProjectTerminalWorkspace";

export function TerminalCenterPage({
  projectKey,
  initialTaskId,
}: {
  readonly projectKey: string;
  readonly initialTaskId?: string;
}) {
  const groups = useSettingsProjectGroups();
  const group = groups.find((candidate) => candidate.projectKey === projectKey) ?? null;
  if (!group) {
    return (
      <SidebarInset className="flex h-dvh items-center justify-center bg-background text-sm text-muted-foreground">
        This project is no longer available.
      </SidebarInset>
    );
  }
  const project =
    group.memberProjects.find(
      (member) => member.environmentId === group.environmentId && member.id === group.id,
    ) ?? group.memberProjects[0]!;

  return (
    <ProjectTerminalWorkspace
      project={project}
      projectKey={projectKey}
      displayName={group.displayName}
      {...(initialTaskId ? { initialTaskId } : {})}
    />
  );
}
