import { ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  approvedProfileFromSuggestion,
  discoveredServerForTerminal,
  discoverDevServerSuggestions,
  nextAvailablePreferredPort,
  replaceRetargetedProfile,
  retargetApprovedProfile,
} from "./devServerDiscovery";

describe("Dev Server discovery", () => {
  it("resolves the reachable server owned by the managed terminal instead of guessing a port", () => {
    const server = {
      host: "localhost",
      port: 3001,
      url: "http://localhost:3001",
      processName: "next-server",
      pid: 42,
      terminal: { threadId: ThreadId.make("workspace-host"), terminalId: "dev-surge" },
    } as const;
    expect(
      discoveredServerForTerminal({
        servers: [{ ...server, port: 3000, url: "http://localhost:3000", terminal: null }, server],
        threadId: "workspace-host",
        terminalId: "dev-surge",
      }),
    ).toBe(server);
  });

  it("suggests the package dev script without executing it", () => {
    expect(
      discoverDevServerSuggestions({
        packageJsonContents: JSON.stringify({
          packageManager: "pnpm@11.10.0",
          scripts: { dev: "vite", test: "vitest" },
          devDependencies: { vite: "7.0.0" },
        }),
      }),
    ).toEqual([
      {
        name: "Web App",
        command: "pnpm run dev",
        workingDirectory: ".",
        preferredPort: 5173,
        previewUrl: "http://localhost:5173",
        source: "package.json",
        framework: "vite",
      },
    ]);
  });

  it("selects the next managed port and persists the approved command", () => {
    const suggestion = discoverDevServerSuggestions({
      packageJsonContents: JSON.stringify({
        scripts: { dev: "next dev" },
        dependencies: { next: "16" },
      }),
    })[0]!;
    const port = nextAvailablePreferredPort(3000, new Set([3000, 3001]));
    expect(port).toBe(3002);
    expect(
      approvedProfileFromSuggestion({
        id: "profile-1",
        suggestion,
        port,
        approvedAt: "2026-08-26T12:00:00.000Z",
      }),
    ).toMatchObject({
      command: "npm run dev -- -p 3002",
      preferredPort: 3002,
      previewUrl: "http://localhost:3002",
    });
  });

  it("does not invent a port or preview URL for a generic package command", () => {
    const suggestion = discoverDevServerSuggestions({
      packageJsonContents: JSON.stringify({ scripts: { dev: "custom-server" } }),
    })[0]!;
    expect(suggestion).toMatchObject({ preferredPort: null, previewUrl: "", framework: "generic" });
    expect(
      approvedProfileFromSuggestion({
        id: "generic",
        suggestion,
        port: 3000,
        approvedAt: "2026-08-26T00:00:00.000Z",
      }),
    ).toMatchObject({ command: "npm run dev", preferredPort: null, previewUrl: "" });
  });

  it("preserves a configured Project Script preview URL", () => {
    expect(
      discoverDevServerSuggestions({
        packageJsonContents: null,
        projectScripts: [
          {
            id: "web",
            name: "Start web",
            command: "npm run serve",
            icon: "play",
            runOnWorktreeCreate: false,
            previewUrl: "http://localhost:4321/app",
          },
        ],
      })[0],
    ).toMatchObject({ preferredPort: null, previewUrl: "http://localhost:4321/app" });
  });

  it("returns no port when the managed range is exhausted", () => {
    expect(nextAvailablePreferredPort(65_535, new Set([65_535]))).toBeNull();
  });

  it("retargets an approved adjustable profile for a parallel worktree", () => {
    const profile = approvedProfileFromSuggestion({
      id: "profile-1",
      suggestion: {
        name: "Web App",
        command: "npm run dev",
        workingDirectory: ".",
        preferredPort: 3000,
        previewUrl: "http://localhost:3000",
        source: "package.json",
        framework: "next",
      },
      port: 3000,
      approvedAt: "2026-08-26T00:00:00.000Z",
    });
    expect(
      retargetApprovedProfile({
        profile,
        id: "profile-2",
        port: 3001,
        approvedAt: "2026-08-26T00:01:00.000Z",
      }),
    ).toMatchObject({
      id: "profile-2",
      command: "npm run dev -- -p 3001",
      preferredPort: 3001,
      previewUrl: "http://localhost:3001",
    });
  });

  it("does not invent port control for an opaque approved command", () => {
    expect(
      retargetApprovedProfile({
        profile: {
          id: "profile-1",
          name: "Custom server",
          command: "./serve",
          workingDirectory: ".",
          preferredPort: 3000,
          previewUrl: "http://localhost:3000",
          approvedAt: "2026-08-26T00:00:00.000Z",
        },
        id: "profile-2",
        port: 3001,
        approvedAt: "2026-08-26T00:01:00.000Z",
      }),
    ).toBeNull();
  });

  it("keeps the approved profile and reuses an equivalent retargeted profile", () => {
    const original = {
      id: "profile-1",
      name: "Web App",
      command: "npm run dev -- -p 3000",
      workingDirectory: ".",
      preferredPort: 3000,
      previewUrl: "http://localhost:3000",
      approvedAt: "2026-08-26T00:00:00.000Z",
    };
    const existing = {
      ...original,
      id: "profile-2",
      name: "Web App (3001)",
      command: "npm run dev -- -p 3001",
      preferredPort: 3001,
      previewUrl: "http://localhost:3001",
    };
    expect(
      replaceRetargetedProfile({
        profiles: [original, existing],
        originalProfileId: original.id,
        retargetedProfile: { ...existing, id: original.id },
      }),
    ).toEqual([original, existing]);
  });
});
