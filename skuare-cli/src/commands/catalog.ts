import type { Command } from "./types";
import { HealthCommand } from "./admin";
import { InitCommand } from "./init";
import { DetailCommand, GetCommand, ListCommand, PeekCommand, ValidateCommand } from "./query";
import { BuildCommand, CreateCommand, DeleteCommand, FormatCommand, PublishCommand } from "./write";
import {
  PublishAgentsMDCommand,
  PublishAgentsMDShortCommand,
  ListAgentsMDCommand,
  ListAgentsMDShortCommand,
  PeekAgentsMDCommand,
  PeekAgentsMDShortCommand,
  GetAgentsMDCommand,
  GetAgentsMDShortCommand,
  DetailAgentsMDCommand,
  DetailAgentsMDShortCommand,
  DeleteAgentsMDCommand,
  DeleteAgentsMDShortCommand,
} from "./agentsmd";

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
    create: () => new HealthCommand(),
    help: { usage: ["health", "Health check (GET /healthz)"] },
  },
  {
    create: () => new DetailCommand(),
    help: { usage: ["detail <skillName|skillID> [relativePath...]", "Show local skill file contents"] },
  },
  {
    create: () => new ListCommand(),
    help: { usage: ["list [--q <keyword>] [--rgx <re>]", "List skills (GET /api/v1/skills)"] },
  },
  {
    create: () => new PeekCommand(),
    help: {
      usage: ["peek <skillID> [version]", "Peek skill overview/detail"],
      details: ["peek --rgx <re> [version]            Peek by regex (must match exactly one skill)"],
    },
  },
  {
    create: () => new GetCommand(),
    help: {
      usage: ["get <author>/<name>@<version> | <author>/<name> | <name> [--global]", ""],
      details: [
        "                                       Install skill and dependencies to local partial repository",
        "                                       - <author>/<name>@<version> or <name>@<version>: exact match",
        "                                       - <author>/<name> or <name>: interactive selection if multiple versions found",
        "                                       - Default: <cwd>/.{tool}/skills/, --global: ~/.{tool}/skills/",
        "get --rgx <pattern> [version] [--global]",
        "                                       Install by regex pattern (must match exactly one skill)",
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
      usage: ["publish --file <request.json> [--force|-f]", "Publish from request JSON"],
      details: [
        "publish --skill <SKILL.md> [--skill-id <id>] [--version <v>] [--force|-f]",
        "                                       Explicit SKILL.md mode, version from frontmatter metadata.version",
        "publish --dir <skillDir> [--skill-id <id>] [--version <v>] [--force|-f]",
        "                                       Explicit dir mode, version from <dir>/SKILL.md frontmatter metadata.version",
        "publish <path...> [--all] [--skill-id <id>] [--version <v>] [--force|-f]",
        "                                       Auto detect each path: SKILL.md -> dir -> JSON fallback",
        "                                       Use --force/-f to overwrite an existing skill version",
      ],
    },
  },
  {
    create: () => new CreateCommand(),
    help: { usage: ["create ... [--force|-f]", "Deprecated alias of publish"] },
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
    help: { usage: ["delete <skillID> <version>", "Delete skill version"] },
  },
  {
    create: () => new FormatCommand(),
    help: {
      usage: ["format [skillDir...]", "Interactive format for metadata.version/metadata.author"],
      details: ["format --all                         Format all skill dirs under current directory"],
    },
  },
  // AgentsMD commands
  {
    create: () => new PublishAgentsMDCommand(),
    help: {
      usage: ["publish-agentsmd --file <AGENTS.md> --agentsmd-id <id> --version <v>", ""],
      details: [
        "publish-agentsmd --dir <dir>         Publish from dir (auto-find AGENTS.md + agentsmd-meta.json)",
        "publish-agmd ...                     Short alias for publish-agentsmd",
      ],
    },
  },
  {
    create: () => new PublishAgentsMDShortCommand(),
    help: { usage: ["publish-agmd ...", "Short alias for publish-agentsmd"] },
  },
  {
    create: () => new ListAgentsMDCommand(),
    help: { usage: ["list-agentsmd [--q <keyword>] [--rgx <pattern>]", "List AGENTS.md"] },
  },
  {
    create: () => new ListAgentsMDShortCommand(),
    help: { usage: ["list-agmd [--q <keyword>] [--rgx <pattern>]", "Short alias for list-agentsmd"] },
  },
  {
    create: () => new PeekAgentsMDCommand(),
    help: { usage: ["peek-agentsmd <agentsmd-id> [version]", "Peek AGENTS.md overview/detail"] },
  },
  {
    create: () => new PeekAgentsMDShortCommand(),
    help: { usage: ["peek-agmd ...", "Short alias for peek-agentsmd"] },
  },
  {
    create: () => new GetAgentsMDCommand(),
    help: { usage: ["get-agentsmd <agentsmd-id> [version] [--global]", "Install AGENTS.md"] },
  },
  {
    create: () => new GetAgentsMDShortCommand(),
    help: { usage: ["get-agmd ...", "Short alias for get-agentsmd"] },
  },
  {
    create: () => new DetailAgentsMDCommand(),
    help: { usage: ["detail-agentsmd <agentsmdName>", "Show local AGENTS.md content"] },
  },
  {
    create: () => new DetailAgentsMDShortCommand(),
    help: { usage: ["detail-agmd ...", "Short alias for detail-agentsmd"] },
  },
  {
    create: () => new DeleteAgentsMDCommand(),
    help: { usage: ["delete-agentsmd <agentsmd-id> <version>", "Delete AGENTS.md version"] },
  },
  {
    create: () => new DeleteAgentsMDShortCommand(),
    help: { usage: ["delete-agmd ...", "Short alias for delete-agentsmd"] },
  },
];

export function getHelpEntries(): HelpEntry[] {
  return [...STATIC_HELP_ENTRIES, ...COMMAND_DEFINITIONS.map((definition) => definition.help)];
}
