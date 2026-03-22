# Command Map

## Bootstrap And Config
- `skr init`: interactively create global or workspace config.
- `skr config [--global]`: inspect the matched config path and JSON content.
- `skr skill`: install the default Skuare skill template into the current directory.

## Local Skill Files
- `skr build <skillName> [refSkill...] [--all]`: write `skill-deps.json` and `skill-deps.lock.json`.
- `skr format [skillDir...]` or `skr format --all`: normalize local `SKILL.md`.
- `skr detail <skillName|skillID> [relativePath...]`: inspect installed local skill files.
- `skr detail --type agentsmd`: inspect the local installed AGENTS.md file for the current tool roots.

## Remote Read / Install / Remove
- `skr health`: check the configured backend or `--server` endpoint.
- `skr list [--q <keyword>] [--rgx <pattern>]`: search remote skills.
- `skr list --type agentsmd|agmd [--q <keyword>] [--rgx <pattern>]`: search remote AGENTS.md records.
- `skr peek <skillRef> [version]`: inspect remote skill overview or exact version detail.
- `skr peek --type agentsmd|agmd <agentsmd-id> [version]`: inspect remote AGENTS.md detail.
- `skr get <skillRef> [version] [--global] [--wrap] [--slink]`: install a remote skill into local tool directories.
- `skr get --type agentsmd|agmd <agentsmd-id> [version] [--global]`: install AGENTS.md into local or global tool roots.
- `skr deps --brief|--content|--tree|--install <rootSkillDir> ...`: inspect or install wrapped dependencies.
- `skr remove <skillID|author/name|name> [--global] [--deps]`: remove installed local/global Skills and optionally their dependency subtrees.

## Remote Write
- `skr remote publish --dir <skillDir>`: publish the current local skill directory.
- `skr remote publish --type agentsmd --file <AGENTS.md> --agentsmd-id <id> --version <v>`: publish an AGENTS.md record.
- `skr remote update <skillRef> <newSkillDir>`: publish a greater version for an existing remote skill.
- `skr remote delete <skillID> <version>`: delete a remote skill version.
- `skr remote delete --type agentsmd <agentsmd-id> <version>`: delete a remote AGENTS.md record.

## Remote Sources And Migration
- `skr remote source list [--global]`: show visible named registry sources and the default source.
- `skr remote source add [--global] <originName> [--git|--svc] <remoteUrl>`: add a named HTTP or SSH Git registry source.
- `skr remote source remove [--global] <originName>`: delete a named registry source.
- `skr remote source select [--global] <originName>`: switch the default source.
- `skr remote source use [--global] <originName>`: compatibility alias for `select`.
- `skr remote migrate <src> <dst> [--type <all|skill|agentsmd|agmd>] [--dry-run] [--skip-existing]`: migrate Skill and/or AGENTS.md resources across registries.

## Shared Flags
- `--server <url>`: override the configured remote source for the current command.
- `--global`: switch install, read, or config scope from workspace to global where supported.
- `--type agentsmd|agmd`: switch shared commands from Skill resources to AGENTS.md resources.
- `--wrap`: install only the root Skill and keep dependencies queryable via `skr deps`.
- `--slink`: symlink the installed Skill directory to the local CLI repository skill directory instead of copying files.

## Selection Notes
- `skillRef` supports `skillID`, `author/name`, `name`, and version-qualified forms such as `author/name@1.2.0`.
- `peek/get/deps/remove` reuse the same selector logic when the target is a Skill and the input is not an exact `skillID`.
- `skr get --wrap` installs only the root skill and records wrap metadata for later `skr deps`.
- `skr get --slink` links installed targets to the local CLI repository skill directory instead of copying remote files.
- `--global` writes into each configured tool's global repository; omit it for workspace-local installation.
