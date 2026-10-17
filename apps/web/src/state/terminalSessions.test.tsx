import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { useAttachedTerminalSession, useKnownTerminalSessions } from "./terminalSessions";
const f = vi.hoisted(() => ({
  allowed: false,
  error: false,
  metadata: vi.fn(() => "metadata"),
  attach: vi.fn(() => "attach"),
  queries: [] as unknown[],
}));
vi.mock("./session", () => ({
  useEnvironmentSessionState: () => ({
    hasError: f.error,
    data: {
      authenticated: true,
      scopes: f.allowed ? ["terminal:operate"] : ["orchestration:read"],
    },
  }),
}));
vi.mock("./terminal", () => ({ terminalEnvironment: { metadata: f.metadata, attach: f.attach } }));
vi.mock("./query", () => ({
  useEnvironmentQuery: (atom: unknown) => {
    f.queries.push(atom);
    return {
      data:
        atom === "metadata"
          ? [
              {
                threadId: "thread",
                terminalId: "existing",
                cwd: "/fixture",
                worktreePath: null,
                status: "running",
                hasRunningSubprocess: true,
                pid: 42,
                exitCode: null,
                exitSignal: null,
                label: "fixture",
                updatedAt: "2026-10-17T12:00:00Z",
              },
            ]
          : null,
      error: null,
    };
  },
}));
function Probe({ environmentId }: { environmentId: EnvironmentId | null }) {
  const sessions = useKnownTerminalSessions({ environmentId, threadId: ThreadId.make("thread") });
  const attached = useAttachedTerminalSession({
    environmentId,
    terminal: { threadId: ThreadId.make("thread"), terminalId: "existing" },
  });
  return (
    <p>
      {sessions.length} sessions · {attached.status}
    </p>
  );
}
describe("shared terminal observations preserve caller permission", () => {
  beforeEach(() => {
    f.allowed = false;
    f.error = false;
    f.queries = [];
    f.metadata.mockClear();
    f.attach.mockClear();
  });
  it("does not subscribe or attach from a read-only Project sidebar or saved pane", () => {
    expect(renderToStaticMarkup(<Probe environmentId={EnvironmentId.make("host")} />)).toContain(
      "0 sessions",
    );
    expect(f.metadata).not.toHaveBeenCalled();
    expect(f.attach).not.toHaveBeenCalled();
    expect(f.queries).toEqual([null, null, null]);
  });
  it("preserves known terminals when the existing permission is present", () => {
    f.allowed = true;
    expect(renderToStaticMarkup(<Probe environmentId={EnvironmentId.make("host")} />)).toContain(
      "1 sessions",
    );
    expect(f.metadata).toHaveBeenCalledTimes(2);
    expect(f.attach).toHaveBeenCalledOnce();
  });
  it("does not reuse stale authority after session verification fails", () => {
    f.allowed = true;
    f.error = true;
    renderToStaticMarkup(<Probe environmentId={EnvironmentId.make("host")} />);
    expect(f.metadata).not.toHaveBeenCalled();
    expect(f.attach).not.toHaveBeenCalled();
  });
  it("does not substitute an environment for a null selection", () => {
    f.allowed = true;
    renderToStaticMarkup(<Probe environmentId={null} />);
    expect(f.metadata).not.toHaveBeenCalled();
    expect(f.attach).not.toHaveBeenCalled();
  });
});
