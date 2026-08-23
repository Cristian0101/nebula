# Nebula swarm model

## Planning status

Architect Plan Proposal, AI-drafted Tasks/DAG/ownership/resource claims, and human plan approval are implemented. Automatic plan execution, scheduling, wave start, provider routing, provider-generated ownership requests, and Swarm Mode remain not implemented.

This document constrains future Swarm Mode. It does not describe a currently implemented feature.

## Primary principle

> Spawn the minimum number of agents required to safely exploit meaningful parallelism.

A swarm is not “spawn five agents and give all of them the same prompt.” A swarm is:

```text
decompose bounded work
↓
assign ownership
↓
execute independent tasks
↓
collect structured results
↓
independent review
↓
controlled integration
```

Concurrency is justified by independent work, not by a desired agent count.

## Do not swarm everything

Prefer one agent for a localized bug, a few tightly related files, highly sequential work, one migration chain, heavy shared-file overlap, or any task where coordination cost exceeds the benefit.

Before parallelizing, identify the dependency boundary, owned paths, shared resources, expected result, validation, and integration order. If these cannot be stated clearly, decomposition is not ready.

## Deterministic runtime versus agentic models

The Nebula runtime should eventually own deterministic task states, dependencies, locks, permissions, workspaces, process/session references, events, quality commands, and Git integration.

Models may perform repository interpretation, planning, coding, research, review reasoning, and remediation.

Never let an LLM become the authoritative source of deterministic runtime state. A model can propose a task, ownership rule, review finding, or next action; the runtime validates and records the accepted result.

## No hidden agent boardroom

Do not use free-form invisible manager-agent conversations as the coordination backbone. Structured state and explicit handoffs remain authoritative. Human-visible messages may explain decisions, but they cannot replace persisted task state, ownership, evidence, or approval.

## Roles and independence

Roles are permission sets. A Builder should not silently approve its own integration. A Reviewer should receive the declared task, diff, tests, assumptions, and risks rather than relying on private conversational context. An Integrator controls promotion, not implementation ownership.

Cross-provider assignment is allowed. Reassignment must preserve Task and Workspace identity and explicitly update the provider session binding.

## Structured handoff

A prepared Task review provides:

- summary;
- changed files;
- tests and results;
- assumptions;
- interface changes;
- migrations;
- known risks;
- follow-ups; and
- immutable base, snapshot, and current-head evidence.

The handoff is concise evidence for review and integration, not a duplicate project-management report. Git facts are captured automatically and cannot be edited. Provider-generated narrative is explicitly separate, remains a draft until human review, and has a manual fallback. Quality gates, user-requested independent review, human-created deterministic Integration Batches, and human-authored Mission DAGs are implemented on this boundary. Shared-resource locks, automatic Mission planning, scheduling, automatic routing/remediation, automatic integration queues, Architect, and Swarm automation are not implemented.

Missions and the Integration Engine do not imply Swarm automation. Users author dependency edges, activate the Mission, choose which ready Tasks or wave to start, select eligible Task Results and their Integration order, acknowledge overlap, resolve conflicts, and decide what to do with a Ready branch. No agent invents Tasks or dependencies, starts the next wave, acquires locks, merges main, pushes, or opens a PR.

Shared-resource coordination is implemented as a deterministic safety primitive before Swarm Mode.
It does not schedule Tasks, retry blocked Tasks, advance waves, route providers, or authorize an
Architect. Every resource-blocked Task still requires a human start after its blocker clears.
