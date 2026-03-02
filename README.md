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
- `skuare-svc`: Backend service (Skill storage and API).
- `skuare-cli`: Command-line tool (`skr` / `skuare`).

Default repository root path: `$HOME/.skuare`

## Command Groups
- Pure local commands: `help`, `version`, `init`, `build`, `format`, `detail`
  - Main purpose: generate or modify local config, Skill files, dependency files
  - Do not access server by default
- Server read-only commands: `health`, `list`, `peek`, `validate`
  - Main purpose: check service status, query remote repository content, trigger server-side validation
  - Access server but do not write to remote repository
- Hybrid commands: `get`
  - Main purpose: fetch Skills from server and install to local partial repository
  - Access server and write to local repository
  - Default installation root: `~/.skuare`
- Server write commands: `publish`, `create`, `delete`
  - Main purpose: write to remote repository
  - Whether unsigned writes are allowed is determined by the server; CLI only attaches signatures when signing credentials are provided

## Core Capability: Dependency Management
- Dependency description file: `skill-deps.json`
- Dependency lock file: `skill-deps.lock.json`
- `skr publish --dir <skill-dir>`: read dependency description and recursively upload dependent Skills to remote repository.
- `skr build <skillName> [refSkill...] [--all]`: automatically create or append dependency files (`skill-deps.json` / `skill-deps.lock.json`) for local skill. When target skill doesn't exist, it will interactively create a minimal `SKILL.md` template first. Supports `alias=refSkill`; `--all` will use all valid skillDirs in current directory as reference skills.
- `skr detail [skillRelativePath...]`: show local skill file contents. Defaults to `SKILL.md` when no path is provided.
- `skr get <skill-id> [--global]`: fetch Skill from remote repository and install its dependencies flatly.
  - Without `--global`: install to `<cwd>/.{llmTool}/skills/<skillID>/`
  - With `--global`: install to `~/.{llmTool}/skills/<skillID>/`
  - `llmTool` is the first tool in config file (codex/claudecode/custom)

Example:
- If `a` depends on `b` and `c`, after executing `skr get a`, you'll get three skill directories `a`, `b`, `c` under the target tool directory.

## Quick Start
```bash
# 1) Start backend (local mode, daemon)
make start-be LOCAL_MODE=true DAEMON=true

# 2) Install CLI
make install-skr
export PATH=/tmp/skuare-bin/bin:$PATH

# If the repo already has skuare-cli/dist, skr will reuse the pre-built artifacts;
# It will only rebuild when needed and local TypeScript toolchain is available.
# If falling back to old dist, `skr publish ...` will bridge to old command `create ...` for basic compatibility.

# 3) Initialize (optional)
skr init

# 4) Health check
skr health

# 5) Pure local commands: init/build/format/detail
skr build observability-orchestrator core-time-utils report-generator
skr build observability-orchestrator --all
skr format ./skills/observability-orchestrator
skr detail

# 6) Server read-only commands: health check/query
skr health
skr list
skr peek observability-orchestrator

# 7) Server write commands: publish Skill (recursively handles dependencies)
skr publish --dir ./skills/observability-orchestrator

# 8) Hybrid commands: fetch and install (flatly installs dependencies)
skr get observability-orchestrator

# 9) Stop backend daemon
make stop-be
```

## Common Commands
- Pure local commands:
```bash
skr build observability-orchestrator core-time-utils report-generator
skr format ./skills/observability-orchestrator
skr format --all
skr detail
skr detail references/details.md notes.txt
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
```

- Server write commands:
```bash
skr publish --dir ./skills/observability-orchestrator
skr create --dir ./skills/observability-orchestrator
skr delete observability-orchestrator 1.0.0
```

## Running Modes
- `local`: Server local mode, server can allow unsigned write requests.
- `remote`: Server remote mode, usually requires signed write requests.
- Whether CLI attaches signatures only depends on whether `--key-id` and `--privkey-file` are provided.

## Documentation Navigation
- Technical Summary: `docs/tech_summary.md`
- Server Documentation: `skuare-svc/README.md`
- CLI Documentation: `skuare-cli/README.md`

## Changelog
- 2026-02-26: README adjusted to more generic GitHub style, retaining original information with optimized expression.
- 2026-02-26: Command semantics adjusted: `peek` for query, `get` for installation, `format` for formatting, `create` supports multiple paths and `--all`.
- 2026-02-27: `get` installation directory distinguished by LLMTool (`codex`/`claudecode`/custom`), `init` supports custom tool skills directory configuration.
- 2026-02-27: Added `build <skillName> [refSkill...]`, supports automatic creation/append of `skill-deps.json` and `skill-deps.lock.json`.
- 2026-03-01: `build` added `--all`, can batch write all valid skillDirs in current directory as reference skills; when target skill is missing, it will interactively initialize minimal `SKILL.md` template first.
- 2026-03-01: `get` added `--rgx` for regex skill selection; `list/peek` external parameter name unified to `--rgx` (compatible with old `--regex`).
- 2026-02-28: Distinguished remote repository and local partial repository: `publish` became main write command, `get` added `--scope/--repo-dir/--tool`, default repository root unified to `~/.skuare`.
- 2026-03-01: Cleaned up repository entry style: `make format` no longer incorrectly requires `VERSION`, `scripts/dev-up.sh` default `SPEC_DIR` consistent with main entry.
- 2026-03-02: `get` simplified parameters: removed `--scope/--repo-dir/--tool`, changed to `--global` flag; without `--global` installs to `<cwd>/.{llmTool}/skills/`, with `--global` installs to `~/.{llmTool}/skills/`.
- 2026-03-02: Added `skr detail [skillRelativePath...]` for local file viewing; defaults to `SKILL.md` and rejects paths outside the current skill directory.
- 2026-03-01: `skr` bridges `publish` to old command `create` when falling back to old `dist/index.js`, avoiding `Unknown command: publish` in environments without TypeScript.
- 2026-03-02: Documentation translated to English with Chinese version references.
