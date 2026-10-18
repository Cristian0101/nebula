import { useCallback, useEffect, useState } from "react";
import type {
  GetProjectInventoryInput,
  ProjectInventory,
  ScopedProjectRef,
} from "@t3tools/contracts";
import { useEnvironmentQuery } from "../../../state/query";
import { projectEnvironment } from "../../../state/projects";
import { appendInventoryPage, belongsToProject, PAGE_LIMIT } from "./branchInventoryModel";

// Bounded, memory-only display cache. Never an authority for execution or cross-host fallback.
const cachedInventories = new Map<string, readonly ProjectInventory[]>();
export function useBranchInventory(project: ScopedProjectRef, enabled: boolean) {
  const key = JSON.stringify([project.environmentId, project.projectId]);
  const [pages, setPages] = useState<readonly ProjectInventory[]>(
    () => cachedInventories.get(key) ?? [],
  );
  const [remote, setRemote] = useState(false);
  const [request, setRequest] = useState<GetProjectInventoryInput>({
    projectId: project.projectId,
    refKind: "local",
    limit: PAGE_LIMIT,
  });
  const [notice, setNotice] = useState("");
  const [restarted, setRestarted] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const query = useEnvironmentQuery(
    enabled
      ? projectEnvironment.inventory({ environmentId: project.environmentId, input: request })
      : null,
  );
  useEffect(() => {
    const page = query.data;
    if (!page || query.isPending) return;
    if (!belongsToProject(page, project)) {
      setPages([]);
      setBlocked(true);
      setNotice(
        "Inventory identity differs from the selected physical Project. Reconnect and retry.",
      );
      return;
    }
    if (page.issues.includes("stale-cursor")) {
      setPages([]);
      cachedInventories.delete(key);
      if (restarted) {
        setBlocked(true);
        setNotice("Inventory changed again. Pagination paused; refresh locally to retry.");
      } else {
        setNotice(
          "Inventory changed. Pagination restarted from page one; previous pages were discarded.",
        );
        setRestarted(true);
        setRequest({
          projectId: project.projectId,
          limit: PAGE_LIMIT,
          ...(remote ? {} : { refKind: "local" }),
        });
      }
      return;
    }
    setPages((previous) => {
      const next = request.cursor ? appendInventoryPage(previous, page) : [page];
      if (!next) {
        setBlocked(true);
        setNotice(
          "Observation generation changed. Pages were discarded; refresh locally to retry.",
        );
        return [];
      }
      cachedInventories.delete(key);
      if (!remote) cachedInventories.set(key, next);
      if (cachedInventories.size > 32)
        cachedInventories.delete(cachedInventories.keys().next().value!);
      return next;
    });
  }, [
    query.data,
    query.isPending,
    key,
    project.environmentId,
    project.projectId,
    request,
    remote,
    restarted,
  ]);
  const restart = useCallback(
    (includeRemote: boolean) => {
      setPages([]);
      cachedInventories.delete(key);
      setRemote(includeRemote);
      setRestarted(false);
      setBlocked(false);
      setNotice(
        includeRemote
          ? "Showing local and locally recorded remote-tracking refs. Remote freshness is not verified."
          : "Refreshing local Git observations. No remote fetch.",
      );
      setRequest({
        projectId: project.projectId,
        limit: PAGE_LIMIT,
        refresh: true,
        ...(includeRemote ? {} : { refKind: "local" }),
      });
      if (request.refresh === true && remote === includeRemote && !request.cursor) query.refresh();
    },
    [key, project.projectId, query.refresh, remote, request],
  );
  return {
    pages,
    remote,
    notice,
    error: query.error !== null,
    pending: query.isPending,
    refresh: () => restart(remote),
    showRemote: () => restart(true),
    loadMore: () => {
      const cursor = pages.at(-1)?.nextCursor;
      if (!enabled || query.isPending || !cursor || blocked) return;
      setRequest({
        projectId: project.projectId,
        limit: PAGE_LIMIT,
        cursor,
        ...(remote ? {} : { refKind: "local" }),
      });
    },
    blocked,
  };
}
