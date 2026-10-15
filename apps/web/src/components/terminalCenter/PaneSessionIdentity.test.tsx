import { describe, expect, it } from "vite-plus/test";
import { renderToStaticMarkup } from "react-dom/server";
import { PaneSessionIdentity, paneSessionIdentity } from "./PaneSessionIdentity";

describe("pane session identity", () => {
  it("identifies canonical chat views only when a thread is bound", () => {
    expect(paneSessionIdentity("chat", "thread-1")).toBe("Canonical chat conversation");
    expect(paneSessionIdentity("chat", null)).toContain("no provider session yet");
  });
  it("does not claim a linked CLI resumes the chat, even with the same thread ID", () => {
    const markup = renderToStaticMarkup(
      <PaneSessionIdentity surface="terminal" threadId="thread-1" />,
    );
    expect(markup).toContain("Separate CLI session, not linked to this chat");
    expect(markup).not.toContain("resumed");
  });
});
