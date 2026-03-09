# skuare Roadmap

> [中文版 / Chinese Version](./roadmap_zh.md)

> Document Type: ROADMAP
> Status: completed
> Updated: 2026-03-10
> Scope: project-wide

## Current Positioning

`skuare` already has the core loop of a local-first Skill Registry:

- `skuare-cli` covers local Skill editing, dependency file generation, remote query, remote publish, update, delete, install, and on-demand dependency install.
- `skuare-svc` provides a filesystem-backed remote registry with versioned reads/writes, validation, reindex, and signature-based authorization.
- The project already forms a complete flow of "local editing -> remote publish -> local install -> dependency management".

At this stage, the more accurate product positioning is not "a set of commands", but an MVP of "Skill package management and distribution infrastructure".

## Current Gaps

The next high-value work is not adding more isolated commands, but strengthening these platform foundations:

- Version governance still relies partly on CLI-side compensation logic instead of fully unified server-side rules.
- `author` is already exposed in resource display, but is not yet a stable namespace and permission boundary.
- The dependency model is usable, but the server cannot yet natively understand, validate, and index the full dependency graph.
- Discovery still depends mainly on simple queries, regex, and client-side selectors, which will not scale well.
- The current storage model is optimized for local/lightweight collaboration, not platform-scale deployment.

## Roadmap Principles

- Build platform foundations before experience enhancements.
- Unify server rules before expanding CLI behavior.
- Let one milestone own one capability loop so it can be split into an independent future initiative.
- Keep long-term implementation details flexible at roadmap stage.

## Milestones

### M1: Server-side Version Governance

Goal: move version comparison, `maxVersion`, monotonic version constraints, and update preconditions into unified server-side governance.

Scope:
- Unified server-side version ordering and comparison
- Unified version preconditions for `publish/update`
- CLI consumes one consistent server-side version decision

Acceptance focus:
- Different clients reach the same version decision for the same Skill
- Suggested next version and max version no longer depend on client-private logic

### M2: Author and Permission Model

Goal: turn the current loose `metadata.author` plus signature checks into a real author namespace and write-permission model.

Scope:
- Define stable `author/name` resource semantics
- Bind `key_id` authorization to author identity
- Enforce author-based permission boundaries for update/delete/overwrite

Acceptance focus:
- Unauthorized keys cannot operate on another author's resources
- `author/name` stays consistent across CLI and server

### M3: Dependency Governance and Indexing

Goal: evolve the current dependency files and `wrap/deps` workflow into a server-understood, server-validated, queryable dependency governance system.

Scope:
- Server-side dependency closure checks
- Dependency indexing and dependency tree query
- Pre-publish dependency existence and consistency checks
- Unified rules for install and on-demand fetch

Acceptance focus:
- Missing dependencies, version mismatches, and dependency cycles return stable feedback
- `publish/get/deps` share one dependency semantic model

### M4: Search and Discovery

Goal: upgrade the current `q` / regex / client selection experience into a server-side discovery layer that scales with more Skills.

Scope:
- Multi-dimensional search by name/author/tag/description
- Server-side filtering and sorting
- Version views or selectors such as latest/stable/canary

Acceptance focus:
- Users can still locate targets reliably as the catalog grows
- The client no longer carries too much compensating filter logic

### M5: Storage Backend and Platformization

Goal: keep the filesystem mode for local use while opening a path toward multi-environment deployment, recovery, and auditability.

Scope:
- Keep FS store as local/development mode
- Define a path toward a more platform-oriented backend
- Improve audit, recycle, repair, and reindex capabilities

Acceptance focus:
- CLI behavior remains consistent across backend implementations
- Recovery and repair workflows are operational

### M6: Product Experience and Operations Assist

Goal: after the foundation stabilizes, add diagnosis, status inspection, publish assist, and possibly a lightweight visual entrypoint.

Scope:
- Config/environment/connectivity diagnostics
- Local versus remote state comparison
- Publish hints, upgrade hints, and troubleshooting entrypoints
- Optionally a lightweight web browser or read-only control plane

Acceptance focus:
- Users can diagnose common setup and runtime issues without reading code
- Experience improvements do not break governance rules established in earlier milestones

## Recommended Starting Point

If only one near-term initiative is chosen, start with `M1`.

Why:
- The current `update` flow already exposes version rules being compensated in the client.
- If version rules remain inconsistent, later work on permissions, dependencies, and discovery will rest on unstable assumptions.
- Completing `M1` gives `M2`, `M3`, and `M4` a stable versioning foundation.

## Related Documentation

- Project README: `README.md`
- Technical Summary: `docs/tech_summary.md`
- Command Reference: `docs/commands.md`
- Spec/plan process docs: local `spec/` and `plan/` only (not tracked by Git)
