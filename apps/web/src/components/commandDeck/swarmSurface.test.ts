// @effect-diagnostics nodeBuiltinImport:off - Static shell assertions prevent product-surface regressions.
import * as NodeFS from "node:fs";

import { describe, expect, it } from "vite-plus/test";

const source = (path: string) => NodeFS.readFileSync(new URL(path, import.meta.url), "utf8");

describe("Swarm product surface", () => {
  it("keeps raw JSON behind the Advanced plan editor instead of the default summary", () => {
    const workspace = source("./SwarmWorkspace.tsx");
    const advanced = workspace.indexOf("Advanced plan editor");
    const rawJson = workspace.indexOf('aria-label="Advanced raw Team Plan JSON"');
    expect(advanced).toBeGreaterThan(0);
    expect(rawJson).toBeGreaterThan(advanced);
    expect(workspace.slice(advanced, rawJson)).toContain("CollapsiblePanel");
  });

  it("exposes Swarm and Terminal Center as first-class sidebar destinations", () => {
    const sidebar = source("../Sidebar.tsx");
    expect(sidebar).toContain(">Swarm</span>");
    expect(sidebar).toContain(">Terminal Center</span>");
    expect(sidebar).toContain('mode: "swarm"');
  });

  it("uses the Nebula mark and no user-facing T3 emblem in sidebar chrome", () => {
    const chrome = source("../sidebar/SidebarChrome.tsx");
    expect(chrome).toContain("nebula-mark.png");
    expect(chrome).toMatch(/>\s*Nebula\s*</);
    expect(chrome).not.toMatch(/T3(?: Code)?/);
  });

  it("uses state-driven Terminal styling with a reduced-motion fallback", () => {
    const terminal = source("../terminalCenter/ProjectTerminalWorkspace.tsx");
    expect(terminal).toContain('aria-label={working ? "Working" : selected ? "Selected" : "Idle"}');
    expect(terminal).toContain("motion-safe:animate-pulse");
    expect(terminal).not.toContain("setInterval");
  });

  it("keeps War Room review and provider failures textual instead of showing a false Ready state", () => {
    const workspace = source("./SwarmWorkspace.tsx");
    expect(workspace).toContain('currentReview?.verdict === "request_changes"');
    expect(workspace).toContain("deriveTerminalAgentPresentation");
    expect(workspace).toContain('status === "Provider unavailable"');
  });

  it("renders cancellation as a preserved safe state rather than a planner failure", () => {
    const workspace = source("./SwarmWorkspace.tsx");
    expect(workspace).toContain('selectedPlan.status === "cancelled"');
    expect(workspace).toContain("The planning attempt was cancelled safely");
    expect(workspace).toContain("A late provider response cannot create execution state");
    expect(workspace).toContain('selectedPlan.status === "failed"');
    expect(workspace).not.toContain('["failed", "cancelled"].includes(selectedPlan.status)');
  });
});
