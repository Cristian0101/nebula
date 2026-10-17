import { EnvironmentId, ProjectId, type ScopedProjectRef } from "@t3tools/contracts";
import type { SidebarProjectSnapshot } from "./sidebarProjectGrouping";

export const PROJECT_DESTINATIONS = [
  { id: "overview", label: "Overview", to: "/projects/$projectKey" },
  { id: "workbench", label: "Workbench", to: "/projects/$projectKey/terminal-center" },
  { id: "tasks", label: "Tasks", to: "/projects/$projectKey/command-deck" },
  { id: "settings", label: "Settings", to: "/projects/$projectKey/settings" },
] as const;
export type ProjectDestination = (typeof PROJECT_DESTINATIONS)[number]["id"];

/** Navigation identity only. RPCs still resolve Project IDs on their own environment. */
export function encodeProjectCheckout(ref: ScopedProjectRef): string {
  const bytes = new TextEncoder().encode(JSON.stringify([ref.environmentId, ref.projectId]));
  return `v1.${btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "")}`;
}

export function decodeProjectCheckout(value: string): ScopedProjectRef | null {
  if (!/^v1\.[A-Za-z0-9_-]+$/.test(value) || value.length > 2048) return null;
  try {
    const bytes = Uint8Array.from(
      atob(value.slice(3).replaceAll("-", "+").replaceAll("_", "/")),
      (c) => c.charCodeAt(0),
    );
    const parsed: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (
      !Array.isArray(parsed) ||
      parsed.length !== 2 ||
      parsed.some((id) => typeof id !== "string" || !id || id.length > 512)
    )
      return null;
    const ref = {
      environmentId: EnvironmentId.make(parsed[0]),
      projectId: ProjectId.make(parsed[1]),
    };
    return encodeProjectCheckout(ref) === value ? ref : null;
  } catch {
    return null;
  }
}

/** Preserve even malformed explicit values so they cannot disappear into a fallback. */
export function parseProjectNavigationSearch(search: Record<string, unknown>): {
  checkout?: string;
} {
  return Object.hasOwn(search, "checkout")
    ? { checkout: typeof search.checkout === "string" ? search.checkout : "" }
    : {};
}

export interface ProjectNavigationSelection {
  readonly projectKey: string;
  readonly checkout: string;
  readonly destination: ProjectDestination;
  /** Previously displayed member, used only to follow client grouping changes. */
  readonly lastResolvedCheckout?: string;
}

export function sanitizeProjectNavigation(value: unknown): ProjectNavigationSelection | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<ProjectNavigationSelection>;
  if (
    typeof candidate.projectKey !== "string" ||
    !candidate.projectKey ||
    typeof candidate.checkout !== "string" ||
    !PROJECT_DESTINATIONS.some((destination) => destination.id === candidate.destination)
  )
    return null;
  return {
    projectKey: candidate.projectKey,
    checkout: candidate.checkout,
    destination: candidate.destination!,
    ...(typeof candidate.lastResolvedCheckout === "string" &&
    decodeProjectCheckout(candidate.lastResolvedCheckout)
      ? { lastResolvedCheckout: candidate.lastResolvedCheckout }
      : {}),
  };
}

export function resolveProjectCheckout(input: {
  group: SidebarProjectSnapshot | null;
  explicitCheckout?: string | undefined;
  rememberedCheckout?: string | undefined;
  allowRepresentative?: boolean;
}) {
  const { group } = input;
  const requested = input.explicitCheckout ?? input.rememberedCheckout;
  const source =
    input.explicitCheckout !== undefined
      ? "explicit"
      : input.rememberedCheckout !== undefined
        ? "remembered"
        : "representative";
  if (!group)
    return { member: null, checkout: requested, source, reason: "Project unavailable" } as const;
  if (requested !== undefined) {
    const ref = decodeProjectCheckout(requested);
    const member = ref
      ? (group.memberProjects.find(
          (member) => member.environmentId === ref.environmentId && member.id === ref.projectId,
        ) ?? null)
      : null;
    return {
      member,
      checkout: requested,
      source,
      reason: member ? null : "Checkout unavailable",
    } as const;
  }
  // A representative is safe only when it represents one possible physical checkout.
  const member =
    input.allowRepresentative !== false && group.memberProjects.length === 1
      ? group.memberProjects[0]!
      : null;
  return {
    member,
    checkout: member
      ? encodeProjectCheckout({ environmentId: member.environmentId, projectId: member.id })
      : undefined,
    source,
    reason: member ? null : "Select checkout",
  } as const;
}

export function findProjectSuccessor(
  groups: readonly SidebarProjectSnapshot[],
  checkout: string | undefined,
) {
  const ref = checkout === undefined ? null : decodeProjectCheckout(checkout);
  if (!ref) return null;
  const candidates = groups.filter((group) =>
    group.memberProjects.some(
      (member) => member.environmentId === ref.environmentId && member.id === ref.projectId,
    ),
  );
  return candidates.length === 1 ? candidates[0]! : null;
}
