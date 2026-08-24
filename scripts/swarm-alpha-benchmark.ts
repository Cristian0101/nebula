// @effect-diagnostics nodeBuiltinImport:off
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

const repoRoot = NodePath.resolve(NodePath.dirname(NodeURL.fileURLToPath(import.meta.url)), "..");
const fixtureSource = NodePath.join(repoRoot, "apps/server/integration/fixtures/swarm-alpha");
const tempRoot = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "nebula-p17-fixture-"));
const resolvedTempBase = NodeFS.realpathSync(NodeOS.tmpdir());
const resolvedTempRoot = NodeFS.realpathSync(tempRoot);

if (!resolvedTempRoot.startsWith(`${resolvedTempBase}${NodePath.sep}nebula-p17-fixture-`)) {
  throw new Error(`Refusing benchmark outside the isolated temporary root: ${resolvedTempRoot}`);
}

NodeFS.cpSync(fixtureSource, tempRoot, { recursive: true });

const run = (
  command: string,
  args: ReadonlyArray<string>,
  options: { readonly cwd?: string; readonly expectedFailure?: boolean } = {},
) => {
  const result = NodeChildProcess.spawnSync(command, [...args], {
    cwd: options.cwd ?? repoRoot,
    encoding: "utf8",
    stdio: options.expectedFailure ? "pipe" : "inherit",
  });
  const failed = result.status !== 0;
  if (options.expectedFailure ? !failed : failed) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(
      options.expectedFailure
        ? `Expected ${command} ${args.join(" ")} to expose the pre-implementation Integration failure.`
        : `${command} ${args.join(" ")} failed.${detail ? `\n${detail}` : ""}`,
    );
  }
};

run("git", ["init", "--initial-branch=main"], { cwd: tempRoot });
run("git", ["config", "user.name", "Nebula Alpha Benchmark"], { cwd: tempRoot });
run("git", ["config", "user.email", "nebula-alpha@example.invalid"], { cwd: tempRoot });
run("git", ["add", "."], { cwd: tempRoot });
run("git", ["commit", "-m", "test: seed notification preferences benchmark"], {
  cwd: tempRoot,
});

run(process.execPath, ["--test", "tests/baseline.fixture.js"], { cwd: tempRoot });
run(process.execPath, ["--test", "tests/notification-preferences.integration.fixture.js"], {
  cwd: tempRoot,
  expectedFailure: true,
});
run(
  "vp",
  [
    "test",
    "run",
    "packages/shared/src/missionRunner.test.ts",
    "packages/shared/src/recoveryRouting.test.ts",
    "apps/server/src/orchestration/decider.missions.test.ts",
  ],
  { cwd: repoRoot },
);

const scenario = JSON.parse(
  NodeFS.readFileSync(NodePath.join(tempRoot, "swarm-alpha-scenario.json"), "utf8"),
) as {
  readonly providers?: ReadonlyArray<string>;
  readonly tasks?: ReadonlyArray<{ readonly wave?: number }>;
  readonly expectedFinalState?: string;
};
const waves = new Set(scenario.tasks?.map((task) => task.wave));
if (
  scenario.tasks?.length !== 4 ||
  waves.size !== 3 ||
  scenario.providers?.length !== 2 ||
  scenario.expectedFinalState !== "integration_ready"
) {
  throw new Error("The Swarm Alpha fixture no longer matches its four-Task acceptance contract.");
}

console.log(
  JSON.stringify(
    {
      status: "PASS",
      scope: "deterministic-only",
      fixtureRepository: resolvedTempRoot,
      baseline: "PASS",
      preImplementationIntegrationGate: "EXPECTED_FAIL",
      orchestrationPolicyTests: "PASS",
      liveProviderCoverage: false,
    },
    null,
    2,
  ),
);
