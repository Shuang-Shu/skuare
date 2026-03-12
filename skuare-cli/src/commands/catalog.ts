import type { Command } from "./types";
import { HealthCommand } from "./admin";
import { InitCommand } from "./init";
import { DepsCommand, DetailCommand, GetCommand, ListCommand, PeekCommand, RemoveCommand, ValidateCommand } from "./query";
import { SkillCommand } from "./skill";
import { BuildCommand, CreateCommand, DeleteCommand, FormatCommand, PublishCommand, UpdateCommand } from "./write";

export type HelpEntry = {
  usage: string[];
  details?: string[];
};

export type CommandDefinition = {
  create: () => Command;
  help: HelpEntry;
};

export const STATIC_HELP_ENTRIES: HelpEntry[] = [
  { usage: ["help", "Show help"] },
  { usage: ["version", "Show version"] },
];

export const COMMAND_DEFINITIONS: CommandDefinition[] = [
  {
    create: () => new InitCommand(),
    help: { usage: ["init", "Interactive init for global/workspace config"] },
  },
  {
    create: () => new SkillCommand(),
    help: { usage: ["skill", "Install the embedded skuare skill into cwd"] },
  },
  {
    create: () => new HealthCommand(),
    help: { usage: ["health", "Health check (GET /healthz)"] },
  },
  {
    create: () => new DetailCommand(),
    help: {
      usage: ["detail <skillName|skillID> [relativePath...]", "Show local skill or AGENTS.md content"],
      details: ["detail --type <agentsmd|agmd>          Show local AGENTS.md content"],
    },
  },
  {
    create: () => new ListCommand(),
    help: {
      usage: ["list [--type <skill|agentsmd|agmd>] [--q <keyword>] [--rgx <re>]", "List skills or AGENTS.md"],
      details: [
        "                                       Search input must be passed via --q or --rgx; bare positional arguments are rejected",
      ],
    },
  },
  {
    create: () => new PeekCommand(),
    help: {
      usage: ["peek [--type <skill|agentsmd|agmd>] <author>/<name>@<version> | <author>/<name> | <name> [version]", "Peek skill or AGENTS.md overview/detail"],
      details: [
        "                                       - <author>/<name>@<version> or <name>@<version>: exact version detail",
        "                                       - <author>/<name> or <name>: resolve the target skill, then show overview",
        "peek --rgx <re> [version]            Peek skill by regex (must match exactly one skill)",
        "peek --type <agentsmd|agmd> <id> [version]",
      ],
    },
  },
  {
    create: () => new GetCommand(),
    help: {
      usage: ["get [--type <skill|agentsmd|agmd>] <author>/<name>@<version> | <author>/<name> | <name> [--global] [--wrap]", ""],
      details: [
        "                                       Default mode installs skill and dependencies to local partial repository",
        "                                       - <author>/<name>@<version> or <name>@<version>: exact match",
        "                                       - <author>/<name> or <name>: interactive selection if multiple versions found",
        "                                       - Default: <cwd>/.{tool}/skills/, --global: ~/.{tool}/skills/",
        "                                       - --wrap: install only the root skill and keep dependencies queryable via `skr deps`",
        "                                       - When existing local skill files would be overwritten, `get` shows an interactive confirmation in TTY; non-TTY sessions fail instead of silently overwriting",
        "get --rgx <pattern> [version] [--global] [--wrap]",
        "                                       Install by regex pattern (must match exactly one skill)",
        "get --type <agentsmd|agmd> <agentsmd-id> [version] [--global]",
        "                                       Install AGENTS.md to <cwd>/.{tool}/AGENTS.md or ~/.{tool}/AGENTS.md",
      ],
    },
  },
  {
    create: () => new DepsCommand(),
    help: {
      usage: ["deps (--brief|--content|--tree|--install) <rootSkillDir> [depSkillID|author/name@version|author/name|name] [--global]", "Inspect or install wrapped skill dependencies"],
      details: [
        "deps --brief <rootSkillDir>            List all descendant dependency skill IDs and descriptions",
        "deps --content <rootSkillDir> <depSkillID|author/name@version|author/name|name>",
        "                                       Print the target dependency's SKILL.md content",
        "deps --tree <rootSkillDir> <depSkillID|author/name@version|author/name|name>",
        "                                       Show the target dependency's file list",
        "deps --install <rootSkillDir> <depSkillID|author/name@version|author/name|name> [--global]",
        "                                       Install the selected dependency subtree next to the wrapped root or into ~/.{tool}/skills/",
        "                                       Existing local dependency versions also require interactive overwrite confirmation; non-TTY sessions fail instead of silently overwriting",
      ],
    },
  },
  {
    create: () => new RemoveCommand(),
    help: {
      usage: ["remove <skillID|author/name|name> [--global] [--deps]", "Remove local installed skills"],
      details: [
        "                                       Default mode removes from every configured workspace tool skill root; --global removes from every configured global skill root",
        "                                       - <skillID>: exact local target, no interactive selector",
        "                                       - <author>/<name> or <name>: interactive multi-select when multiple installed candidates match",
        "                                       - --deps: recursively remove the target subtree, but keep shared dependencies still referenced elsewhere",
      ],
    },
  },
  {
    create: () => new ValidateCommand(),
    help: { usage: ["validate <skillID> <version>", "Validate a version"] },
  },
  {
    create: () => new PublishCommand(),
    help: {
      usage: ["publish [--type <skill|agentsmd|agmd>] --file <request.json|AGENTS.md> [--force|-f]", "Publish skill or AGENTS.md"],
      details: [
        "publish --skill <SKILL.md> [--skill-id <id>] [--version <v>] [--force|-f]",
        "                                       Explicit SKILL.md mode, version from frontmatter metadata.version",
        "publish --dir <skillDir> [--skill-id <id>] [--version <v>] [--force|-f]",
        "                                       Explicit dir mode, version from <dir>/SKILL.md frontmatter metadata.version",
        "publish <path...> [--all] [--skill-id <id>] [--version <v>] [--force|-f]",
        "                                       Auto detect each path: SKILL.md -> dir -> JSON fallback",
        "                                       Use --force/-f to overwrite an existing skill version",
        "publish --type <agentsmd|agmd> --file <AGENTS.md> --agentsmd-id <id> --version <v>",
        "publish --type <agentsmd|agmd> --dir <dir>",
        "                                       Publish AGENTS.md via /api/v1/agentsmd",
      ],
    },
  },
  {
    create: () => new UpdateCommand(),
    help: {
      usage: ["update <skillRef> <newSkillDir>", "Publish a new version for an existing remote skill"],
      details: [
        "                                       <skillRef> supports skillID | name | author/name; ambiguous matches reuse the shared selector,",
        "                                       Queries remote maxVersion, prompts with a greater suggested version,",
        "                                       then writes metadata.version back to <newSkillDir>/SKILL.md before publish",
      ],
    },
  },
  {
    create: () => new CreateCommand(),
    help: { usage: ["create ... [--type <skill|agentsmd|agmd>] [--force|-f]", "Deprecated alias of publish"] },
  },
  {
    create: () => new BuildCommand(),
    help: {
      usage: ["build <skillName> [refSkill...] [--all]", ""],
      details: [
        "                                       Build deps files, scans current skill dirs with --all, initializes missing target interactively",
      ],
    },
  },
  {
    create: () => new DeleteCommand(),
    help: {
      usage: ["delete [--type <skill|agentsmd|agmd>] <resourceID> <version>", "Delete skill or AGENTS.md version"],
    },
  },
  {
    create: () => new FormatCommand(),
    help: {
      usage: ["format [skillDir...]", "Interactive format for metadata.version/metadata.author"],
      details: ["format --all                         Format all skill dirs under current directory"],
    },
  },
];

export function getHelpEntries(): HelpEntry[] {
  return [...STATIC_HELP_ENTRIES, ...COMMAND_DEFINITIONS.map((definition) => definition.help)];
}
