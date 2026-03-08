# skuare Technical Summary

> [中文版 / Chinese Version](./tech_summary_zh.md)

> Document Type: TECH  
> Status: Completed  
> Last Updated: 2026-03-08  
> Scope: project-wide

## Objectives and Scope
- Summarize `skuare`'s current technical implementation, interface constraints, configuration mechanisms, dependency model, and operational parameters.
- Serves as a technical supplement to the README, targeting developers/maintainers.
- For precise dependency file format, see: `docs/skill_deps_format.md`.
- For tiered storage details, see: `docs/storage_hierarchy.md`.

## Current Status and Factual Basis
- Modules:
  - `skuare-svc`: Filesystem storage model `<specDir>/<skillID>/<version>`.
  - `skuare-cli`: Command-line frontend, supports `init/health/list/peek/get/deps/publish/create/build/format/delete/validate` and `agentsmd` command groups.
- Key Configuration:
  - Backend default `spec-dir`: `$HOME/.skuare` (can be overridden by `SKUARE_SPEC_DIR` or `--spec-dir`).
  - `scripts/dev-up.sh` and `make start-be` default `SPEC_DIR` unified to `$HOME/.skuare`.
  - Startup parameters: `--addr`, `--spec-dir`, `--authorized-keys-file`, `--local`, `--auth-max-skew-sec`.
  - CLI config priority: `CLI args > workspace > global > defaults`.
  - CLI `remote.mode`: `local` / `remote`, only describes target server mode, not responsible for declaring server storage directory.
  - CLI local installation root: default skill install path is `<cwd>/.{tool}/skills/`; `--global` switches to `~/.{tool}/skills/`.
  - `agentsmd` install target is `<cwd>/.{tool}/AGENTS.md`; `--global` switches to `~/.{tool}/AGENTS.md`.
- Authentication:
  - Write endpoints require Ed25519 signature headers in remote mode.
  - When `local=true`, backend directly allows write requests.
- Dependency Model:
  - Dependencies are not declared in `SKILL.md` frontmatter.
  - Uses `skill-deps.json` + `skill-deps.lock.json`.
  - `skill-deps*.json` field structure follows examples in `@examples` directory.
  - Cross-skill references in `SKILL.md` body use unified format `{{ <author>/<name>@<version> }}`.
  - `skr publish` recursively uploads dependencies, returns `WARN` for existing versions; `skr create` retained as compatibility alias with deprecation notice.
- Output Constraints:
  - `skr list` output includes `id/name/author/skill_id/version/description`, where `id=<author>/<name>@<version>` and appears before `name`.
  - `skr list` supports `--regex <pattern>` for client-side regex filtering (matches `id/skill_id/name/author/description`).
  - `skr peek` output aligns with `id/name/author` display conventions.
  - `skr peek` supports `--regex <pattern>` for unique match then query details.
  - `skr get --wrap` installs only the root skill and persists `.skuare-wrap.json`; `skr deps` inspects or installs wrapped dependency subtrees on demand.
  - `agentsmd` short aliases such as `list-agmd` and `get-agmd` are implemented as explicit proxy commands to keep compatibility while avoiding duplicated business logic.
  - When `SKILL.md metadata.author` exists, the server returns `author` directly in `publish/list/peek` related responses.
  - When `author` is missing, defaults to `undefined`.
  - `skr publish` output does not include server local paths.
  - `skr format [skillDir...]` interactively supports `All/Each`, and uniformly writes `metadata.version`/`metadata.author`; `skr format --all` automatically scans current directory sub-skills.
  - `make format` only passes through CLI `format` command, no longer incorrectly requires additional `VERSION` parameter.
- Maintainer Notes:
  - CLI shared parsing logic now lives in dedicated helper modules (`utils/command_args`, `utils/skill_manifest`, `utils/install_paths`, `utils/skill_workspace`) instead of being duplicated across `query.ts`, `write.ts`, and `agentsmd.ts`.
  - Backend handler/store layers use lightweight helper methods for repeated JSON response and versioned-resource filesystem flows; the project intentionally avoids introducing a heavy generic resource framework.

## Gap Analysis
- Documentation level:
  - Past README carried too many implementation details, unclear user onboarding path.
- Runtime level:
  - When mixing local and remote modes, easily causes "CLI config and backend startup parameters inconsistent".
- Protocol level:
  - Dependency recursive upload currently parses by directory convention (`skills/<depSkillID>`), cross-repository dependencies not unified.

## Suggested Evolution Path
- Parameter unification:
  - Add `make doctor` to check CLI config and backend runtime parameter consistency.
- Observability:
  - Backend adds startup config echo endpoint (read-only, safe fields).
- Dependency capabilities:
  - Support configurable dependency resolution root directory and remote dependency fetch strategy.
- Stability:
  - Add snapshot tests for `publish/list` output format to avoid field regression.

## Risks and Boundaries
- Local mode risks:
  - Convenient for development, but disables signature verification, not directly usable in production.
- Path risks:
  - Shared `SPEC_DIR` may cause multi-environment pollution, need clear directory isolation strategy.
- Compatibility boundaries:
  - Existing clients depend on simplified output fields, extensions should use explicit switches rather than default changes.
