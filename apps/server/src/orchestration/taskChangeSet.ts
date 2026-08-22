import type { TaskChangeType } from "@t3tools/contracts";

export interface TaskChange {
  readonly path: string;
  readonly changeType: TaskChangeType;
  readonly previousPath?: string;
}

export function parseNameStatus(output: string): TaskChange[] {
  const fields = output.split("\0");
  if (fields.at(-1) === "") fields.pop();
  const changes: TaskChange[] = [];
  for (let index = 0; index < fields.length; ) {
    const status = fields[index++] ?? "";
    const code = status[0];
    if (code === "R" || code === "C") {
      const previousPath = fields[index++];
      const path = fields[index++];
      if (previousPath && path) {
        changes.push({
          path,
          previousPath,
          changeType: code === "R" ? "renamed" : "copied",
        });
      }
      continue;
    }
    const path = fields[index++];
    if (!path) continue;
    changes.push({
      path,
      changeType: code === "A" ? "added" : code === "D" ? "deleted" : "modified",
    });
  }
  return changes;
}

export function mergeUntrackedChanges(
  tracked: ReadonlyArray<TaskChange>,
  output: string,
): TaskChange[] {
  const paths = output.split("\0").filter(Boolean);
  const untracked = new Set(paths);
  const normalized = tracked.map((change) =>
    change.changeType === "added" && untracked.has(change.path)
      ? { ...change, changeType: "untracked" as const }
      : change,
  );
  const existing = new Set(
    normalized.flatMap((change) => [change.path, change.previousPath ?? ""]),
  );
  return [
    ...normalized,
    ...paths
      .filter((path) => !existing.has(path))
      .map((path): TaskChange => ({ path, changeType: "untracked" })),
  ];
}
