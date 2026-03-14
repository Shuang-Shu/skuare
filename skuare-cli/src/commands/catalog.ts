import type { Command } from "./types";
import { HealthCommand } from "./admin";
import { ConfigCommand } from "./config";
import { InitCommand } from "./init";
import { DepsCommand, DetailCommand, GetCommand, ListCommand, PeekCommand, RemoveCommand, ValidateCommand } from "./query";
import { SkillCommand } from "./skill";
import { BuildCommand, CreateCommand, DeleteCommand, FormatCommand, PublishCommand, UpdateCommand } from "./write";

export type HelpEntry = {
  name: string;
  summary: string;
  usage: string[];
  details?: string[];
};

export type CommandDefinition = {
  create: () => Command;
  help: HelpEntry;
};

export const STATIC_HELP_ENTRIES: HelpEntry[] = [
  {
    name: "help",
    summary: "Show help",
    usage: ["help [command]"],
    details: [
      "Without [command], show all commands",
      "With [command], show help for the selected command",
    ],
  },
  { name: "version", summary: "Show version", usage: ["version"] },
];

export const COMMAND_DEFINITIONS: CommandDefinition[] = [
  {
    create: () => new InitCommand(),
    help: {
      name: "init",
      summary: "Interactive init for global/workspace config",
      usage: ["init"],
    },
  },
  {
    create: () => new ConfigCommand(),
    help: {
      name: "config",
      summary: "Show config file content and path",
      usage: ["config [--global]"],
      details: [
        "Default: walk upward from cwd and return the first .skuare/config.json found before /",
        "--global: read ~/.skuare/config.json directly",
      ],
    },
  },
  {
    create: () => new SkillCommand(),
    help: {
      name: "skill",
      summary: "Install the embedded skuare skill into cwd",
      usage: ["skill"],
    },
  },
  {
    create: () => new HealthCommand(),
    help: {
      name: "health",
      summary: "Health check (GET /healthz)",
      usage: ["health"],
    },
  },
  {
    create: () => new DetailCommand(),
    help: {
      name: "detail",
      summary: "Show local skill or AGENTS.md content",
      usage: [
        "detail <skillName|skillID> [relativePath...]",
        "detail --type <agentsmd|agmd>",
      ],
      details: ["Use --type <agentsmd|agmd> to show local AGENTS.md content"],
    },
  },
  {
    create: () => new ListCommand(),
    help: {
      name: "list",
      summary: "List skills or AGENTS.md",
      usage: ["list [--type <skill|agentsmd|agmd>] [--q <keyword>] [--rgx <re>]"],
      details: [
        "Search input must be passed via --q or --rgx; bare positional arguments are rejected",
      ],
    },
  },
  {
    create: () => new PeekCommand(),
    help: {
      name: "peek",
      summary: "Peek skill or AGENTS.md overview/detail",
      usage: [
        "peek [--type <skill|agentsmd|agmd>] <author>/<name>@<version> | <author>/<name> | <name> [version]",
        "peek --rgx <re> [version]",
        "peek --type <agentsmd|agmd> <id> [version]",
      ],
      details: [
        "<author>/<name>@<version> or <name>@<version>: exact version detail",
        "<author>/<name> or <name>: resolve the target skill, then show overview",
        "--rgx mode must match exactly one skill",
      ],
    },
  },
  {
    create: () => new GetCommand(),
    help: {
      name: "get",
      summary: "Install skill or AGENTS.md into the selected local repository",
      usage: [
        "get [--type <skill|agentsmd|agmd>] <author>/<name>@<version> | <author>/<name> | <name> [--global] [--wrap]",
        "get --rgx <pattern> [version] [--global] [--wrap]",
        "get --type <agentsmd|agmd> <agentsmd-id> [version] [--global]",
      ],
      details: [
        "Default mode installs skill and dependencies to local partial repository",
        "<author>/<name>@<version> or <name>@<version>: exact match",
        "<author>/<name> or <name>: interactive selection if multiple versions found",
        "Default target: <cwd>/.{tool}/skills/, --global target: ~/.{tool}/skills/",
        "--wrap installs only the root skill and keeps dependencies queryable via `skr deps`",
        "When existing local skill files would be overwritten, `get` shows an interactive confirmation in TTY; non-TTY sessions fail instead of silently overwriting",
        "--rgx mode installs by regex pattern and must match exactly one skill",
        "--type <agentsmd|agmd> installs AGENTS.md to <cwd>/.{tool}/AGENTS.md or ~/.{tool}/AGENTS.md",
      ],
    },
  },
  {
    create: () => new DepsCommand(),
    help: {
      name: "deps",
      summary: "Inspect or install wrapped skill dependencies",
      usage: [
        "deps --brief <rootSkillDir>",
        "deps --content <rootSkillDir> <depSkillID|author/name@version|author/name|name>",
        "deps --tree <rootSkillDir> <depSkillID|author/name@version|author/name|name>",
        "deps --install <rootSkillDir> <depSkillID|author/name@version|author/name|name> [--global]",
      ],
      details: [
        "--brief lists all descendant dependency skill IDs and descriptions",
        "--content prints the target dependency's SKILL.md content",
        "--tree shows the target dependency's file list",
        "--install places the selected dependency subtree next to the wrapped root or into ~/.{tool}/skills/",
        "Existing local dependency versions also require interactive overwrite confirmation; non-TTY sessions fail instead of silently overwriting",
      ],
    },
  },
  {
    create: () => new RemoveCommand(),
    help: {
      name: "remove",
      summary: "Remove local installed skills",
      usage: ["remove <skillID|author/name|name> [--global] [--deps]"],
      details: [
        "Default mode removes from every configured workspace tool skill root; --global removes from every configured global skill root",
        "<skillID>: exact local target, no interactive selector",
        "<author>/<name> or <name>: interactive multi-select when multiple installed candidates match",
        "--deps recursively removes the target subtree, but keeps shared dependencies still referenced elsewhere",
      ],
    },
  },
  {
    create: () => new ValidateCommand(),
    help: {
      name: "validate",
      summary: "Validate a version",
      usage: ["validate <skillID> <version>"],
    },
  },
  {
    create: () => new PublishCommand(),
    help: {
      name: "publish",
      summary: "Publish skill or AGENTS.md",
      usage: [
        "publish [--type <skill|agentsmd|agmd>] --file <request.json|AGENTS.md> [--force|-f]",
        "publish --skill <SKILL.md> [--skill-id <id>] [--version <v>] [--force|-f]",
        "publish --dir <skillDir> [--skill-id <id>] [--version <v>] [--force|-f]",
        "publish <path...> [--all] [--skill-id <id>] [--version <v>] [--force|-f]",
        "publish --type <agentsmd|agmd> --file <AGENTS.md> --agentsmd-id <id> --version <v>",
        "publish --type <agentsmd|agmd> --dir <dir>",
      ],
      details: [
        "--skill uses explicit SKILL.md mode and reads version from frontmatter metadata.version",
        "--dir uses explicit skill directory mode and reads version from <dir>/SKILL.md frontmatter metadata.version",
        "Positional publish auto-detects each path as SKILL.md -> dir -> JSON fallback",
        "Use --force/-f to overwrite an existing skill version",
        "--type <agentsmd|agmd> publishes AGENTS.md via /api/v1/agentsmd",
      ],
    },
  },
  {
    create: () => new UpdateCommand(),
    help: {
      name: "update",
      summary: "Publish a new version for an existing remote skill",
      usage: ["update <skillRef> <newSkillDir>"],
      details: [
        "<skillRef> supports skillID | name | author/name; ambiguous matches reuse the shared selector",
        "Queries remote maxVersion, prompts with a greater suggested version",
        "Writes metadata.version back to <newSkillDir>/SKILL.md before publish",
      ],
    },
  },
  {
    create: () => new CreateCommand(),
    help: {
      name: "create",
      summary: "Deprecated alias of publish",
      usage: ["create ... [--type <skill|agentsmd|agmd>] [--force|-f]"],
    },
  },
  {
    create: () => new BuildCommand(),
    help: {
      name: "build",
      summary: "Build dependency files for a skill workspace",
      usage: ["build <skillName> [refSkill...] [--all]"],
      details: [
        "Builds dependency files, scans current skill dirs with --all, initializes missing target interactively",
      ],
    },
  },
  {
    create: () => new DeleteCommand(),
    help: {
      name: "delete",
      summary: "Delete skill or AGENTS.md version",
      usage: ["delete [--type <skill|agentsmd|agmd>] <resourceID> <version>"],
    },
  },
  {
    create: () => new FormatCommand(),
    help: {
      name: "format",
      summary: "Interactive format for metadata.version/metadata.author",
      usage: ["format [skillDir...]", "format --all"],
      details: ["--all formats all skill dirs under current directory"],
    },
  },
];

export function getHelpEntries(): HelpEntry[] {
  return [...STATIC_HELP_ENTRIES, ...COMMAND_DEFINITIONS.map((definition) => definition.help)];
}

export function getHelpEntry(name: string): HelpEntry | undefined {
  return getHelpEntries().find((entry) => entry.name === name);
}
