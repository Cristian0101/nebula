import type { DevServerProfile, DiscoveredLocalServer, ProjectScript } from "@t3tools/contracts";

export interface DevServerSuggestion {
  readonly name: string;
  readonly command: string;
  readonly workingDirectory: string;
  readonly preferredPort: number | null;
  readonly previewUrl: string;
  readonly source: "package.json" | "project-script";
  readonly framework: "vite" | "next" | "generic";
}

export function discoveredServerForTerminal<T extends DiscoveredLocalServer>(input: {
  readonly servers: ReadonlyArray<T>;
  readonly threadId: string;
  readonly terminalId: string | null;
}): T | null {
  if (!input.terminalId) return null;
  return (
    input.servers.find(
      (server) =>
        server.terminal?.threadId === input.threadId &&
        server.terminal.terminalId === input.terminalId,
    ) ?? null
  );
}

interface PackageJsonShape {
  readonly packageManager?: unknown;
  readonly scripts?: unknown;
  readonly dependencies?: unknown;
  readonly devDependencies?: unknown;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function packageRunner(packageManager: unknown): "pnpm" | "yarn" | "bun" | "npm" {
  if (typeof packageManager !== "string") return "npm";
  if (packageManager.startsWith("pnpm@")) return "pnpm";
  if (packageManager.startsWith("yarn@")) return "yarn";
  if (packageManager.startsWith("bun@")) return "bun";
  return "npm";
}

function scriptCommand(runner: ReturnType<typeof packageRunner>, script: string): string {
  return runner === "yarn" ? `yarn ${script}` : `${runner} run ${script}`;
}

function titleForScript(script: string): string {
  if (script === "dev") return "Web App";
  if (script === "start") return "Application";
  if (script === "preview") return "Preview";
  return script
    .split(/[-_:]/u)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}

function frameworkForPackage(packageJson: PackageJsonShape): DevServerSuggestion["framework"] {
  const dependencies = {
    ...record(packageJson.dependencies),
    ...record(packageJson.devDependencies),
  };
  if ("vite" in dependencies) return "vite";
  if ("next" in dependencies) return "next";
  return "generic";
}

function defaultPort(framework: DevServerSuggestion["framework"]): number | null {
  if (framework === "vite") return 5173;
  if (framework === "next") return 3000;
  return null;
}

export function discoverDevServerSuggestions(input: {
  readonly packageJsonContents: string | null;
  readonly projectScripts?: ReadonlyArray<ProjectScript>;
}): ReadonlyArray<DevServerSuggestion> {
  const suggestions: DevServerSuggestion[] = [];
  if (input.packageJsonContents) {
    try {
      const packageJson = JSON.parse(input.packageJsonContents) as PackageJsonShape;
      const scripts = record(packageJson.scripts);
      const runner = packageRunner(packageJson.packageManager);
      const framework = frameworkForPackage(packageJson);
      for (const script of ["dev", "start", "preview"]) {
        if (typeof scripts[script] !== "string") continue;
        const port = defaultPort(framework);
        suggestions.push({
          name: titleForScript(script),
          command: scriptCommand(runner, script),
          workingDirectory: ".",
          preferredPort: port,
          previewUrl: port === null ? "" : `http://localhost:${port}`,
          source: "package.json",
          framework,
        });
      }
    } catch {
      // An invalid package.json is not an executable suggestion.
    }
  }

  for (const script of input.projectScripts ?? []) {
    if (!/dev|start|preview|serve/i.test(`${script.name} ${script.command}`)) continue;
    if (suggestions.some((suggestion) => suggestion.command === script.command)) continue;
    suggestions.push({
      name: script.name,
      command: script.command,
      workingDirectory: ".",
      preferredPort: null,
      previewUrl: script.previewUrl ?? "",
      source: "project-script",
      framework: "generic",
    });
  }
  return suggestions;
}

export function commandWithPreferredPort(
  suggestion: Pick<DevServerSuggestion, "command" | "framework">,
  port: number,
): string | null {
  if (/(?:^|\s)(?:--port|-p)(?:\s|=)\d+/u.test(suggestion.command)) return suggestion.command;
  if (suggestion.framework === "next") return `${suggestion.command} -- -p ${port}`;
  if (suggestion.framework === "vite") return `${suggestion.command} -- --port ${port}`;
  return null;
}

export function nextAvailablePreferredPort(
  preferredPort: number | null,
  occupiedPorts: ReadonlySet<number>,
): number | null {
  if (preferredPort === null) return null;
  if (preferredPort < 1 || preferredPort > 65_535) return null;
  let port = preferredPort;
  while (occupiedPorts.has(port) && port < 65_535) port += 1;
  return occupiedPorts.has(port) ? null : port;
}

export function replaceRetargetedProfile(input: {
  readonly profiles: ReadonlyArray<DevServerProfile>;
  readonly originalProfileId: string;
  readonly retargetedProfile: DevServerProfile;
}): ReadonlyArray<DevServerProfile> {
  const matching = input.profiles.find(
    (profile) =>
      profile.id !== input.originalProfileId &&
      profile.command === input.retargetedProfile.command &&
      profile.workingDirectory === input.retargetedProfile.workingDirectory &&
      profile.preferredPort === input.retargetedProfile.preferredPort,
  );
  if (matching) return input.profiles;
  return [...input.profiles, input.retargetedProfile];
}

export function approvedProfileFromSuggestion(input: {
  readonly id: string;
  readonly suggestion: DevServerSuggestion;
  readonly port: number | null;
  readonly approvedAt: string;
}): DevServerProfile {
  const managedCommand =
    input.port === null ? null : commandWithPreferredPort(input.suggestion, input.port);
  const preferredPort = managedCommand === null ? null : input.port;
  return {
    id: input.id,
    name: input.suggestion.name,
    command: managedCommand ?? input.suggestion.command,
    workingDirectory: input.suggestion.workingDirectory,
    preferredPort,
    previewUrl:
      preferredPort === null ? input.suggestion.previewUrl : `http://localhost:${preferredPort}`,
    approvedAt: input.approvedAt,
  };
}

export function retargetApprovedProfile(input: {
  readonly profile: DevServerProfile;
  readonly id: string;
  readonly port: number;
  readonly approvedAt: string;
}): DevServerProfile | null {
  if (input.profile.preferredPort === null) return null;
  const command = input.profile.command.replace(/((?:--port|-p)(?:\s+|=))\d+/u, `$1${input.port}`);
  if (command === input.profile.command && input.port !== input.profile.preferredPort) return null;
  return {
    ...input.profile,
    id: input.id,
    name: `${input.profile.name.replace(/\s+\(\d+\)$/u, "")} (${input.port})`,
    command,
    preferredPort: input.port,
    previewUrl: `http://localhost:${input.port}`,
    approvedAt: input.approvedAt,
  };
}
