import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import type { ProjectDiscoveryResult } from "@t3tools/contracts";
import { FolderPlusIcon, RefreshCwIcon, Trash2Icon } from "lucide-react";
import { useMemo, useState } from "react";

import { useClientSettings, useUpdateClientSettings } from "../../hooks/useSettings";
import { useNewThreadHandler } from "../../hooks/useHandleNewThread";
import { normalizeProjectPathForComparison } from "../../lib/projectPaths";
import { newProjectId } from "../../lib/utils";
import { readLocalApi } from "../../localApi";
import { usePrimaryEnvironmentId } from "../../state/environments";
import { useProjects } from "../../state/entities";
import { filesystemEnvironment } from "../../state/filesystem";
import { projectEnvironment } from "../../state/projects";
import { useAtomCommand } from "../../state/use-atom-command";
import { useAtomQueryRunner } from "../../state/use-atom-query-runner";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { stackedThreadToast, toastManager } from "../ui/toast";
import { SettingsRow, SettingsSection } from "./settingsLayout";

function titleFromPath(path: string): string {
  return (
    path
      .replace(/[\\/]$/, "")
      .split(/[\\/]/)
      .at(-1) || "Local Project"
  );
}

export function LocalProjectsSettings() {
  const settings = useClientSettings();
  const updateSettings = useUpdateClientSettings();
  const environmentId = usePrimaryEnvironmentId();
  const projects = useProjects();
  const discoverProjects = useAtomQueryRunner(filesystemEnvironment.discoverProjects, {
    reportFailure: false,
    reportDefect: false,
  });
  const createProject = useAtomCommand(projectEnvironment.create, { reportFailure: false });
  const openThread = useNewThreadHandler();
  const [manualRoot, setManualRoot] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [result, setResult] = useState<ProjectDiscoveryResult | null>(null);
  const roots = settings.projectDiscoveryRoots;
  const registeredPaths = useMemo(
    () =>
      new Set(
        projects
          .filter((project) => project.environmentId === environmentId)
          .map((project) => normalizeProjectPathForComparison(project.workspaceRoot)),
      ),
    [environmentId, projects],
  );

  const addRoot = (path: string) => {
    const trimmed = path.trim().replace(/[\\/]$/, "");
    if (!trimmed) return;
    const normalized = normalizeProjectPathForComparison(trimmed);
    if (roots.some((root) => normalizeProjectPathForComparison(root) === normalized)) return;
    updateSettings({ projectDiscoveryRoots: [...roots, trimmed] });
    setManualRoot("");
  };

  const pickRoot = async () => {
    const api = readLocalApi();
    if (!api) return;
    const picked = await api.dialogs.pickFolder({
      initialPath: roots.at(-1) ?? null,
      ...(environmentId ? { targetEnvironmentId: environmentId } : {}),
    });
    if (picked) addRoot(picked);
  };

  const refresh = async () => {
    if (!environmentId || roots.length === 0) return;
    setRefreshing(true);
    const next = await discoverProjects({
      environmentId,
      input: { roots, maxDepth: 4, limit: 200 },
    });
    setRefreshing(false);
    if (next._tag === "Success") {
      setResult(next.value);
      return;
    }
    const error = squashAtomCommandFailure(next);
    toastManager.add(
      stackedThreadToast({
        type: "error",
        title: "Project discovery failed",
        description:
          error instanceof Error ? error.message : "The approved folders could not be scanned.",
      }),
    );
  };

  const addAndOpen = async (entry: NonNullable<typeof result>["entries"][number]) => {
    if (!environmentId) return;
    const existing = projects.find(
      (project) =>
        project.environmentId === environmentId &&
        normalizeProjectPathForComparison(project.workspaceRoot) ===
          normalizeProjectPathForComparison(entry.canonicalPath),
    );
    if (existing) {
      await openThread(scopeProjectRef(existing.environmentId, existing.id));
      return;
    }
    const projectId = newProjectId();
    const created = await createProject({
      environmentId,
      input: {
        projectId,
        title: entry.title || titleFromPath(entry.canonicalPath),
        workspaceRoot: entry.canonicalPath,
        createWorkspaceRootIfMissing: false,
      },
    });
    if (created._tag === "Failure") {
      const error = squashAtomCommandFailure(created);
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: "Could not add Project",
          description:
            error instanceof Error ? error.message : "The Project could not be registered.",
        }),
      );
      return;
    }
    await openThread(scopeProjectRef(environmentId, projectId));
  };

  return (
    <SettingsSection title="Local Projects">
      <SettingsRow
        title="Approved discovery folders"
        description="Nebula scans only folders you add here. It never scans your full home or disk automatically."
        control={
          <Button size="xs" variant="outline" onClick={() => void pickRoot()}>
            <FolderPlusIcon /> Add discovery folder
          </Button>
        }
      />
      <div className="space-y-3 border-t border-border/70 px-4 py-4 sm:px-6">
        <div className="flex gap-2">
          <Input
            aria-label="Discovery folder path"
            placeholder="~/Developer"
            value={manualRoot}
            onChange={(event) => setManualRoot(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") addRoot(manualRoot);
            }}
          />
          <Button variant="outline" onClick={() => addRoot(manualRoot)}>
            Add
          </Button>
        </div>
        {roots.map((root) => (
          <div
            key={root}
            className="flex items-center gap-2 rounded-lg border border-border px-3 py-2"
          >
            <span className="min-w-0 flex-1 truncate font-mono text-xs">{root}</span>
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label={`Remove discovery folder ${root}`}
              onClick={() =>
                updateSettings({
                  projectDiscoveryRoots: roots.filter((candidate) => candidate !== root),
                })
              }
            >
              <Trash2Icon />
            </Button>
          </div>
        ))}
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Bounded to 4 levels, 200 results, 5,000 directories, or 2 seconds per refresh.
          </p>
          <Button
            size="sm"
            disabled={refreshing || roots.length === 0 || !environmentId}
            onClick={() => void refresh()}
          >
            <RefreshCwIcon className={refreshing ? "animate-spin" : undefined} />
            {refreshing ? "Scanning…" : "Refresh"}
          </Button>
        </div>
        {result ? (
          <div className="space-y-2">
            {result.entries.map((entry) => {
              const registered = registeredPaths.has(
                normalizeProjectPathForComparison(entry.canonicalPath),
              );
              return (
                <div
                  key={entry.canonicalPath}
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/20 p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{entry.title}</p>
                    <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                      {entry.canonicalPath}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {entry.signals.includes("git")
                        ? "Local Git repository"
                        : entry.signals.join(" · ")}
                      {registered ? " · Already added" : " · Not yet added to Nebula"}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant={registered ? "outline" : "default"}
                    onClick={() => void addAndOpen(entry)}
                  >
                    {registered ? "Open" : "Add & Open"}
                  </Button>
                </div>
              );
            })}
            {result.entries.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                No Project roots found under the approved folders.
              </p>
            ) : null}
            {result.truncated ? (
              <p className="text-xs text-muted-foreground">
                Results were capped to keep discovery responsive. Narrow the approved root for a
                deeper scan.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </SettingsSection>
  );
}
