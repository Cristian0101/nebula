# Nebula changelog

## Experimental — Gemini CLI provider prototype

This branch-only prototype is blocked for individual Google account authentication and is not intended for mainline release. It is retained for possible enterprise Code Assist, API-key authentication, or future CLI compatibility.

- Added opt-in Gemini CLI as a first-party provider driver using the inherited ACP runtime, adapter registry, normalized events, settings, model picker, checkpoints, and Task workspace authority.
- Added provider-owned Google authentication through the official `gemini --acp` process without a Nebula credential store or background login launch.
- Added honest model behavior: Auto delegates routing to Gemini CLI, manual model identifiers pass through ACP, and no interactive-menu scraping is used.
- Added new/load session identity, prompt streaming, cancellation, approval mapping, in-session model selection, text generation, and provider maintenance metadata. Gemini starts in the canonical Task worktree; ACP filesystem proxying remains disabled in the shared runtime.
- Multiple sessions are supported through one Gemini provider instance; multiple configured Gemini instances are intentionally not advertised yet.

## Unreleased — Task ownership engine

- Added durable repository-relative write, read-only, and deny rules to new writable Builder Tasks.
- Added fail-closed ownership evaluation with deny precedence, unclassified and read-only violations, untracked-file coverage, and both-side rename validation.
- Added automatic post-checkpoint validation, manual validation, scope editing with revalidation, persisted evidence, and startup reconciliation.
- Added a fresh-validation completion gate: violations or Git inspection errors leave the Task active while the provider Thread remains usable for remediation.
- Added a compact ownership editor, explicit Entire Repository choice, validation state, and violation evidence to the existing project Task surface.
- Preserved pre-ownership Tasks as Legacy / Unconfigured without retroactive violations.
- Ownership is an enforced progression boundary, not an OS, process, credential, or network sandbox. Shared locks, ownership requests, review, integration, Mission, and Swarm remain deferred.

## Unreleased

### Task workspace isolation

- New writable Builder Tasks prepare one durable Git worktree before Thread creation.
- Task workspace records persist source repository, exact base commit, stable branch, inherited path, lifecycle state, timestamps, and safe failure details.
- Startup reconciliation adopts completed worktrees, reports missing workspaces, and resumes interrupted explicit cleanup.
- Terminal Task cleanup refuses dirty worktrees, never forces removal, and preserves branches.
- Pre-isolation Tasks and existing Threads remain compatible with their original shared workspace.
