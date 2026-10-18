import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import { WorkspaceRemovalUnavailable } from "./WorkspaceRemovalUnavailable";

describe("WorkspaceRemovalUnavailable", () => {
  it("disables cleanup and describes the restriction before activation", () => {
    const html = renderToStaticMarkup(<WorkspaceRemovalUnavailable />);
    expect(html).toMatch(/<button[^>]*disabled=""/);
    const descriptionId = html.match(/aria-describedby="([^"]+)"/)?.[1];
    expect(descriptionId).toBeTruthy();
    expect(html).toContain(`id="${descriptionId}"`);
    expect(html).toContain("Workspace removal is temporarily unavailable");
    expect(html).toContain("Keep the workspace");
  });
});
