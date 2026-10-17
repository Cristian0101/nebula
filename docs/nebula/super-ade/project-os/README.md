# Project OS V2 design package (D4 for E4)

**Status:** D4 design reference. The founder's I1 instruction preserves approved
P1–P10 decisions. Visual/runtime and human accessibility acceptance remain
separate. See [capability reconciliation](../../SUPER_ADE_INTEGRATION.md) for
implemented E4.1/E4.2A/E4.2B/E4.3A and proposed E4.3B/E4.4. Historical baseline
and audit observations below describe the original design package.

**North Star:** One project. Every branch. Every agent. One workspace.

This package turns the Projects interface into a project-centered operating surface: one place to see what is happening in a repository, what needs a human, where to resume, and which checkout every piece of work runs in. It builds on the [Super ADE design foundation](../README.md) and replaces none of it wholesale. Where D4 changes a foundation rule, the change is listed in [What D4 supersedes](#what-d4-supersedes).

## Baseline

| Input                         | Reference                                                                                                                                         |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Design foundation             | PR #36, branch `design/super-ade-foundation`, design reference `a275bc244`. **Open draft, unmerged.** This package is stacked on it               |
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

Open the reference directly in a browser. The [single-screen reviewer](reference/project-os.html?review=1) offers every required width, dark/light, both palettes and text scaling. [Design QA](design-qa.md) and `reference/screens/` contain review receipts and rendered visual artifacts.

The reference loads Geist from Google Fonts when online and falls back to the platform stack.

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

## Current review boundary

PR #42 is the existing design PR, stacked on PR #36. Live status rechecked October 16, 2026 (America/New_York): #36 OPEN at `a275bc24489dc246e9de1686a23797fbb401e016`; #41 OPEN at `131085ff80d9cd1a189c124b6a77d5d523396b08`, human acceptance pending. These checks do not establish merge, release or founder approval. No application runtime or local configuration is edited by D4.

## Deliverable map

| Deliverable                                   | Reference                                                                               |
| --------------------------------------------- | --------------------------------------------------------------------------------------- |
| 1. Design verdict                             | Design §0                                                                               |
| 2. Information architecture                   | Design §2                                                                               |
| 3. Project Home blueprint                     | Design §3                                                                               |
| 4. Branches & Worktrees blueprint             | Design §4                                                                               |
| 5. Worktree safety flow                       | Design §5; handoff §2.3                                                                 |
| 6. Workbench navigation                       | Design §6                                                                               |
| 7. Expanded sidebar navigation                | Design §7                                                                               |
| 8. Agents and Dev Servers                     | Design §8                                                                               |
| 9. Notes placement and backend gate           | Design §9; future-only atlas frame                                                      |
| 10. Responsive designs at seven widths        | Design §10; HTML single-screen reviewer                                                 |
| 11. Dark/light and shipped-theme designs      | Design §11; visual index                                                                |
| 12. Four high-fidelity primary screens        | [Visual index](VISUAL_INDEX.md), 17 screen captures and the four-screen board           |
| 13. Component/reuse map                       | Handoff §1                                                                              |
| 14. Canonical data and composite dependencies | Handoff §2                                                                              |
| 15. Accessibility checklist and actual checks | Design §12; [design QA](design-qa.md)                                                   |
| 16. Founder decisions                         | Design §13, P1–P10; foundation F1–F16 remain separate                                   |
| 17. Bounded E4.1–E4.4 implementation handoff  | Handoff §4, with per-screen actions/permissions/failure states in §3                    |
| 18. Design PR and artifact paths              | [PR #42](https://github.com/Cristian0101/nebula/pull/42); this package and visual index |
