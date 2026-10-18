# Super ADE capability reconciliation

Integration I1 consolidates E3 Provider Connections and Project OS on a review
candidate. Implementation does not establish release, hosted CI, human
accessibility acceptance, or authority to merge into `main`.

| Slice       | Candidate behavior                                                            | Remaining boundary                                                             |
| ----------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| E1          | Provider readiness and execution context                                      | Real provider/account evidence is separate                                     |
| E2          | Official provider-owned authentication lifecycle                              | Account management requires `access:write`; no automatic API billing fallback  |
| E3          | Provider Connections sheet, sidebar, contextual toolbar and Settings recovery | Human VoiceOver, founder/design and copy acceptance remain open                |
| E4.S        | Server refusal of unsafe existing-checkout mutations                          | E4.4 coordination is required before restoring them                            |
| E4.1        | Read-only Project inventory and selected workspace context                    | Inventory never authorizes mutation                                            |
| E4.2A       | Physical Project/host navigation and Workbench continuity                     | Invalid explicit checkout never substitutes another checkout                   |
| E4.2B       | Project Home attention, Resume, activity and draft handoffs                   | Draft creation is not provider execution                                       |
| E4.3A       | Read-only Branches, Worktrees and detail/deep links                           | Freshness and uncertain ownership remain visible                               |
| E4.3B       | Proposed branch/worktree creation UI                                          | Not implemented by I1; existing canonical safe creation paths remain available |
| E4.4        | Proposed coordinated switching and cleanup                                    | Not implemented by I1                                                          |
| Notes       | Deferred                                                                      | No persistence or agent-context feature added                                  |
| Ion default | Deferred                                                                      | No palette migration or default-theme change added                             |

## Combined shell and identity

Provider Connections opens over the current Project route and retains its
`checkout` selector. Sidebar, palette and Project toolbar resolve the selected
physical Project's environment rather than borrowing the active connection.
Unavailable or ambiguous Project selection provides no default management host.
An explicit Provider Connections host remains explicit, including offline state.

Provider Settings accepts E3's `environment` and Project Home's `environmentId`
links; `environmentId` takes precedence when both are present. The instance
selector remains available. A requested host absent from the catalog is not
replaced by the primary host. Navigation and recovery links do not start an
authentication ceremony or a paid turn.

## Temporary product restrictions

[Checkout safety](CHECKOUT_SAFETY.md) is the canonical refusal policy. Pull,
existing-checkout switching, create-and-switch, automatic local PR checkout,
feature-branch stacked actions, and ordinary/forced existing-worktree removal
remain suspended. Task and Integration cleanup cannot delete existing worktrees;
missing-workspace reconciliation remains possible. Thread deletion retains the
worktree. Existing PR-worktree open does not reset/refresh its HEAD, upstream or
setup. These restrictions apply even to clean, idle checkouts.

Inspection, status/diffs, non-switching branch creation, canonical new-worktree
creation, and existing Thread resume in its original context remain supported.
Thread workspace retargeting, provider cwd replacement, and terminal process or
history replacement through navigation remain refused. Founder acceptance of
these temporary restrictions is required before recommending a production merge.

## Design authority

The D0.2 reference and D4 documents describe a broader product than this candidate.
Their original audit dates and proposed source maps remain historical evidence.
The founder's I1 instruction preserves approved D4 P1–P10 decisions; it does not
approve foundation F1–F16 or turn future controls into implemented behavior.
P7's future switching confirmation and P6's eligibility workflow remain subject
to E4.4; I1 introduces neither. Design screenshots and automated accessibility
checks cannot establish human VoiceOver acceptance.

- [Provider Connections](../user/provider-connections.md)
- [Project inventory](PROJECT_INVENTORY.md)
- [Project navigation and Workbench identity](PROJECT_NAVIGATION.md)
- [Project Home](../user/project-home.md)
- [Branches and Worktrees](../user/branches-worktrees.md)
- [Foundation design](super-ade/SUPER_ADE_DESIGN_CONTRACT.md)
- [Project OS design](super-ade/project-os/PROJECT_OS_DESIGN.md)
- [Project OS handoff](super-ade/project-os/PROJECT_OS_HANDOFF.md)
