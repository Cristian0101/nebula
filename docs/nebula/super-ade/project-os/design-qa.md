# Project OS D4 design-reference QA

**Final result: passed** for the bounded design reference. Founder acceptance, real VoiceOver and application implementation acceptance remain separate. No application runtime was changed or launched.

## Source and comparison

- Visual truth: the founder-supplied “Nebula Super ADE — Official Design North Star” image and the foundation at `a275bc244`. Preserve premium charcoal, violet/blue accents, fine borders, restrained status tones and one project context. The poster is an art-direction source, not an exact Project Home viewport to clone. Active-project operational density and the empty-only hero are intentional D4 requirements.
- Existing interactive source: PR #42 at `6fd8abdcc`, `reference/project-os.html`. Its Overview and the revised atlas were captured in the in-app browser with the same dark palette, active synthetic project and 1440 × 1120 CSS frame. Both rendered at 1270 × approximately 988 pixels on an 1882 × 1706 CSS browser canvas. Screenshot crops normalize device density from measured viewport/image dimensions. Full and focused comparisons were viewed together.
- Private comparison outputs: `/private/tmp/nebula-d4-design-review/matched-home-comparison.png`, `focused-home-comparison.png` and `compact-workbench-comparison.png`. Scratch evidence stays outside the worktree. Final reviewable visual artifacts are indexed in [VISUAL_INDEX.md](VISUAL_INDEX.md).
- Current target: [editable HTML reviewer](reference/project-os.html?review=1). All data and mutations are simulated; no network command, real Git checkout, provider execution, terminal or Dev Server is created by a prototype control.

## Comparison history and fixes

| Finding                                                                                          | Fix                                                                                                                                           | Post-fix evidence                                                                                                      |
| ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| P1: invalid explicit checkout could fall back to a different host                                | Handoff now requires unavailable state, disabled mutations and explicit checkout selection; ambiguous legacy layout origins remain unassigned | Design §2.2 and handoff E4.1 acceptance. This is a design correction; backend enforcement awaits implementation        |
| P1: optional assessment receipt could leave an unguarded draft/create-and-switch path            | Every public checkout mutation needs server policy and a bound, fresh receipt; unknown evidence fails closed                                  | Design §5 and handoff E4.4. Proposed contract only; no safety claim about current runtime                              |
| P2: slide-in sheet produced transient horizontal overflow                                        | Use opacity reveal and scrollable sheet body; constrain the guard dialog’s height and scroll its evidence                                     | Final 112-case geometry matrix has no horizontal overflow                                                              |
| P2: 200% text clipped/wrapped incorrectly in attention, filters and Workbench header             | Scale actual specimen text; compact header, wrapping actions and full-width pane navigation                                                   | All 28 screen/width cases pass at 200% text in shipped light palette                                                   |
| P1: 390px Workbench compressed four panes and clipped identity/content despite no outer overflow | One full-width pane, labelled Thread / Provider CLI / Dev server / Preview switcher; context retained; arrow-key selection                    | Final narrow Workbench capture; pointer and keyboard switch between visible panes; before/after comparison viewed      |
| P1: modal keyboard behavior did not match the written safety contract                            | Trap focus, make modal background inert, restore the actual launcher, suppress Enter on switch confirmation; grid has arrow navigation        | Clear dialog begins on Cancel; Shift+Tab wraps to Switch; Enter leaves dialog open; Escape returns to Switch checkout… |

## Actual checks

- **112 combinations:** four primary screens × 390/768/980/1280/1440/1920/2560 CSS px × dark/light × Ion/shipped palette. Verified the requested frame identity, width, palette and mode; inspected page and main/page/table/dialog/pane-container scroll geometry. No horizontal overflow in the final matrix. These are real browser-rendered container-query specimens, not seven physical devices or application clients.
- **28 text-scaling cases:** four screens at all seven widths, 200% actual specimen text, shipped light palette. No measured page or main-region horizontal overflow. Visual inspection additionally checked the narrow Overview and Workbench. This is not a claim of exhaustive screen-reader or OS magnifier coverage.
- **17 final captures plus a four-screen board:** core desktop screens in dark/light, four narrow screens, shipped dark/light Overview, ultrawide Workbench, expanded sidebar and 200% text Overview.
- **Interaction checks:** guard blocks busy checkout; clear confirmation focus/Tab/Enter/Escape; changed-while-confirming returns to blockers with no simulated switch; hiding Preview retains the server control; Stop opens its separate confirmation; compact pane switch works by pointer and arrow keys. Atlas also exposes loading, empty, partial failure, offline, target-already-open and removal-eligibility specimens.
- **Reduced motion:** reference implements `prefers-reduced-motion` and explicit reduced-motion controls. Single-screen review captures use reduced motion for deterministic frames. No decorative continuous animation is required.
- **Contrast:** 40 measured role pairs across both palettes and dark/light: eight text pairs plus two focus pairs per variant. All exceed their 4.5:1 text / 3:1 focus targets (minimum measured ratio 4.689). This checks the named opaque token pairs, not every rendered/composited pixel.
- **Browser errors:** final in-app-browser console error check returned none.
- **Repository grounding:** 37 concrete source paths named by the package resolve at E3 head `131085ff80d9cd1a189c124b6a77d5d523396b08`. Live `main` remains `784473fb5cb87c98945d1290b9b484e1c939f83c`. PR #36 is an open draft at `a275bc244`; #41 is open/unmerged at `131085ff8`, with human acceptance pending. Proposed components/RPCs remain labelled proposed.

## Fidelity review

- **Typography:** Geist/Geist Mono and platform fallback; normal-scale hierarchy preserved in matched Overview comparison. Text scaling changes typography rather than enlarging a raster.
- **Spacing/layout:** existing shell, active-project disclosure, capped Overview and inventory widths; wide Workbench uses the existing pane vocabulary. Compact Workbench avoids compressed panes. No giant artwork in an active project.
- **Colors/tokens:** Ion is a proposed presentation option; shipped `nebula` dark/light remain demonstrated and the runtime default is unchanged. Warning, error, working and neutral idle have distinct text as well as tone.
- **Assets:** project monograms and labelled provider initials are reference placeholders inherited from D4; no new Nebula mark or provider branding is represented as approved. The source poster’s cube/hero is not traced. Production reuses existing provider assets and the foundation asset gate.
- **Copy/content:** offline does not claim work has stopped, idle session is not “working”, created refs do not silently switch, hidden Preview does not stop its server, and Notes controls appear only in an explicitly future frame.

## Remaining acceptance and bounded handoff

- Founder decisions P1–P10 and foundation F1–F16 are recorded, not silently approved. Safety/permission boundaries cannot be waived by a presentation decision.
- Actual human macOS VoiceOver, native desktop, custom-theme and shipped application tests await the corresponding engineering slice. Browser DOM/keyboard evidence is not VoiceOver acceptance.
- Native Notes persistence, Ion default rollout, composite inventory/assessments and guarded Git execution are unimplemented dependencies. No auth, SQLite, Git execution or Task orchestration changed here. No app tests/builds, provider sign-in, paid inference, deployment or merge were performed.
- Codex implementation sequence remains [E4.1–E4.4](PROJECT_OS_HANDOFF.md#4-bounded-slices). Run proportional behavior, contract and client checks when those slices are implemented.

**Final result: passed** (design-reference scope only).
