# Skuare Usage Guide

## Command Families
- Local-only: `init`, `config`, `skill`, `build`, `format`, `detail`
- Remote read: `health`, `list`, `peek`, `validate`
- Install and local lifecycle: `get`, `deps`, `remove`
- Remote write: `remote publish`, `remote update`, `remote create`, `remote delete`, `remote migrate`
- Remote source management: `remote source list`, `remote source add`, `remote source remove`, `remote source select`

## Bootstrap A Workspace
1. Run `skr init` to create global or workspace config.
2. Run `skr config` or `skr config --global` to confirm the active config path and values.
3. Run `skr skill` when you need a starter Skill template in the current directory.

## Local Skill Authoring
1. Edit local Skill files in the workspace.
2. Run `skr build <skillName> [refSkill...] [--all]` to refresh `skill-deps.json` and `skill-deps.lock.json`.
3. Run `skr format [skillDir...]` or `skr format --all` to normalize `SKILL.md`.
4. Run `skr detail <skillName|skillID> [relativePath...]` to inspect the installed result or local generated files.

## Query A Registry
- `skr health`: check the active backend.
- `skr list [--q ...] [--rgx ...]`: search Skills.
- `skr peek <skillRef> [version]`: inspect one Skill or one exact version.
- Add `--type agentsmd|agmd` to `list` or `peek` when the task targets AGENTS.md resources.

## Install Skills Or AGENTS.md
- `skr get <skillRef> [version]`: install a Skill into each configured workspace tool root.
- `skr get <skillRef> [version] --global`: install into global tool roots.
- `skr get <skillRef> --wrap`: install only the root Skill and inspect dependencies later with `skr deps`.
- `skr get <skillRef> --slink`: create symlinks to the local CLI repository skill directory instead of copying files.
- `skr get --type agentsmd <agentsmd-id> [version] [--global]`: install AGENTS.md into tool roots.

## Inspect Or Install Wrapped Dependencies
- `skr deps --brief <rootSkillDir>`: list all descendant dependencies.
- `skr deps --content <rootSkillDir> <depRef>`: print the dependency `SKILL.md`.
- `skr deps --tree <rootSkillDir> <depRef>`: list files contained in the dependency.
- `skr deps --install <rootSkillDir> <depRef> [--global]`: install one dependency subtree on demand.

## Remove Installed Skills
- `skr remove <skillID|author/name|name>`: remove installed workspace-local Skills.
- `skr remove <target> --global`: remove global installs.
- `skr remove <target> --deps`: also remove the dependency subtree, while preserving shared dependencies still needed by other root Skills.

## Manage Remote Sources
- `skr remote source list [--global]`: show named sources and the selected default source.
- `skr remote source add [--global] <originName> --svc <https-url>`: register an HTTP backend.
- `skr remote source add [--global] <originName> --git <ssh-git-url>`: register an SSH Git backend.
- `skr remote source select [--global] <originName>`: make one named source the default for later commands.
- `skr remote source remove [--global] <originName>`: remove a named source.

## Publish, Update, Delete, And Migrate
- `skr remote publish --dir <skillDir>`: publish a Skill directory.
- `skr remote publish --skill <SKILL.md>`: publish starting from one `SKILL.md`.
- `skr remote publish --type agentsmd --file <AGENTS.md> --agentsmd-id <id> --version <v>`: publish AGENTS.md.
- `skr remote update <skillRef> <newSkillDir>`: rewrite local version to a greater remote version and publish.
- `skr remote delete <skillID> <version>`: delete one remote Skill version.
- `skr remote delete --type agentsmd <agentsmd-id> <version>`: delete one remote AGENTS.md version.
- `skr remote migrate <src> <dst> [--type ...] [--dry-run] [--skip-existing]`: copy resources across registries.

## Common Flags
- `--server <url>`: bypass config and point one command to a specific backend.
- `--global`: switch supported commands from workspace scope to global scope.
- `--type agentsmd|agmd`: switch shared commands from Skill resources to AGENTS.md resources.
- `--wrap`: root-only install for dependency-heavy Skills.
- `--slink`: symlink local installs to the CLI repository skill directory.
