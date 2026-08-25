import { useAtomValue } from "@effect/atom-react";
import {
  isAtomCommandInterrupted,
  mapAtomCommandResult,
  settlePromise,
  squashAtomCommandFailure,
  type AtomCommandResult,
} from "@t3tools/client-runtime/state/runtime";
import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { AsyncResult } from "effect/unstable/reactivity";
import {
  deriveProjectGroupingOverrideKey,
  selectProjectGroupingSettings,
} from "../../logicalProject";
import type {
  ContextMenuItem,
  ModelSelection,
  ProviderDriverKind,
  QualityGateDefinition,
  SidebarProjectGroupingMode,
  T3ProjectFileScript,
  ThreadEnvMode,
} from "@t3tools/contracts";
import { SharedResourceId } from "@t3tools/contracts";
import { resolveEnvModeLabel } from "../BranchToolbar.logic";
import { createModelSelection } from "@t3tools/shared/model";
import { DEFAULT_RESOLVED_KEYBINDINGS } from "@t3tools/shared/keybindings";
import { useCanGoBack, useNavigate } from "@tanstack/react-router";
import * as Cause from "effect/Cause";
import { ChevronDownIcon, CopyIcon, PlusIcon, SettingsIcon, Trash2Icon } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";

import { useComposerDraftStore } from "../../composerDraftStore";
import { isElectron } from "../../env";
import {
  useClientSettings,
  useUpdateClientSettings,
  usePrimarySettings,
} from "../../hooks/useSettings";
import { useCopyToClipboard } from "../../hooks/useCopyToClipboard";
import { useT3ProjectFileState } from "../../hooks/useT3ProjectFileScripts";
import { shortcutLabelForCommand } from "../../keybindings";
import { keybindingValueForCommand } from "../../lib/projectScriptKeybindings";
import { readLocalApi } from "../../localApi";
import { randomUUID } from "../../lib/utils";
import {
  buildProjectScript,
  commandForProjectScript,
  nextProjectScriptId,
} from "../../projectScripts";
import { decodeProjectScriptKeybindingRule } from "../../lib/projectScriptKeybindings";
import {
  applyProviderInstanceSettings,
  deriveProviderInstanceEntries,
  resolveDefaultProviderModelSelection,
  sortProviderInstanceEntries,
} from "../../providerInstances";
import { getCustomModelOptionsByInstance } from "../../modelSelection";
import {
  buildSidebarProjectSnapshots,
  type SidebarProjectGroupMember,
  type SidebarProjectSnapshot,
} from "../../sidebarProjectGrouping";
import { useEnvironments, usePrimaryEnvironmentId } from "../../state/environments";
import { useProjects, useThreadShells } from "../../state/entities";
import { projectEnvironment } from "../../state/projects";
import { primaryServerProvidersAtom, serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { ProviderModelPicker } from "../chat/ProviderModelPicker";
import { TraitsPicker } from "../chat/TraitsPicker";
import { ProjectFavicon } from "../ProjectFavicon";
import { ProjectTasksSection } from "../ProjectTasksSection";
import {
  EMPTY_PROJECT_SCRIPT_INPUT,
  editorRequestForScript,
  ProjectScriptEditorDialog,
  ScriptIcon,
  type NewProjectScriptInput,
  type ProjectScriptEditorRequest,
} from "../projectScriptEditor";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from "../ui/menu";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { SidebarInset } from "../ui/sidebar";
import { stackedThreadToast, toastManager } from "../ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import {
  WorkspaceBreadcrumb,
  WorkspaceBreadcrumbItem,
  WorkspaceBreadcrumbSeparator,
} from "../WorkspaceBreadcrumb";
import { WorkspacePageHeader } from "../WorkspacePageHeader";
import {
  SettingResetButton,
  SettingsPageContainer,
  SettingsRow,
  SettingsSection,
} from "./settingsLayout";
import {
  canPickExternalProjectFavicon,
  ProjectFaviconPickerDialog,
} from "./ProjectFaviconPickerDialog";

export const PROJECT_GROUPING_MODE_LABELS: Record<SidebarProjectGroupingMode, string> = {
  repository: "Group by repository",
  repository_path: "Group by repository path",
  separate: "Keep separate",
};

/** Logical project groups for the settings page, sorted by display name. */
export function useSettingsProjectGroups(): SidebarProjectSnapshot[] {
  const projects = useProjects();
  const projectGroupingSettings = useClientSettings(selectProjectGroupingSettings);
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const { environments } = useEnvironments();
  const environmentLabelById = useMemo(
    () =>
      new Map(
        environments.map((environment) => [environment.environmentId, environment.label] as const),
      ),
    [environments],
  );
  return useMemo(
    () =>
      buildSidebarProjectSnapshots({
        projects,
        settings: projectGroupingSettings,
        primaryEnvironmentId,
        resolveEnvironmentLabel: (environmentId) => environmentLabelById.get(environmentId) ?? null,
      }).sort((a, b) => a.displayName.localeCompare(b.displayName)),
    [environmentLabelById, primaryEnvironmentId, projectGroupingSettings, projects],
  );
}

function memberKey(member: { environmentId: string; id: string }): string {
  return `${member.environmentId}:${member.id}`;
}

export function ProjectSettingsPage({ projectKey }: { projectKey: string }) {
  const navigate = useNavigate();
  const canGoBack = useCanGoBack();
  const navigateBackWithinApp = useCallback(() => {
    if (canGoBack) {
      window.history.back();
      return;
    }
    void navigate({ to: "/" });
  }, [canGoBack, navigate]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key !== "Escape") return;
      event.preventDefault();
      const activeElement = document.activeElement;
      if (activeElement instanceof HTMLElement) {
        activeElement.blur();
      }
      navigateBackWithinApp();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigateBackWithinApp]);

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground isolate">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background text-foreground">
        <WorkspacePageHeader electron={isElectron}>
          <ProjectSettingsBreadcrumb projectKey={projectKey} />
        </WorkspacePageHeader>
        <ProjectSettingsPanel projectKey={projectKey} />
      </div>
    </SidebarInset>
  );
}

function ProjectSettingsBreadcrumb({ projectKey }: { projectKey: string }) {
  const groups = useSettingsProjectGroups();
  const navigate = useNavigate();
  const selected = groups.find((group) => group.projectKey === projectKey) ?? null;
  const openProjectMenu = (event: ReactMouseEvent<HTMLButtonElement>) => {
    const api = readLocalApi();
    if (!api) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const items: ContextMenuItem<string>[] = groups.map((group) => ({
      id: group.projectKey,
      label: group.displayName,
    }));
    void settlePromise(() =>
      api.contextMenu.show(items, { x: rect.left, y: rect.bottom + 4 }),
    ).then((clicked) => {
      if (clicked._tag === "Failure" || clicked.value === null) return;
      void navigate({
        to: "/projects/$projectKey/settings",
        params: { projectKey: clicked.value },
        replace: true,
        hashScrollIntoView: false,
      });
    });
  };

  return (
    <WorkspaceBreadcrumb ariaLabel="Project settings breadcrumb">
      <WorkspaceBreadcrumbItem>Projects</WorkspaceBreadcrumbItem>
      <WorkspaceBreadcrumbSeparator />
      <WorkspaceBreadcrumbItem current>
        {selected ? (
          <button
            type="button"
            aria-haspopup="menu"
            aria-label="Switch project"
            onClick={openProjectMenu}
            className="group/project-title inline-flex min-w-0 max-w-64 cursor-pointer items-center gap-1 rounded-sm text-left focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="min-w-0 truncate">{selected.displayName}</span>
            <ChevronDownIcon
              aria-hidden
              className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/project-title:opacity-100 group-focus-visible/project-title:opacity-100"
            />
          </button>
        ) : (
          <span className="truncate text-muted-foreground">Unavailable project</span>
        )}
      </WorkspaceBreadcrumbItem>
    </WorkspaceBreadcrumb>
  );
}

export function ProjectSettingsPanel({ projectKey }: { projectKey: string }) {
  const groups = useSettingsProjectGroups();
  const navigate = useNavigate();

  const selected = groups.find((group) => group.projectKey === projectKey) ?? null;

  // Remember the members of the last rendered group so a grouping-rule change
  // (which changes the group key) can follow the project to its new group.
  const lastSelectionRef = useRef<{ key: string; memberKeys: string[] } | null>(null);
  useEffect(() => {
    if (!selected) return;
    lastSelectionRef.current = {
      key: selected.projectKey,
      memberKeys: selected.memberProjects.map((member) => member.physicalProjectKey),
    };
  }, [selected]);

  // A grouping-rule change replaces the group key mid-visit; follow the
  // project to its new key instead of parking on the not-found state.
  useEffect(() => {
    if (selected !== null) return;
    const last = lastSelectionRef.current;
    if (last?.key !== projectKey) return;
    const successor = groups.find((group) =>
      group.memberProjects.some((member) => last.memberKeys.includes(member.physicalProjectKey)),
    );
    if (successor) {
      void navigate({
        to: "/projects/$projectKey/settings",
        params: { projectKey: successor.projectKey },
        replace: true,
        hashScrollIntoView: false,
      });
    }
  }, [groups, navigate, projectKey, selected]);

  if (!selected) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
        {groups.length === 0
          ? "Add a project from the sidebar to configure it here."
          : "This project is no longer available."}
      </div>
    );
  }
  return <ProjectDetail key={selected.projectKey} group={selected} />;
}

function ProjectQualityAndReviewSettings({ project }: { project: SidebarProjectGroupMember }) {
  const updateQuality = useAtomCommand(projectEnvironment.updateQualityPolicy, {
    reportFailure: false,
  });
  const updateReview = useAtomCommand(projectEnvironment.updateReviewPolicy, {
    reportFailure: false,
  });
  const [gates, setGates] = useState<QualityGateDefinition[]>([
    ...(project.qualityPolicy?.gates ?? []),
  ]);
  const [requireReview, setRequireReview] = useState(
    project.reviewPolicy?.requireIndependentReview ?? true,
  );
  const [preferDifferent, setPreferDifferent] = useState(
    project.reviewPolicy?.preferDifferentProvider ?? true,
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setGates([...(project.qualityPolicy?.gates ?? [])]);
    setRequireReview(project.reviewPolicy?.requireIndependentReview ?? true);
    setPreferDifferent(project.reviewPolicy?.preferDifferentProvider ?? true);
  }, [project.id, project.qualityPolicy, project.reviewPolicy]);

  const updateGate = (index: number, patch: Partial<QualityGateDefinition>) => {
    setGates((current) =>
      current.map((gate, gateIndex) =>
        gateIndex === index
          ? {
              ...gate,
              ...patch,
              ...(patch.command !== undefined && patch.command !== gate.command
                ? { approvedCommand: null }
                : {}),
            }
          : gate,
      ),
    );
  };

  const save = async () => {
    if (gates.some((gate) => !gate.label.trim() || !gate.command.trim())) {
      toastManager.add({ type: "warning", title: "Every quality gate needs a label and command" });
      return;
    }
    setSaving(true);
    const qualityResult = await updateQuality({
      environmentId: project.environmentId,
      input: { projectId: project.id, gates },
    });
    if (qualityResult._tag === "Failure") {
      toastManager.add({ type: "error", title: "Could not save quality gates" });
      setSaving(false);
      return;
    }
    const reviewResult = await updateReview({
      environmentId: project.environmentId,
      input: {
        projectId: project.id,
        requireIndependentReview: requireReview,
        preferDifferentProvider: preferDifferent,
      },
    });
    setSaving(false);
    toastManager.add({
      type: reviewResult._tag === "Failure" ? "error" : "success",
      title:
        reviewResult._tag === "Failure"
          ? "Quality gates saved, but review policy failed"
          : "Quality and review policy saved",
    });
  };

  return (
    <SettingsSection title="Quality gates and review">
      <SettingsRow
        title="Independent review"
        description="New managed Builder Tasks require an approved review by default. A different provider is recommended when ready."
        control={
          <div className="flex flex-col items-end gap-2 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={requireReview}
                onChange={(event) => setRequireReview(event.currentTarget.checked)}
              />
              Require review
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={preferDifferent}
                onChange={(event) => setPreferDifferent(event.currentTarget.checked)}
              />
              Prefer different provider
            </label>
          </div>
        }
      />
      <div className="space-y-3 rounded-lg border border-black/[0.08] p-3">
        <div>
          <p className="text-sm font-medium">Quality gate commands</p>
          <p className="text-xs text-muted-foreground">
            Commands run only in a Task worktree after the exact command is approved here. Editing a
            command revokes approval.
          </p>
        </div>
        {gates.length === 0 ? (
          <p className="text-sm text-muted-foreground">No quality gates configured.</p>
        ) : null}
        {gates.map((gate, index) => (
          <div key={gate.id} className="grid gap-2 rounded-md bg-muted/30 p-3 sm:grid-cols-12">
            <Input
              aria-label={`Quality gate ${index + 1} label`}
              className="sm:col-span-3"
              value={gate.label}
              onChange={(event) => updateGate(index, { label: event.currentTarget.value })}
            />
            <Input
              aria-label={`${gate.label} command`}
              className="font-mono text-xs sm:col-span-4"
              value={gate.command}
              onChange={(event) => updateGate(index, { command: event.currentTarget.value })}
            />
            <select
              aria-label={`${gate.label} scope`}
              className="rounded-md border border-black/[0.08] bg-transparent px-2 text-sm sm:col-span-2"
              value={gate.scope ?? "both"}
              onChange={(event) =>
                updateGate(index, {
                  scope: event.currentTarget.value as "task" | "integration" | "both",
                })
              }
            >
              <option value="both">Task + Integration</option>
              <option value="task">Task only</option>
              <option value="integration">Integration only</option>
            </select>
            <Input
              aria-label={`${gate.label} timeout seconds`}
              className="sm:col-span-2"
              type="number"
              min={1}
              max={3600}
              value={gate.timeoutSeconds}
              onChange={(event) =>
                updateGate(index, {
                  timeoutSeconds: Math.max(1, Number(event.currentTarget.value) || 1),
                })
              }
            />
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              aria-label={`Delete ${gate.label}`}
              onClick={() => setGates((current) => current.filter((_, item) => item !== index))}
            >
              <Trash2Icon />
            </Button>
            <div className="flex flex-wrap gap-4 text-xs sm:col-span-12">
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={gate.enabled}
                  onChange={(event) => updateGate(index, { enabled: event.currentTarget.checked })}
                />
                Enabled
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={gate.required}
                  onChange={(event) => updateGate(index, { required: event.currentTarget.checked })}
                />
                Required
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={gate.approvedCommand === gate.command}
                  onChange={(event) =>
                    updateGate(index, {
                      approvedCommand: event.currentTarget.checked ? gate.command : null,
                    })
                  }
                />
                I approve this exact command
              </label>
            </div>
          </div>
        ))}
        <div className="flex justify-between gap-2">
          <Button
            type="button"
            size="xs"
            variant="outline"
            onClick={() =>
              setGates((current) => [
                ...current,
                {
                  id: `gate-${randomUUID()}`,
                  label: "Tests",
                  command: "npm test",
                  enabled: true,
                  required: true,
                  scope: "both",
                  timeoutSeconds: 600,
                  approvedCommand: null,
                },
              ])
            }
          >
            <PlusIcon /> Add gate
          </Button>
          <Button type="button" size="sm" disabled={saving} onClick={() => void save()}>
            Save policy
          </Button>
        </div>
      </div>
    </SettingsSection>
  );
}

function ProjectSharedResourcesSettings({ project }: { project: SidebarProjectGroupMember }) {
  const createResource = useAtomCommand(projectEnvironment.createSharedResource, {
    reportFailure: false,
  });
  const updateResource = useAtomCommand(projectEnvironment.updateSharedResource, {
    reportFailure: false,
  });
  const deleteResource = useAtomCommand(projectEnvironment.deleteSharedResource, {
    reportFailure: false,
  });
  const [name, setName] = useState("");
  const [patterns, setPatterns] = useState("");
  const resources = project.sharedResources ?? [];

  const add = async () => {
    const values = patterns
      .split("\n")
      .map((value) => value.trim())
      .filter(Boolean);
    if (!name.trim() || values.length === 0) {
      toastManager.add({ type: "warning", title: "Enter a name and at least one repository path" });
      return;
    }
    const result = await createResource({
      environmentId: project.environmentId,
      input: {
        projectId: project.id,
        resourceId: SharedResourceId.make(randomUUID()),
        name: name.trim(),
        description: null,
        patterns: values,
      },
    });
    if (result._tag === "Success") {
      setName("");
      setPatterns("");
    }
    toastManager.add({
      type: result._tag === "Success" ? "success" : "error",
      title: result._tag === "Success" ? "Shared resource added" : "Could not add shared resource",
    });
  };

  return (
    <SettingsSection title="Shared resources">
      <SettingsRow
        title="Exclusive coordination leases"
        description="Define repository-relative paths that only one active Task may coordinate at a time. This is not an OS file lock."
        control={
          <div className="w-full space-y-2 sm:w-96">
            {resources.map((resource) => {
              const leased = (project.resourceLeases ?? []).some(
                (lease) => lease.resourceId === resource.id && lease.status === "held",
              );
              return (
                <div
                  key={resource.id}
                  className="rounded-md border border-black/[0.08] p-2 text-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{resource.name}</span>
                    <span>{leased ? "Leased" : resource.enabled ? "Enabled" : "Disabled"}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {resource.patterns.join(" · ")}
                  </p>
                  <div className="mt-2 flex gap-2">
                    <Button
                      size="xs"
                      variant="outline"
                      disabled={leased}
                      onClick={() =>
                        void updateResource({
                          environmentId: project.environmentId,
                          input: {
                            projectId: project.id,
                            resourceId: resource.id,
                            name: resource.name,
                            description: resource.description,
                            patterns: resource.patterns,
                            enabled: !resource.enabled,
                          },
                        })
                      }
                    >
                      {resource.enabled ? "Disable" : "Enable"}
                    </Button>
                    <Button
                      size="xs"
                      variant="outline"
                      disabled={leased}
                      onClick={() =>
                        void deleteResource({
                          environmentId: project.environmentId,
                          input: { projectId: project.id, resourceId: resource.id },
                        })
                      }
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              );
            })}
            <Input
              aria-label="Shared resource name"
              placeholder="Dependency manifest"
              value={name}
              onChange={(event) => setName(event.currentTarget.value)}
            />
            <textarea
              aria-label="Exclusive paths"
              className="min-h-20 w-full rounded-md border border-black/[0.08] bg-transparent p-2 text-sm"
              placeholder={"package.json\npnpm-lock.yaml"}
              value={patterns}
              onChange={(event) => setPatterns(event.currentTarget.value)}
            />
            <Button size="sm" onClick={() => void add()}>
              Add resource
            </Button>
          </div>
        }
      />
    </SettingsSection>
  );
}

function ProjectDetail({ group }: { group: SidebarProjectSnapshot }) {
  const navigate = useNavigate();
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const settings = usePrimarySettings();
  const updateClientSettings = useUpdateClientSettings();
  const projectGroupingSettings = useClientSettings(selectProjectGroupingSettings);
  const serverProviders = useAtomValue(primaryServerProvidersAtom);
  const threads = useThreadShells();
  const updateProject = useAtomCommand(projectEnvironment.update, { reportFailure: false });
  const deleteProject = useAtomCommand(projectEnvironment.delete, { reportFailure: false });
  const upsertKeybinding = useAtomCommand(serverEnvironment.upsertKeybinding, {
    reportFailure: false,
  });
  const removeKeybinding = useAtomCommand(serverEnvironment.removeKeybinding, {
    reportFailure: false,
  });
  const { copyToClipboard: copyPathToClipboard } = useCopyToClipboard<{ path: string }>({
    onCopy: ({ path }) => {
      toastManager.add({ type: "success", title: "Path copied", description: path });
    },
    onError: (error) => {
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: "Failed to copy path",
          description: error instanceof Error ? error.message : "An error occurred.",
        }),
      );
    },
  });

  const representative =
    group.memberProjects.find(
      (member) => member.environmentId === group.environmentId && member.id === group.id,
    ) ?? group.memberProjects[0]!;
  const faviconPath = representative.faviconPath ?? null;
  const pickProjectFavicon =
    typeof window !== "undefined" &&
    group.memberProjects.every(
      (member) =>
        member.environmentId === primaryEnvironmentId &&
        canPickExternalProjectFavicon(member.workspaceRoot, navigator.platform),
    )
      ? window.desktopBridge?.pickProjectFavicon
      : undefined;

  const threadCountByMember = useMemo(() => {
    const counts = new Map<string, number>();
    for (const thread of threads) {
      const key = `${thread.environmentId}:${thread.projectId}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [threads]);
  const reportFailure = useCallback((title: string, result: AtomCommandResult<void, unknown>) => {
    if (result._tag !== "Failure" || isAtomCommandInterrupted(result)) return;
    const error = squashAtomCommandFailure(result);
    toastManager.add(
      stackedThreadToast({
        type: "error",
        title,
        description: error instanceof Error ? error.message : "An error occurred.",
      }),
    );
  }, []);

  // Group-shared fields live on each physical project record, so a
  // group-level edit fans out to every member.
  const updateAllMembers = useCallback(
    async (
      input: Partial<{
        title: string;
        defaultModelSelection: ModelSelection | null;
        defaultThreadEnvMode: ThreadEnvMode | null;
        faviconPath: string | null;
      }>,
      failureTitle: string,
    ): Promise<AtomCommandResult<void, unknown>> => {
      for (const member of group.memberProjects) {
        const result = mapAtomCommandResult(
          await updateProject({
            environmentId: member.environmentId,
            input: { projectId: member.id, ...input },
          }),
          () => undefined,
        );
        if (result._tag === "Failure") {
          // A partial fan-out is possible: earlier members already took the
          // write. Name the environment so the user knows where it stopped.
          reportFailure(
            group.memberProjects.length > 1
              ? `${failureTitle} on ${member.environmentLabel ?? "the current environment"}`
              : failureTitle,
            result,
          );
          return result;
        }
      }
      return AsyncResult.success(undefined);
    },
    [group.memberProjects, reportFailure, updateProject],
  );

  const renameGroup = useCallback(
    async (nextTitle: string) => {
      const title = nextTitle.trim();
      if (!title) {
        toastManager.add({ type: "warning", title: "Project title cannot be empty" });
        return;
      }
      if (title === group.displayName) return;
      if (group.memberProjects.every((member) => member.title === title)) return;
      await updateAllMembers({ title }, "Failed to rename project");
    },
    [group.displayName, group.memberProjects, updateAllMembers],
  );

  // ----- default model -----
  const storedSelection = representative.defaultModelSelection;
  const resolvedSelection = resolveDefaultProviderModelSelection(serverProviders, storedSelection);
  const instanceEntries = useMemo(
    () =>
      sortProviderInstanceEntries(
        applyProviderInstanceSettings(deriveProviderInstanceEntries(serverProviders), settings),
      ),
    [serverProviders, settings],
  );
  const modelOptionsByInstance = useMemo(
    () => getCustomModelOptionsByInstance(settings, serverProviders),
    [serverProviders, settings],
  );
  const activeEntry = instanceEntries.find(
    (entry) => entry.instanceId === resolvedSelection?.instanceId,
  );
  const setDefaultModel = useCallback(
    (selection: ModelSelection | null) =>
      void updateAllMembers({ defaultModelSelection: selection }, "Failed to update default model"),
    [updateAllMembers],
  );

  // ----- new-thread workspace mode -----
  const storedEnvMode = representative.defaultThreadEnvMode ?? null;
  const setDefaultThreadEnvMode = useCallback(
    (mode: ThreadEnvMode | null) =>
      void updateAllMembers(
        { defaultThreadEnvMode: mode },
        "Failed to update new-thread workspace",
      ),
    [updateAllMembers],
  );

  // ----- favicon -----
  const [faviconPickerOpen, setFaviconPickerOpen] = useState(false);
  const [isSavingFavicon, setIsSavingFavicon] = useState(false);
  const savingFaviconRef = useRef(false);
  const setFaviconPath = useCallback(
    async (faviconPath: string | null) => {
      if (savingFaviconRef.current) return;
      savingFaviconRef.current = true;
      setIsSavingFavicon(true);
      try {
        await updateAllMembers({ faviconPath }, "Failed to update project icon");
      } finally {
        savingFaviconRef.current = false;
        setIsSavingFavicon(false);
      }
    },
    [updateAllMembers],
  );

  // ----- checkout selection and scripts -----
  const [selectedCheckoutKey, setSelectedCheckoutKey] = useState(representative.physicalProjectKey);
  const selectedCheckout =
    group.memberProjects.find((member) => member.physicalProjectKey === selectedCheckoutKey) ??
    representative;
  const devServerProfiles = settings.devServerProfilesByProject[group.projectKey] ?? [];
  const [devServerName, setDevServerName] = useState("");
  const [devServerCommand, setDevServerCommand] = useState("");
  const [devServerWorkingDirectory, setDevServerWorkingDirectory] = useState(".");
  const [devServerPort, setDevServerPort] = useState("");
  const [devServerPreviewUrl, setDevServerPreviewUrl] = useState("");
  const saveDevServerProfiles = useCallback(
    (profiles: typeof devServerProfiles) =>
      updateClientSettings({
        devServerProfilesByProject: {
          ...settings.devServerProfilesByProject,
          [group.projectKey]: profiles,
        },
      }),
    [group.projectKey, settings.devServerProfilesByProject, updateClientSettings],
  );
  const approveDevServerProfile = useCallback(() => {
    const name = devServerName.trim();
    const command = devServerCommand.trim();
    const workingDirectory = devServerWorkingDirectory.trim() || ".";
    const preferredPort = devServerPort.trim() ? Number(devServerPort) : null;
    if (!name || !command) {
      toastManager.add({
        type: "warning",
        title: "Name and command are required",
        description: "Nebula only runs commands you explicitly review and approve here.",
      });
      return;
    }
    if (/\r|\n/.test(command)) {
      toastManager.add({ type: "warning", title: "Use one command per profile" });
      return;
    }
    if (
      preferredPort !== null &&
      (!Number.isInteger(preferredPort) || preferredPort < 1 || preferredPort > 65_535)
    ) {
      toastManager.add({ type: "warning", title: "Preferred port must be between 1 and 65535" });
      return;
    }
    saveDevServerProfiles([
      ...devServerProfiles,
      {
        id: randomUUID(),
        name,
        command,
        workingDirectory,
        preferredPort,
        previewUrl: devServerPreviewUrl.trim(),
        approvedAt: new Date().toISOString(),
      },
    ]);
    setDevServerName("");
    setDevServerCommand("");
    setDevServerWorkingDirectory(".");
    setDevServerPort("");
    setDevServerPreviewUrl("");
  }, [
    devServerCommand,
    devServerName,
    devServerPort,
    devServerPreviewUrl,
    devServerProfiles,
    devServerWorkingDirectory,
    saveDevServerProfiles,
  ]);
  const selectedServerConfig = useAtomValue(
    serverEnvironment.configValueAtom(selectedCheckout.environmentId),
  );
  const keybindings = selectedServerConfig?.keybindings ?? DEFAULT_RESOLVED_KEYBINDINGS;
  const scripts = selectedCheckout.scripts;
  const [editorRequest, setEditorRequest] = useState<ProjectScriptEditorRequest | null>(null);
  // Script writes replace the whole array, so two overlapping writes computed
  // from the same snapshot would drop each other's changes. One at a time.
  const [isSavingScripts, setIsSavingScripts] = useState(false);
  const savingScriptsRef = useRef(false);
  const t3File = useT3ProjectFileState(
    selectedCheckout.environmentId,
    selectedCheckout.workspaceRoot,
  );
  // What the "Default" option resolves to while no override is set: the
  // repo's t3.json value when present, otherwise the global setting.
  const inheritedEnvMode = t3File.file?.defaultThreadEnvMode ?? settings.defaultThreadEnvMode;
  const inheritedEnvModeSource = t3File.file?.defaultThreadEnvMode != null ? "t3.json" : "global";
  const importableScripts = useMemo(
    () =>
      t3File.scripts.filter(
        (fileScript) =>
          !scripts.some(
            (script) =>
              script.command === fileScript.command ||
              script.name.toLowerCase() === fileScript.name.toLowerCase(),
          ),
      ),
    [scripts, t3File.scripts],
  );

  const persistScripts = useCallback(
    async (
      nextScripts: ReadonlyArray<ReturnType<typeof buildProjectScript>>,
      keybinding: string | null | undefined,
      keybindingCommand: ReturnType<typeof commandForProjectScript>,
    ): Promise<AtomCommandResult<void, unknown>> => {
      if (savingScriptsRef.current) {
        return AsyncResult.failure(
          Cause.fail(new Error("Another script change is still saving. Try again.")),
        );
      }
      savingScriptsRef.current = true;
      setIsSavingScripts(true);
      try {
        // Captured before the write so a cleared or deleted binding can be
        // removed from the keybindings config afterwards.
        const previousKeybinding = keybindingValueForCommand(keybindings, keybindingCommand);
        const updateResult = mapAtomCommandResult(
          await updateProject({
            environmentId: selectedCheckout.environmentId,
            input: { projectId: selectedCheckout.id, scripts: nextScripts },
          }),
          () => undefined,
        );
        if (updateResult._tag === "Failure") {
          reportFailure("Failed to save scripts", updateResult);
          return updateResult;
        }

        const keybindingRule = decodeProjectScriptKeybindingRule({
          keybinding,
          command: keybindingCommand,
        });
        if (!isElectron) return updateResult;
        const environmentIds = [selectedCheckout.environmentId];
        const previousTarget = previousKeybinding
          ? decodeProjectScriptKeybindingRule({
              keybinding: previousKeybinding,
              command: keybindingCommand,
            })
          : null;
        if (keybindingRule) {
          // `replace` swaps the command's previous rule instead of appending a
          // second one that would keep the old shortcut alive.
          const input =
            previousTarget && previousTarget.key !== keybindingRule.key
              ? { ...keybindingRule, replace: previousTarget }
              : keybindingRule;
          for (const environmentId of environmentIds) {
            const result = mapAtomCommandResult(
              await upsertKeybinding({ environmentId, input }),
              () => undefined,
            );
            if (result._tag === "Failure") {
              reportFailure("Failed to save keybinding", result);
              return result;
            }
          }
        } else if (previousTarget) {
          for (const environmentId of environmentIds) {
            const result = mapAtomCommandResult(
              await removeKeybinding({ environmentId, input: previousTarget }),
              () => undefined,
            );
            if (result._tag === "Failure") {
              reportFailure("Failed to remove keybinding", result);
              return result;
            }
          }
        }
        return updateResult;
      } finally {
        savingScriptsRef.current = false;
        setIsSavingScripts(false);
      }
    },
    [
      keybindings,
      removeKeybinding,
      reportFailure,
      selectedCheckout.environmentId,
      selectedCheckout.id,
      updateProject,
      upsertKeybinding,
    ],
  );

  const submitScript = useCallback(
    async (
      scriptId: string | null,
      input: NewProjectScriptInput,
    ): Promise<AtomCommandResult<void, unknown>> => {
      if (scriptId === null) {
        const nextId = nextProjectScriptId(
          input.name,
          scripts.map((script) => script.id),
        );
        const nextScript = buildProjectScript(nextId, input);
        const nextScripts = input.runOnWorktreeCreate
          ? [
              ...scripts.map((script) =>
                script.runOnWorktreeCreate ? { ...script, runOnWorktreeCreate: false } : script,
              ),
              nextScript,
            ]
          : [...scripts, nextScript];
        return persistScripts(nextScripts, input.keybinding, commandForProjectScript(nextId));
      }

      const updatedScript = buildProjectScript(scriptId, input);
      const nextScripts = scripts.map((script) =>
        script.id === scriptId
          ? updatedScript
          : input.runOnWorktreeCreate
            ? { ...script, runOnWorktreeCreate: false }
            : script,
      );
      return persistScripts(nextScripts, input.keybinding, commandForProjectScript(scriptId));
    },
    [persistScripts, scripts],
  );

  const deleteScript = useCallback(
    (scriptId: string) => {
      const nextScripts = scripts.filter((script) => script.id !== scriptId);
      void persistScripts(nextScripts, null, commandForProjectScript(scriptId));
    },
    [persistScripts, scripts],
  );

  const importFileScript = useCallback(
    async (fileScript: T3ProjectFileScript) => {
      const payload: NewProjectScriptInput = {
        name: fileScript.name,
        command: fileScript.command,
        icon: fileScript.icon ?? "play",
        runOnWorktreeCreate: fileScript.runOnWorktreeCreate ?? false,
        keybinding: null,
        previewUrl: fileScript.previewUrl ?? null,
        autoOpenPreview: fileScript.previewUrl ? (fileScript.autoOpenPreview ?? false) : false,
      };
      const result = await submitScript(null, payload);
      if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
        const error = squashAtomCommandFailure(result);
        setEditorRequest({
          scriptId: null,
          initial: payload,
          error: error instanceof Error ? error.message : "Failed to import action.",
        });
      }
    },
    [submitScript],
  );

  // ----- checkouts -----
  const updateGroupingPreference = useCallback(
    (member: SidebarProjectGroupMember, selection: SidebarProjectGroupingMode | "inherit") => {
      const overrideKey = deriveProjectGroupingOverrideKey(member);
      const nextOverrides = { ...projectGroupingSettings.sidebarProjectGroupingOverrides };
      if (selection === "inherit") {
        delete nextOverrides[overrideKey];
      } else {
        nextOverrides[overrideKey] = selection;
      }
      updateClientSettings({ sidebarProjectGroupingOverrides: nextOverrides });
    },
    [projectGroupingSettings.sidebarProjectGroupingOverrides, updateClientSettings],
  );

  const removeMembers = useCallback(
    async (members: ReadonlyArray<SidebarProjectGroupMember>) => {
      const api = readLocalApi();
      if (!api) return;

      const memberKeys = new Set(members.map(memberKey));
      const projectThreads = threads.filter((thread) =>
        memberKeys.has(`${thread.environmentId}:${thread.projectId}`),
      );
      const isWholeGroup = members.length === group.memberProjects.length;
      const singleMember = members.length === 1 ? members[0]! : null;
      const targetLabel = singleMember?.title ?? group.displayName;
      const confirmed = await settlePromise(() =>
        api.dialogs.confirm(
          [
            projectThreads.length > 0
              ? `Remove project "${targetLabel}" and delete its ${projectThreads.length} thread${projectThreads.length === 1 ? "" : "s"}?`
              : `Remove project "${targetLabel}"?`,
            ...(singleMember
              ? [
                  `Path: ${singleMember.workspaceRoot}`,
                  ...(singleMember.environmentLabel
                    ? [`Environment: ${singleMember.environmentLabel}`]
                    : []),
                ]
              : [`This removes ${members.length} grouped project entries.`]),
            ...(projectThreads.length > 0
              ? ["This permanently clears conversation history for those threads."]
              : []),
            isWholeGroup
              ? "This removes only the project entries, not the files on disk."
              : "Other entries in this grouped project are unaffected.",
            "This action cannot be undone.",
          ].join("\n"),
          { variant: "destructive" },
        ),
      );
      if (confirmed._tag === "Failure" || !confirmed.value) return;

      const draftStore = useComposerDraftStore.getState();
      for (const member of members) {
        const memberThreads = projectThreads.filter(
          (thread) =>
            thread.environmentId === member.environmentId && thread.projectId === member.id,
        );
        const result = mapAtomCommandResult(
          await deleteProject({
            environmentId: member.environmentId,
            input: {
              projectId: member.id,
              ...(memberThreads.length > 0 ? { force: true } : {}),
            },
          }),
          () => undefined,
        );
        if (result._tag === "Failure") {
          reportFailure(`Failed to remove "${member.title}"`, result);
          return;
        }
        const projectRef = scopeProjectRef(member.environmentId, member.id);
        const projectDraftThread = draftStore.getDraftThreadByProjectRef(projectRef);
        if (projectDraftThread) {
          draftStore.clearDraftThread(projectDraftThread.draftId);
        }
        draftStore.clearProjectDraftThreadId(projectRef);
      }

      // The project's settings page just deleted itself; there is no projects
      // listing to fall back to, so leave settings entirely.
      if (isWholeGroup) {
        void navigate({ to: "/", replace: true });
      }
    },
    [
      deleteProject,
      group.displayName,
      group.memberProjects.length,
      navigate,
      reportFailure,
      threads,
    ],
  );

  const selectedCheckoutThreadCount = threadCountByMember.get(memberKey(selectedCheckout)) ?? 0;
  const selectedCheckoutGrouping =
    projectGroupingSettings.sidebarProjectGroupingOverrides?.[
      deriveProjectGroupingOverrideKey(selectedCheckout)
    ] ?? "inherit";
  const selectedCheckoutLabel = selectedCheckout.environmentLabel ?? "This machine";

  return (
    <>
      <SettingsPageContainer>
        <SettingsSection title="Command Deck">
          <SettingsRow
            title="Manual multi-agent orchestration"
            description="Create, assign, start, monitor, review, and restore independent provider Tasks for this project."
            control={
              <Button
                size="sm"
                onClick={() =>
                  void navigate({
                    to: "/projects/$projectKey/command-deck",
                    params: { projectKey: group.projectKey },
                  })
                }
              >
                Open Command Deck
              </Button>
            }
          />
        </SettingsSection>
        <SettingsSection title="Terminal Center">
          <SettingsRow
            title="Spatial provider workspace"
            description="Launch and organize canonical provider Threads without requiring a Task or Mission."
            control={
              <Button
                size="sm"
                onClick={() =>
                  void navigate({
                    to: "/projects/$projectKey/terminal-center",
                    params: { projectKey: group.projectKey },
                  })
                }
              >
                Open Terminal Center
              </Button>
            }
          />
        </SettingsSection>
        <SettingsSection title="Dev Servers">
          <SettingsRow
            title="Approved development commands"
            description="Nebula never runs a discovered repository command automatically. Add the exact command only after you have reviewed it."
            control={
              <span className="text-sm text-muted-foreground">
                {devServerProfiles.length} approved
              </span>
            }
          />
          <div className="space-y-3 border-t border-border/70 px-4 py-4 sm:px-6">
            {devServerProfiles.map((profile) => (
              <div
                key={profile.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/20 p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{profile.name}</p>
                  <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                    {profile.command}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {profile.workingDirectory}
                    {profile.preferredPort ? ` · :${profile.preferredPort}` : ""}
                    {profile.previewUrl ? ` · ${profile.previewUrl}` : ""}
                  </p>
                </div>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  aria-label={`Delete ${profile.name} Dev Server profile`}
                  onClick={() =>
                    saveDevServerProfiles(
                      devServerProfiles.filter((candidate) => candidate.id !== profile.id),
                    )
                  }
                >
                  <Trash2Icon />
                </Button>
              </div>
            ))}
            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                aria-label="Dev Server profile name"
                placeholder="Web"
                value={devServerName}
                onChange={(event) => setDevServerName(event.currentTarget.value)}
              />
              <Input
                aria-label="Dev Server command"
                placeholder="npm run dev"
                value={devServerCommand}
                onChange={(event) => setDevServerCommand(event.currentTarget.value)}
              />
              <Input
                aria-label="Dev Server working directory"
                placeholder="."
                value={devServerWorkingDirectory}
                onChange={(event) => setDevServerWorkingDirectory(event.currentTarget.value)}
              />
              <Input
                aria-label="Dev Server preferred port"
                inputMode="numeric"
                placeholder="3000"
                value={devServerPort}
                onChange={(event) => setDevServerPort(event.currentTarget.value)}
              />
              <Input
                aria-label="Dev Server preview URL"
                placeholder="http://localhost:3000"
                value={devServerPreviewUrl}
                onChange={(event) => setDevServerPreviewUrl(event.currentTarget.value)}
                className="sm:col-span-2"
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                Saving records this exact command as human-approved for this Project.
              </p>
              <Button size="sm" onClick={approveDevServerProfile}>
                <PlusIcon /> Approve profile
              </Button>
            </div>
          </div>
        </SettingsSection>
        <ProjectQualityAndReviewSettings project={representative} />
        <ProjectSharedResourcesSettings project={representative} />
        <ProjectTasksSection project={representative} />
        <SettingsSection title="Project">
          <SettingsRow
            title="Name"
            description="The shared name for this project group in the sidebar and thread lists."
            control={
              <Input
                key={`${group.projectKey}:${group.displayName}`}
                className="w-full sm:w-64"
                aria-label="Project name"
                defaultValue={group.displayName}
                onBlur={(event) => {
                  void renameGroup(event.currentTarget.value);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                }}
              />
            }
          />
          <SettingsRow
            title="Project icon"
            description={faviconPath ?? "Automatic"}
            resetAction={
              faviconPath !== null ? (
                <SettingResetButton
                  label="project icon"
                  disabled={isSavingFavicon}
                  onClick={() => void setFaviconPath(null)}
                />
              ) : null
            }
            control={
              <div className="flex items-center gap-2">
                <ProjectFavicon
                  environmentId={representative.environmentId}
                  cwd={representative.workspaceRoot}
                  faviconPath={faviconPath}
                  className="size-6"
                />
                <Button
                  size="xs"
                  variant="outline"
                  type="button"
                  aria-label="Choose a project icon file"
                  disabled={isSavingFavicon}
                  onClick={() => setFaviconPickerOpen(true)}
                >
                  Choose file
                </Button>
              </div>
            }
          />
        </SettingsSection>

        <SettingsSection title="New threads">
          <SettingsRow
            title="Model"
            description="New threads in this project start with this model. Applies to every checkout in this group."
            resetAction={
              storedSelection !== null ? (
                <SettingResetButton
                  label="project default model"
                  onClick={() => setDefaultModel(null)}
                />
              ) : null
            }
            control={
              resolvedSelection && activeEntry ? (
                <div className="flex flex-wrap items-center justify-end gap-1.5">
                  <ProviderModelPicker
                    activeInstanceId={resolvedSelection.instanceId}
                    model={resolvedSelection.model}
                    lockedProvider={null}
                    instanceEntries={instanceEntries}
                    modelOptionsByInstance={modelOptionsByInstance}
                    triggerVariant="outline"
                    triggerClassName="min-w-0 max-w-none shrink-0 text-foreground/90 hover:text-foreground"
                    onInstanceModelChange={(instanceId, model) => {
                      setDefaultModel(createModelSelection(instanceId, model));
                    }}
                  />
                  <TraitsPicker
                    provider={activeEntry.driverKind as ProviderDriverKind}
                    models={activeEntry.models}
                    model={resolvedSelection.model}
                    prompt=""
                    onPromptChange={() => {}}
                    modelOptions={resolvedSelection.options ?? []}
                    allowPromptInjectedEffort={false}
                    planModeEnabled={settings.planModeEnabled}
                    triggerVariant="outline"
                    triggerClassName="min-w-0 max-w-none shrink-0 text-foreground/90 hover:text-foreground"
                    onModelOptionsChange={(nextOptions) => {
                      setDefaultModel(
                        createModelSelection(
                          resolvedSelection.instanceId,
                          resolvedSelection.model,
                          nextOptions,
                        ),
                      );
                    }}
                  />
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">No providers available</span>
              )
            }
          />
          <SettingsRow
            title="Workspace"
            description="Where new threads in this project start. Overrides t3.json and the global default; applies to every checkout in this group."
            resetAction={
              storedEnvMode !== null ? (
                <SettingResetButton
                  label="project workspace default"
                  onClick={() => setDefaultThreadEnvMode(null)}
                />
              ) : null
            }
            control={
              <Select
                value={storedEnvMode ?? "inherit"}
                onValueChange={(value) => {
                  if (value === "worktree" || value === "local") {
                    setDefaultThreadEnvMode(value);
                  } else if (value === "inherit") {
                    setDefaultThreadEnvMode(null);
                  }
                }}
              >
                <SelectTrigger aria-label="New-thread workspace">
                  <SelectValue>
                    {storedEnvMode === null
                      ? group.memberProjects.length > 1
                        ? "Default (per checkout)"
                        : `Default (${resolveEnvModeLabel(inheritedEnvMode).toLowerCase()})`
                      : resolveEnvModeLabel(storedEnvMode)}
                  </SelectValue>
                </SelectTrigger>
                <SelectPopup align="end" alignItemWithTrigger={false}>
                  <SelectItem value="inherit">
                    {group.memberProjects.length > 1
                      ? "Default (each checkout's t3.json or global setting)"
                      : `Default (${inheritedEnvModeSource}: ${resolveEnvModeLabel(inheritedEnvMode).toLowerCase()})`}
                  </SelectItem>
                  <SelectItem value="worktree">{resolveEnvModeLabel("worktree")}</SelectItem>
                  <SelectItem value="local">{resolveEnvModeLabel("local")}</SelectItem>
                </SelectPopup>
              </Select>
            }
          />
        </SettingsSection>

        <SettingsSection
          title="Checkout"
          headerAction={
            <Select
              value={selectedCheckout.physicalProjectKey}
              onValueChange={(value) => setSelectedCheckoutKey(String(value))}
            >
              <SelectTrigger className="max-w-64" aria-label="Selected checkout">
                <SelectValue>{selectedCheckoutLabel}</SelectValue>
              </SelectTrigger>
              <SelectPopup align="end" alignItemWithTrigger={false}>
                {group.memberProjects.map((member) => (
                  <SelectItem
                    key={member.physicalProjectKey}
                    hideIndicator
                    value={member.physicalProjectKey}
                  >
                    {member.environmentLabel ?? "This machine"} · {member.workspaceRoot}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          }
        >
          <div className="px-3 py-2 sm:px-4">
            <div className="flex min-w-0 items-center rounded-lg bg-muted/30 p-1 text-base text-muted-foreground sm:text-sm">
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      aria-label="Copy checkout path"
                      className="group flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-left outline-none hover:bg-accent/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                      type="button"
                      onClick={() =>
                        copyPathToClipboard(selectedCheckout.workspaceRoot, {
                          path: selectedCheckout.workspaceRoot,
                        })
                      }
                    >
                      <code className="min-w-0 flex-1 truncate font-mono">
                        {selectedCheckout.workspaceRoot}
                      </code>
                      <CopyIcon className="size-4 shrink-0 opacity-60 group-hover:opacity-100" />
                    </button>
                  }
                />
                <TooltipPopup side="top">Copy path</TooltipPopup>
              </Tooltip>
              <div className="shrink-0 border-l border-border/60 px-2 tabular-nums">
                {selectedCheckoutThreadCount === 1
                  ? "1 thread"
                  : `${selectedCheckoutThreadCount} threads`}
              </div>
            </div>
          </div>
          <SettingsRow
            title="Project grouping"
            description="How this checkout joins project groups in the sidebar. Changing it can move you to a different project group."
            control={
              <Select
                value={selectedCheckoutGrouping}
                onValueChange={(value) => {
                  if (
                    value === "inherit" ||
                    value === "repository" ||
                    value === "repository_path" ||
                    value === "separate"
                  ) {
                    updateGroupingPreference(selectedCheckout, value);
                  }
                }}
              >
                <SelectTrigger aria-label={`Grouping rule for ${selectedCheckoutLabel}`}>
                  <SelectValue>
                    {selectedCheckoutGrouping === "inherit"
                      ? `Default (${PROJECT_GROUPING_MODE_LABELS[projectGroupingSettings.sidebarProjectGroupingMode]})`
                      : PROJECT_GROUPING_MODE_LABELS[selectedCheckoutGrouping]}
                  </SelectValue>
                </SelectTrigger>
                <SelectPopup align="end" alignItemWithTrigger={false}>
                  <SelectItem hideIndicator value="inherit">
                    Use global default
                  </SelectItem>
                  <SelectItem hideIndicator value="repository">
                    {PROJECT_GROUPING_MODE_LABELS.repository}
                  </SelectItem>
                  <SelectItem hideIndicator value="repository_path">
                    {PROJECT_GROUPING_MODE_LABELS.repository_path}
                  </SelectItem>
                  <SelectItem hideIndicator value="separate">
                    {PROJECT_GROUPING_MODE_LABELS.separate}
                  </SelectItem>
                </SelectPopup>
              </Select>
            }
          />
          {group.memberProjects.length > 1 ? (
            <SettingsRow
              title="Remove checkout"
              description="Removes this checkout and its threads from the project group. Files on disk are not touched."
              control={
                <Button
                  size="xs"
                  variant="destructive-outline"
                  onClick={() => void removeMembers([selectedCheckout])}
                >
                  <Trash2Icon className="size-3.5" />
                  Remove checkout
                </Button>
              }
            />
          ) : null}
          <div className="flex min-h-8 flex-col items-start gap-3 px-3 pt-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-4">
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-foreground">Actions</h3>
              <p className="text-pretty text-sm text-muted-foreground">
                Saved and run only in {selectedCheckoutLabel}.
              </p>
            </div>
            <div className="flex w-full flex-wrap gap-1.5 sm:w-auto sm:shrink-0 sm:justify-end">
              {importableScripts.length > 0 ? (
                <Menu>
                  <MenuTrigger
                    render={
                      <Button size="xs" variant="ghost" disabled={isSavingScripts} type="button" />
                    }
                  >
                    Import scripts
                    <ChevronDownIcon className="size-3.5" />
                  </MenuTrigger>
                  <MenuPopup align="end" className="w-72">
                    <MenuGroup>
                      <MenuGroupLabel>Import from t3.json</MenuGroupLabel>
                      <p className="px-2 pb-2 text-pretty text-sm text-muted-foreground">
                        Add actions declared by this checkout without editing them first.
                      </p>
                    </MenuGroup>
                    <MenuSeparator />
                    {importableScripts.map((fileScript) => (
                      <MenuItem
                        key={`${fileScript.name} ${fileScript.command}`}
                        onClick={() => void importFileScript(fileScript)}
                      >
                        <ScriptIcon icon={fileScript.icon ?? "play"} className="size-4 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">{fileScript.name}</div>
                          <div className="truncate font-mono text-muted-foreground">
                            {fileScript.command}
                          </div>
                        </div>
                      </MenuItem>
                    ))}
                  </MenuPopup>
                </Menu>
              ) : null}
              <Button
                size="xs"
                variant="outline"
                disabled={isSavingScripts}
                onClick={() =>
                  setEditorRequest({ scriptId: null, initial: EMPTY_PROJECT_SCRIPT_INPUT })
                }
              >
                <PlusIcon className="size-3.5" />
                Add action
              </Button>
            </div>
          </div>
          {scripts.length === 0 ? (
            <p className="px-3 py-2 text-base text-muted-foreground sm:px-4 sm:text-sm">
              No actions configured for this checkout.
            </p>
          ) : (
            scripts.map((script) => {
              const shortcutLabel = shortcutLabelForCommand(
                keybindings,
                commandForProjectScript(script.id),
              );
              return (
                <SettingsRow
                  key={script.id}
                  className="group py-2"
                  title={
                    <span className="flex min-w-0 items-center gap-2">
                      <ScriptIcon
                        icon={script.icon}
                        className="size-4 shrink-0 text-muted-foreground"
                      />
                      <span className="max-w-40 shrink-0 truncate">{script.name}</span>
                      <code className="min-w-0 flex-1 truncate font-mono font-normal text-muted-foreground">
                        {script.command}
                      </code>
                      {script.runOnWorktreeCreate ? (
                        <span className="shrink-0 rounded-sm border border-border/60 px-1.5 py-px text-[11px] font-normal text-muted-foreground">
                          setup
                        </span>
                      ) : null}
                      {script.previewUrl ? (
                        <span className="shrink-0 rounded-sm border border-border/60 px-1.5 py-px text-[11px] font-normal text-muted-foreground max-sm:hidden">
                          preview · desktop only
                        </span>
                      ) : null}
                    </span>
                  }
                  control={
                    <>
                      {shortcutLabel ? (
                        <span className="text-xs text-muted-foreground">{shortcutLabel}</span>
                      ) : null}
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        className="shrink-0 text-muted-foreground opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
                        aria-label={`Edit ${script.name}`}
                        disabled={isSavingScripts}
                        onClick={() =>
                          setEditorRequest(editorRequestForScript(script, keybindings))
                        }
                      >
                        <SettingsIcon className="size-3.5" />
                      </Button>
                    </>
                  }
                />
              );
            })
          )}
          {t3File.status === "invalid" ? (
            <SettingsRow
              title="t3.json is invalid"
              description="A t3.json exists in this checkout but fails to parse, so every action and icon it declares is ignored. Check the JSON syntax and icon values."
              className="text-warning"
            />
          ) : null}
        </SettingsSection>

        <SettingsSection title="Danger">
          <SettingsRow
            title={
              group.memberProjects.length > 1 ? "Remove this project everywhere" : "Remove project"
            }
            description={
              group.memberProjects.length > 1
                ? `Deletes all ${group.memberProjects.length} checkout entries and their threads on every machine. Files on disk are not touched.`
                : "Deletes the project entry and its threads. Files on disk are not touched."
            }
            control={
              <Button
                variant="destructive-outline"
                onClick={() => void removeMembers(group.memberProjects)}
              >
                <Trash2Icon />
                {group.memberProjects.length > 1 ? "Remove all entries" : "Remove project"}
              </Button>
            }
          />
        </SettingsSection>
      </SettingsPageContainer>

      <ProjectScriptEditorDialog
        request={editorRequest}
        scripts={scripts}
        onSubmit={submitScript}
        onDelete={deleteScript}
        onClose={() => setEditorRequest(null)}
      />
      <ProjectFaviconPickerDialog
        key={`${representative.environmentId}:${representative.workspaceRoot}:${faviconPickerOpen}`}
        cwd={representative.workspaceRoot}
        environmentId={representative.environmentId}
        onOpenChange={setFaviconPickerOpen}
        {...(pickProjectFavicon
          ? { onPickExternal: () => pickProjectFavicon(representative.workspaceRoot) }
          : {})}
        onSelect={(path) => void setFaviconPath(path)}
        open={faviconPickerOpen}
        projectName={group.displayName}
      />
    </>
  );
}
