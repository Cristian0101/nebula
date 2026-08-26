import { describe, expect, it } from "vite-plus/test";

import {
  approvedProfileFromSuggestion,
  discoverDevServerSuggestions,
  nextAvailablePreferredPort,
  retargetApprovedProfile,
} from "./devServerDiscovery";

describe("Dev Server discovery", () => {
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
});
