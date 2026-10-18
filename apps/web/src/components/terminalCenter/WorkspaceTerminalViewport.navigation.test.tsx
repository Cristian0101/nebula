import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { EnvironmentId } from "@t3tools/contracts";
import type { KnownTerminalSession } from "@t3tools/client-runtime/state/terminal";
import { WorkspaceTerminalViewport } from "./WorkspaceTerminalViewport";

const fixture = vi.hoisted(() => ({ sessions: [] as unknown[], open: vi.fn() }));
vi.mock("../../state/terminalSessions", () => ({
  useKnownTerminalSessions: () => fixture.sessions,
}));
vi.mock("../../state/use-atom-command", () => ({ useAtomCommand: () => fixture.open }));
vi.mock("../../state/terminal", () => ({ terminalEnvironment: { open: "open" } }));
vi.mock("../../state/server", () => ({ primaryServerKeybindingsAtom: "keys" }));
vi.mock("@effect/atom-react", () => ({ useAtomValue: () => ({}) }));
vi.mock("../ThreadTerminalDrawer", () => ({
  TerminalViewport: (props: { attachOnly: boolean; terminalId: string }) => (
    <div data-attach-only={props.attachOnly} data-terminal-id={props.terminalId}>
      Attached existing terminal
    </div>
  ),
}));

const props = {
  environmentId: EnvironmentId.make("remote"),
  hostThreadId: "canonical-host",
  terminalId: "canonical-terminal",
  cwd: "/synthetic/repo",
  title: "Shell",
  autoFocus: false,
  sizeEpoch: 0,
};
function render() {
  return renderToStaticMarkup(<WorkspaceTerminalViewport {...props} />);
}
describe("Workbench restoration is not process launch", () => {
  beforeEach(() => {
    fixture.sessions = [];
    fixture.open.mockClear();
  });
  it("shows explicit recovery for a missing terminal and launches nothing", () => {
    expect(render()).toContain("Start shell");
    expect(render()).not.toContain("Attached existing terminal");
    expect(fixture.open).not.toHaveBeenCalled();
  });
  it("attaches to the canonical existing terminal without a launch location", () => {
    fixture.sessions = [
      {
        target: { terminalId: props.terminalId },
        state: {
          status: "running",
          summary: { cwd: props.cwd, worktreePath: null },
          hasRunningSubprocess: true,
        },
      },
    ] as unknown as KnownTerminalSession[];
    expect(render()).toContain('data-attach-only="true"');
    expect(render()).toContain('data-terminal-id="canonical-terminal"');
    expect(fixture.open).not.toHaveBeenCalled();
  });
  it("refuses a terminal context mismatch instead of replacing the process", () => {
    fixture.sessions = [
      {
        target: { terminalId: props.terminalId },
        state: { status: "running", summary: { cwd: "/another-project", worktreePath: null } },
      },
    ];
    const html = render();
    expect(html).toContain("Terminal context differs");
    expect(html).not.toContain("Attached existing terminal");
    expect(fixture.open).not.toHaveBeenCalled();
  });
});
