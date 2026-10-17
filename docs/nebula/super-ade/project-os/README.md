# Project OS V2 design package (D4 for E4)

**Status:** Proposed design (D4), pending founder approval. These documents do not change runtime behavior.

**North Star:** One project. Every branch. Every agent. One workspace.

This package turns the Projects interface into a project-centered operating surface: one place to see what is happening in a repository, what needs a human, where to resume, and which checkout every piece of work runs in. It builds on the [Super ADE design foundation](../README.md) and replaces none of it wholesale. Where D4 changes a foundation rule, the change is listed in [What D4 supersedes](#what-d4-supersedes).

## Baseline

| Input                         | Reference                                                                                                                                         |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Design foundation             | PR #36, branch `design/super-ade-foundation`, design reference `a275bc244`. **Still an open draft.** This package is stacked on it                |
| Code inspected                | `main` at `784473fb5` (E1 PR #37 and E2 PR #40 merged)                                                                                            |
| Provider Connections (E3)     | PR #41 open, head `131085ff8`, not merged. Final human acceptance is separate. D4 links to the E3 sheet only through its search parameters        |
| Engineering feasibility audit | Referenced by the foundation as "audit PR n / Phase n". It is not committed; D4 names its own required queries instead of depending on audit text |

Code paths in this package resolve at `784473fb5` unless marked **E3** (resolve at `131085ff8`). The design branch is based on `4981af2c5`, so relative links into `apps/` or `packages/` are not used.

## Reading order

| #   | Document                                      | Read it for                                                                                                                                                                                                      |
| --- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | [Project OS design](PROJECT_OS_DESIGN.md)     | Verdict, repository ground truth, information architecture, the four screens, guarded switching, workspaces, sidebar, agents and services, Notes boundary, responsive, themes, accessibility, founder decisions  |
| 2   | [Engineering handoff](PROJECT_OS_HANDOFF.md)  | Reuse map, canonical data dependencies, required composite queries, per-screen handoff, bounded E4.1–E4.4 slices with acceptance                                                                                 |
| 3   | [Visual reference](reference/project-os.html) | Interactive, self-contained high-fidelity reference: every screen, live interaction states, guarded-switch walkthrough, 390–2560px frames, dark and light, Nebula Ion and the shipped theme. Synthetic data only |

Open the reference directly in a browser. It loads Geist from Google Fonts when online and falls back to the platform stack.

## What D4 supersedes

| Foundation rule                                                                         | D4 change                                                                                                                                                        | Why                                                                                                                           |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Contract §4.4 and Components §5.1 row 2: Project Home has an in-page tab row            | No in-page tab row at ≥768px. The sidebar's active-project list is the only project navigation. Below 768px a compact destination bar replaces the sidebar sheet | The founder asked to avoid redundant tabs. Sidebar and tabs pointing at the same six destinations were two navigation systems |
| Contract §4.4: Files is a project tab                                                   | Files is an action (`filePicker.toggle`, Workbench file pane), not a destination, in E4                                                                          | No project-level file route exists; a route would duplicate `FileBrowserPanel`                                                |
| Contract §4.2 item 5: active project sub-list "Home, Workbench, Tasks, Notes, Settings" | "Overview, Workbench, Tasks, Branches, Notes (gated), Settings", plus a checkout line                                                                            | Branches is an E4 destination; the checkout must be visible because project keys can span environments                        |
| Screens §1.1: composer with intent control on Project Home                              | A launch bar that hands its text to the existing draft composer. The intent control stays in D7                                                                  | `ChatComposer` is route-bound; a second composer runtime is out of scope                                                      |
| Screens §3 and Components §9: Branches columns "Last commit", "PR" for every ref        | Per-ref facts appear only where a source exists. Facts that exist only for checked-out refs show for worktrees and are omitted for plain refs                    | Truthful states                                                                                                               |
| States §4: switch pre-check list                                                        | Expanded blocker taxonomy, explicit stale assessment, detached HEAD, environment offline, and unpublished commits as an informational notice                     | E4 needs an implementable server assessment                                                                                   |
| Components §9.2: "Remove…" in the detail sheet                                          | E4 shows removal **eligibility** only. Removal stays in existing Task and Integration cleanup flows until a separate removal workflow is approved                | Removal is high consequence and `vcs.removeWorktree` has no server guard today                                                |

Everything else in the foundation stands, including tokens, the seven-fact execution context, session identity rules, and the Notes model.

## Ground rules for implementers

- Show only facts that have a source. A missing composite query hides its column or card; it never renders placeholder data.
- Navigation never mutates. Selecting a branch, project, checkout or workspace never changes a checkout, stops a process or retargets a session.
- Hiding a view never stops work. Stopping is a separate, labelled action, offered only where Nebula owns the process.
- Project identity is environment-scoped. Every project screen states which checkout on which environment it is showing.
- Do not change the default theme. `nebula-ion` remains a D1 decision (founder decision F1).
