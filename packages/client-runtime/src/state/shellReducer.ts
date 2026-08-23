import * as Arr from "effect/Array";
import type { OrchestrationShellSnapshot, OrchestrationShellStreamEvent } from "@t3tools/contracts";

/**
 * Reduce a single shell stream event into an existing snapshot, returning a new
 * snapshot with the event's changes applied. This is a pure reducer that both
 * web and mobile can use to keep their local shell snapshot in sync.
 *
 * Returns the original snapshot reference unchanged if the event is not
 * recognized (forward-compatible).
 */
export function applyShellStreamEvent(
  snapshot: OrchestrationShellSnapshot,
  event: OrchestrationShellStreamEvent,
): OrchestrationShellSnapshot {
  if (event.sequence <= snapshot.snapshotSequence) return snapshot;

  switch (event.kind) {
    case "project-upserted": {
      const projects = snapshot.projects.some((p) => p.id === event.project.id)
        ? Arr.map(snapshot.projects, (p) => (p.id === event.project.id ? event.project : p))
        : Arr.append(snapshot.projects, event.project);
      const integrationByMissionId = new Map(
        (event.project.integrationBatches ?? []).flatMap((batch) =>
          batch.missionId ? [[batch.missionId, batch.id] as const] : [],
        ),
      );
      const missions = (snapshot.missions ?? []).map((mission) => {
        const integrationBatchId = integrationByMissionId.get(mission.id);
        return integrationBatchId && mission.integrationBatchId !== integrationBatchId
          ? { ...mission, integrationBatchId }
          : mission;
      });
      return { ...snapshot, projects, missions, snapshotSequence: event.sequence };
    }
    case "project-removed":
      return {
        ...snapshot,
        projects: Arr.filter(snapshot.projects, (p) => p.id !== event.projectId),
        snapshotSequence: event.sequence,
      };
    case "thread-upserted": {
      const threads = snapshot.threads.some((t) => t.id === event.thread.id)
        ? Arr.map(snapshot.threads, (t) => (t.id === event.thread.id ? event.thread : t))
        : Arr.append(snapshot.threads, event.thread);
      return { ...snapshot, threads, snapshotSequence: event.sequence };
    }
    case "thread-removed":
      return {
        ...snapshot,
        threads: Arr.filter(snapshot.threads, (t) => t.id !== event.threadId),
        snapshotSequence: event.sequence,
      };
    case "task-upserted": {
      const currentTasks = snapshot.tasks ?? [];
      const tasks = currentTasks.some((task) => task.id === event.task.id)
        ? Arr.map(currentTasks, (task) => (task.id === event.task.id ? event.task : task))
        : Arr.append(currentTasks, event.task);
      return { ...snapshot, tasks, snapshotSequence: event.sequence };
    }
    case "mission-upserted": {
      const currentMissions = snapshot.missions ?? [];
      const missions = currentMissions.some((mission) => mission.id === event.mission.id)
        ? Arr.map(currentMissions, (mission) =>
            mission.id === event.mission.id ? event.mission : mission,
          )
        : Arr.append(currentMissions, event.mission);
      return { ...snapshot, missions, snapshotSequence: event.sequence };
    }
    default:
      return snapshot;
  }
}
