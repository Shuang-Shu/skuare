# skuare

> [中文版 / Chinese Version](./README_zh.md)

A local-first Skill Registry for managing AI Skills like package management.  
Core value: version-controlled management of "Skill content + dependencies" — traceable, rollbackable, and verifiable.

## Why skuare
- Unified Skill version management: stored as `<skill_id>/<version>`, easy to audit and trace.
- Built-in dependency management: describe relationships via dependency manifests, recursively handle dependency chains during upload and installation.
- Great local development experience: quick startup in `local` mode, suitable for debugging and iteration.
- Production-ready convergence: `remote` mode enables signature verification for write operations.

## Project Components
- `skuare-svc`: HTTP backend (Skill storage and API).
- Git repo backend: use a Git repository directory directly as the remote registry.
- `skuare-cli`: Command-line tool (`skr` / `skuare`).

Default repository root path: `$HOME/.skuare`

## Command Groups
- Pure local commands: `help`, `version`, `init`, `config`, `skill`, `build`, `format`, `detail`
  - Main purpose: generate or modify local config, Skill files, dependency files
  - Do not access server by default
- Server read-only commands: `health`, `list`, `peek`, `validate`
  - Main purpose: check service status, query remote repository content, trigger server-side validation
  - Access server but do not write to remote repository
- Hybrid commands: `get`, `deps`, `remove`
  - `get`: fetch Skills or AGENTS.md from a registry and install them locally
  - `deps`: inspect or install dependency subtrees for a wrapped root Skill
  - `remove`: delete installed local/global Skills, optionally with dependency cleanup
- Server write commands: `remote publish`, `remote update`, `remote create`, `remote delete`, `remote migrate`
  - Main purpose: write to remote repository
  - Whether unsigned writes are allowed on the HTTP backend is determined by the server; CLI only attaches signatures when signing credentials are provided
- Remote source management commands: `remote source list`, `remote source add`, `remote source remove`, `remote source select`
  - Main purpose: manage named registry sources in config
  - `remote source add --git` only accepts SSH Git URLs
- Shared resource switching: `list`, `peek`, `get`, `detail`, `remote publish`, `remote create`, `remote delete`
  - Skill is the default resource; pass `--type agentsmd` or `--type agmd` to switch to AGENTS.md resources

## Remote Backends
- `skr --server <url>` can now point to either registry backend:
  - `http://` / `https://`: `skuare-svc`
  - `git+file://...`, `git+https://...`, `git+ssh://...`: Git repo backend
- Git repo backend reuses the current default service layout:
  - Skill: `<repoRoot>/<author>/<skillID>/<version>/...`
  - AGENTS.md: `<repoRoot>/agentsmd/<agentsmdID>/<version>/AGENTS.md`
- `skr init` still primarily writes HTTP address/port config; for now, use Git repo backend via `--server`, `SKUARE_SVC_URL`, or named `remote source` entries.

## Git Registry Workflow
- Recommended flow:
```bash
skr remote source add repo --git git@github.com:team/skuare-registry.git
skr remote source select repo
skr remote publish --dir ./skills/observability-orchestrator
skr remote migrate repo https://backup.example.com --dry-run
skr list
skr peek team/observability-orchestrator
```
- Direct `--server` also works for one-off usage:
```bash
skr --server git+file:///tmp/skuare-registry.git remote publish --dir ./skills/observability-orchestrator
skr --server git+file:///tmp/skuare-registry.git list
```
- Notes:
  - `remote source add --git` only accepts SSH Git URLs and normalizes them to `git+ssh://...`
  - `git+file://` and `git+https://` are supported through `--server`, but are not stored as named Git sources
  - Git backend caches repositories under `~/.skuare/cache/git-registry` by default and applies a 1-day TTL for read cache
  - Git backend write operations auto-run `pull/commit/push` with commit messages like `registry(<resource>): <action> <id>@<version>`

## Core Capability: Dependency Management
- Dependency description file: `skill-deps.json`
- Dependency lock file: `skill-deps.lock.json`
- `skr remote publish --dir <skill-dir> [--force|-f]`: read dependency description and recursively upload dependent Skills to the remote registry; `--force/-f` overwrites an existing version.
- `skr remote migrate <src> <dst> [--type <all|skill|agentsmd|agmd>] [--dry-run] [--skip-existing]`: batch export resources from one registry and import them into another; `src/dst` accept named sources or direct URLs.
- `skr remote update <skillRef> <newSkillDir>`: query the remote skill's `maxVersion`, require a higher version, rewrite local `SKILL.md metadata.version`, then publish. `skillRef` supports `skillID`, `name`, and `author/name`; ambiguous matches reuse the same selector as `get/peek/deps`.
- `skr config [--global]`: print the matched config path and JSON content; default lookup walks upward from `cwd`, while `--global` reads `~/.skuare/config.json`.
- `skr skill`: install the embedded skuare-authored LLM skill into `cwd`; generated `metadata.version` matches the current `skuare` version.
- `skr build <skillName> [refSkill...] [--all]`: automatically create or append dependency files (`skill-deps.json` / `skill-deps.lock.json`) for a local Skill. When the target Skill does not exist, it interactively creates a minimal `SKILL.md` template first. Supports `alias=refSkill`; `--all` uses all valid Skill directories in the current directory as references.
- `skr detail <skillName|skillID> [relativePath...]`: show files under a local installed Skill. Defaults to the target Skill's `SKILL.md` when no path is provided.
- `skr get <skill-ref> [version] [--global] [--wrap] [--slink]`: fetch a Skill from a remote registry. When directly targeting one Skill, `peek/get/deps` share the same selector logic for `skillID`, `name`, and `author/name`.
  - Without `--global`: walk upward from `cwd` to the nearest directory containing `.skuare`, then install to every configured tool's workspace Skill directory, by default `<workspace-root>/.{llmTool}/skills/<skillID>/`
  - If upward lookup only finds `~/.skuare`, `skr get` refuses to treat it as a workspace and asks you to run `skr init` in the project first
  - With `--global`: install to every configured tool's global Skill directory, by default `~/.{llmTool}/skills/<skillID>/`
  - `--global` changes install location only; the configured tool set stays the same
  - `--slink` creates symlinks to the local CLI repository Skill directory instead of copying remote files
  - Default mode installs the full dependency graph flatly; `--wrap` installs only the root Skill and leaves dependencies queryable via `skr deps`
- `skr deps --brief|--content|--tree|--install <rootSkillDir> ...`: inspect or install wrapped dependency subtrees on demand; dependency targets also accept `skillID/name/author/name` plus optional `@version`.
- `skr remove <skillID|author/name|name> [--global] [--deps]`: remove installed Skills. `--deps` recursively removes the selected dependency subtree while preserving shared dependencies still referenced by other roots.
- AGENTS.md resources use the same shared command surface through `--type agentsmd|agmd`, for example `skr get --type agentsmd`, `skr detail --type agentsmd`, and `skr remote publish --type agentsmd`.

Example:
- If `a` depends on `b` and `c`, after executing `skr get a`, you'll get three skill directories `a`, `b`, `c` under the target tool directory.
- If you execute `skr get a --wrap`, only `a` is installed locally first; use `skr deps --brief <rootSkillDir>` to inspect the full dependency graph and `skr deps --install <rootSkillDir> <depSkillID>` to install a subtree later.
- If two installed root skills share the same child skill, overwrite confirmation will explicitly show which other installed root skills still depend on that child before writing the new version.

## Quick Start
```bash
# 1) Start backend (local mode, daemon)
make start-be LOCAL_MODE=true DAEMON=true

# 2) Install dependencies and CLI entry
make install
# By default this links skr to /usr/local/bin/skr on Linux.
# If /usr/local/bin is not writable, use sudo or override the target:
# make install PREFIX=$HOME/.local

# If the repo already has skuare-cli/dist, skr will reuse the pre-built artifacts;
# It will only rebuild when needed and local TypeScript toolchain is available.
# If falling back to old dist, `skr remote publish ...` will bridge to old command `publish ...` or `create ...` for basic compatibility.
# `make install` requires local `npm` and `go` in PATH; it installs `skuare-cli` dependencies,
# runs `go mod download` for `skuare-svc`, and then registers `skr` into `BINDIR`
# (default `/usr/local/bin`, override with `PREFIX=/path` or `BINDIR=/path`).

# 3) Initialize (optional)
skr init

# 4) Health check
skr health

# 5) Pure local commands: init/config/skill/build/format/detail
skr config
skr config --global
skr skill
skr build observability-orchestrator core-time-utils report-generator
skr build observability-orchestrator --all
skr format ./skills/observability-orchestrator
skr detail observability-orchestrator

# 6) Server read-only commands: health check/query
skr health
skr list
skr peek observability-orchestrator
skr --server git+file:///tmp/skuare-registry.git list

# 7) Server write commands: publish/migrate registry resources
skr remote source add origin --svc https://registry.example.com
skr remote source add repo --git git@github.com:team/skills.git
skr remote source select origin
skr remote publish --dir ./skills/observability-orchestrator
skr remote publish --dir ./skills/observability-orchestrator --force
skr --server git+file:///tmp/skuare-registry.git remote publish --dir ./skills/observability-orchestrator

# 8) Hybrid commands: fetch, inspect dependencies, remove
skr get observability-orchestrator
skr get observability-orchestrator --wrap
skr deps --brief ./.codex/skills/skuare/observability-orchestrator
skr remove observability-orchestrator

# 9) Stop backend daemon
make stop-be
```

## Common Commands
- Pure local commands:
```bash
skr config
skr skill
skr build observability-orchestrator core-time-utils report-generator
skr format ./skills/observability-orchestrator
skr format --all
skr detail observability-orchestrator
skr detail skuare/observability-orchestrator references/details.md notes.txt
```

- Server read-only commands:
```bash
skr health
skr list --q observability
skr list --rgx "report|alert"
skr peek observability-orchestrator
skr peek --rgx "^skuare/report-generator@"
skr validate observability-orchestrator 1.0.0
```

- Hybrid commands:
```bash
skr get --rgx "observability"
skr get observability-orchestrator
skr get observability-orchestrator --global
skr get observability-orchestrator --wrap
skr get observability-orchestrator --slink
skr deps --brief ./.codex/skills/skuare/observability-orchestrator
skr deps --content ./.codex/skills/skuare/observability-orchestrator skuare/core-time-utils
skr deps --install ./.codex/skills/skuare/observability-orchestrator skuare/core-time-utils
skr remove observability-orchestrator --deps
```

- Server write commands:
```bash
skr remote source list
skr remote source add origin --svc https://registry.example.com
skr remote source add repo --git git@github.com:team/skills.git
skr remote source select repo
skr remote publish --dir ./skills/observability-orchestrator
skr remote publish --dir ./skills/observability-orchestrator --force
skr remote migrate origin repo --dry-run
skr remote migrate origin repo --skip-existing
skr remote update observability-orchestrator ./examples/observability-orchestrator
skr remote create --dir ./skills/observability-orchestrator
skr remote delete observability-orchestrator 1.0.0
```

## Running Modes
- `local`: Server local mode, server can allow unsigned write requests.
- `remote`: Server remote mode, usually requires signed write requests.
- Whether CLI attaches signatures only depends on whether `--key-id` and `--privkey-file` are provided.

## Documentation Navigation
- Technical Summary: `docs/tech_summary.md`
- Roadmap: `docs/roadmap.md`
- Server Documentation: `skuare-svc/README.md`
- CLI Documentation: `skuare-cli/README.md`

## Changelog
- 2026-03-22: Root README synced with the current CLI surface, including `skill`, `deps`, `remove`, AGENTS.md resource switching, and `remote source/migrate`.
- 2026-02-26: README adjusted to more generic GitHub style, retaining original information with optimized expression.
- 2026-02-26: Command semantics adjusted: `peek` for query, `get` for installation, `format` for formatting, `create` supports multiple paths and `--all`.
- 2026-02-27: `get` installation directory distinguished by LLMTool (`codex`/`claudecode`/custom`), `init` supports custom tool skills directory configuration.
- 2026-02-27: Added `build <skillName> [refSkill...]`, supports automatic creation/append of `skill-deps.json` and `skill-deps.lock.json`.
- 2026-03-01: `build` added `--all`, can batch write all valid skillDirs in current directory as reference skills; when target skill is missing, it will interactively initialize minimal `SKILL.md` template first.
- 2026-03-01: `get` added `--rgx` for regex skill selection; `list/peek` external parameter name unified to `--rgx` (compatible with old `--regex`).
- 2026-02-28: Distinguished remote repository and local partial repository: `publish` became main write command, `get` added `--scope/--repo-dir/--tool`, default repository root unified to `~/.skuare`.
- 2026-03-01: Cleaned up repository entry style: `make format` no longer incorrectly requires `VERSION`, `scripts/dev-up.sh` default `SPEC_DIR` consistent with main entry.
- 2026-03-02: `get` simplified parameters: removed `--scope/--repo-dir/--tool`, changed to `--global` flag; without `--global` installs to `<cwd>/.{llmTool}/skills/`, with `--global` installs to `~/.{llmTool}/skills/`.
- 2026-03-02: Updated `skr detail` to `skr detail <skillName|skillID> [relativePath...]`; it resolves a local installed skill first, defaults to that skill's `SKILL.md`, and rejects paths outside the target skill directory.
- 2026-03-01: `skr` bridges `publish` to old command `create` when falling back to old `dist/index.js`, avoiding `Unknown command: publish` in environments without TypeScript.
- 2026-03-02: Documentation translated to English with Chinese version references.
- 2026-03-04: Root install entry changed from `make install-skr` to `make install`; it now installs `skuare-cli` npm dependencies, runs `go mod download` for `skuare-svc`, and then registers `skr`.
- 2026-03-08: Added `skr get --wrap` and `skr deps`, allowing root-only installation for large skill groups and on-demand dependency inspection/installation; `get` now reports circular dependencies explicitly instead of silently skipping them.
