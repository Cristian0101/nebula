import type { TaskHandoffTestExecution } from "@t3tools/contracts";

export interface GeneratedTaskHandoffNarrative {
  readonly summary: string;
  readonly testsRun: ReadonlyArray<TaskHandoffTestExecution>;
  readonly assumptions: ReadonlyArray<string>;
  readonly interfaceChanges: ReadonlyArray<string>;
  readonly migrations: ReadonlyArray<string>;
  readonly knownRisks: ReadonlyArray<string>;
  readonly followUps: ReadonlyArray<string>;
}

function normalizedHeading(value: string): string {
  return value.toLowerCase().replaceAll(/[^a-z]/g, "");
}

export function parseGeneratedTaskHandoff(
  title: string,
  body: string,
): GeneratedTaskHandoffNarrative {
  const sections = new Map<string, string[]>();
  let active = "summary";
  sections.set(active, []);
  for (const rawLine of body.split("\n")) {
    const heading = rawLine.match(/^#{1,6}\s+(.+?)\s*$/);
    if (heading?.[1]) {
      active = normalizedHeading(heading[1]);
      if (!sections.has(active)) sections.set(active, []);
      continue;
    }
    const line = rawLine.replace(/^\s*[-*]\s+/, "").trim();
    if (line) sections.get(active)?.push(line);
  }
  const values = (...keys: string[]) => keys.flatMap((key) => sections.get(key) ?? []);
  const summaryLines = values("summary");
  return {
    summary: [title.trim(), ...summaryLines].filter(Boolean).join("\n\n"),
    testsRun: values("tests", "testsrun", "testing").map((result) => ({
      command: "Provider-reported validation",
      result,
      evidence: "reported",
    })),
    assumptions: values("assumptions"),
    interfaceChanges: values("interfacechanges"),
    migrations: values("migrations"),
    knownRisks: values("knownrisks", "risks"),
    followUps: values("followups", "followup"),
  };
}
