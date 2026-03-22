import { dirname } from "node:path";
import { mkdir } from "node:fs/promises";
import { BaseCommand } from "./base";
import type { CommandContext } from "./types";
import type { HelpEntry } from "./catalog";
import { DomainError } from "../domain/errors";
import { loadConfig, writeConfig } from "../config/loader";
import { mergeConfig } from "../config/merger";
import { normalizeRemoteSourceUrl, normalizeSourceName } from "../config/sources";
import { findNearestWorkspaceConfig, getGlobalConfigPath, getWorkspaceConfigPath } from "../config/resolver";
import { createDefaultConfig, type RemoteSourceKind, type SkuareConfig } from "../types";

export const REMOTE_SOURCE_HELP_ENTRY: HelpEntry = {
  name: "remote-source",
  summary: "Manage named remote registry sources",
  usage: [
    "remote source list [--global]",
    "remote source add [--global] <originName> [--git|--svc] <remoteUrl>",
    "remote source remove [--global] <originName>",
    "remote source use [--global] <originName>",
  ],
  details: [
    "--global writes ~/.skuare/config.json; default writes the nearest workspace config or creates <cwd>/.skuare/config.json",
    "--git only accepts SSH URLs and stores them as git+ssh://...",
    "--svc accepts http:// or https:// registry URLs",
  ],
};

type SourceConfigScope = "global" | "workspace";

type SourceCommandTarget = {
  scope: SourceConfigScope;
  path: string;
  globalConfig: Partial<SkuareConfig> | undefined;
  targetConfig: Partial<SkuareConfig> | undefined;
  mergedConfig: SkuareConfig;
};

export class RemoteSourceCommand extends BaseCommand {
  readonly name = "source";
  readonly description = "Manage named remote registry sources";

  async execute(context: CommandContext): Promise<void> {
    const [subcommand, ...rest] = context.args;
    if (!subcommand || subcommand === "help" || subcommand === "--help" || subcommand === "-h") {
      console.log(renderRemoteSourceHelp());
      return;
    }

    const nextContext = { ...context, args: rest };
    switch (subcommand) {
      case "list":
        await new ListRemoteSourcesCommand().execute(nextContext);
        return;
      case "add":
        await new AddRemoteSourceCommand().execute(nextContext);
        return;
      case "remove":
        await new RemoveRemoteSourceCommand().execute(nextContext);
        return;
      case "use":
        await new UseRemoteSourceCommand().execute(nextContext);
        return;
      default:
        this.fail("Unknown remote source subcommand: " + subcommand + ". Supported: list, add, remove, use");
    }
  }
}

export class ListRemoteSourcesCommand extends BaseCommand {
  readonly name = "list";
  readonly description = "List named remote registry sources";

  async execute(context: CommandContext): Promise<void> {
    const isGlobal = context.args.includes("--global");
    const positional = context.args.filter((arg) => arg !== "--global");
    if (positional.length > 0) {
      this.fail("Usage: skuare remote source list [--global]");
    }

    const target = await loadTargetConfig(context.cwd, isGlobal);
    const sources = isGlobal
      ? mergeConfig(createDefaultConfig(), target.globalConfig).remote.sources || {}
      : target.mergedConfig.remote.sources || {};
    const defaultSource = isGlobal
      ? mergeConfig(createDefaultConfig(), target.globalConfig).remote.defaultSource || ""
      : target.mergedConfig.remote.defaultSource || "";

    console.log(JSON.stringify({
      scope: target.scope,
      path: target.path,
      default_source: defaultSource || undefined,
      sources: Object.entries(sources)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([name, source]) => ({
          name,
          kind: source.kind,
          url: source.url,
          current: name === defaultSource,
        })),
    }, null, 2));
  }
}

class AddRemoteSourceCommand extends BaseCommand {
  readonly name = "add";
  readonly description = "Add a named remote registry source";

  async execute(context: CommandContext): Promise<void> {
    const { isGlobal, positional, kind } = parseAddSourceArgs(context.args);
    const [originNameRaw, remoteUrlRaw] = positional;
    const originName = normalizeSourceName(originNameRaw);
    if (!originName) {
      this.fail("Remote source name cannot be empty");
    }

    const target = await loadTargetConfig(context.cwd, isGlobal);
    const next = mergeConfig(createDefaultConfig(), target.targetConfig);
    const sources = { ...(next.remote.sources || {}) };
    if (sources[originName]) {
      this.fail(`Remote source already exists in ${target.scope} config: ${originName}`);
    }

    sources[originName] = {
      kind,
      url: normalizeRemoteSourceUrl(kind, remoteUrlRaw),
    };
    next.remote.sources = sources;
    if (!next.remote.defaultSource) {
      next.remote.defaultSource = originName;
    }

    await persistTargetConfig(target.path, next);
    console.log(JSON.stringify({
      action: "add",
      scope: target.scope,
      path: target.path,
      source: {
        name: originName,
        kind,
        url: sources[originName].url,
      },
      default_source: next.remote.defaultSource,
    }, null, 2));
  }
}

class RemoveRemoteSourceCommand extends BaseCommand {
  readonly name = "remove";
  readonly description = "Remove a named remote registry source";

  async execute(context: CommandContext): Promise<void> {
    const { isGlobal, positional } = parseScopedSourceArgs(
      context.args,
      "Usage: skuare remote source remove [--global] <originName>",
      1
    );
    const [originNameRaw] = positional;
    const originName = normalizeSourceName(originNameRaw);
    const target = await loadTargetConfig(context.cwd, isGlobal);
    const next = mergeConfig(createDefaultConfig(), target.targetConfig);
    const sources = { ...(next.remote.sources || {}) };
    if (!sources[originName]) {
      this.fail(`Remote source not found in ${target.scope} config: ${originName}`);
    }

    delete sources[originName];
    next.remote.sources = sources;
    if (next.remote.defaultSource === originName) {
      next.remote.defaultSource = Object.keys(sources).sort((left, right) => left.localeCompare(right))[0] || undefined;
    }

    await persistTargetConfig(target.path, next);
    console.log(JSON.stringify({
      action: "remove",
      scope: target.scope,
      path: target.path,
      removed: originName,
      default_source: next.remote.defaultSource,
    }, null, 2));
  }
}

class UseRemoteSourceCommand extends BaseCommand {
  readonly name = "use";
  readonly description = "Set the default remote registry source";

  async execute(context: CommandContext): Promise<void> {
    const { isGlobal, positional } = parseScopedSourceArgs(
      context.args,
      "Usage: skuare remote source use [--global] <originName>",
      1
    );
    const [originNameRaw] = positional;
    const originName = normalizeSourceName(originNameRaw);
    const target = await loadTargetConfig(context.cwd, isGlobal);
    const availableSources = isGlobal
      ? mergeConfig(createDefaultConfig(), target.globalConfig).remote.sources || {}
      : target.mergedConfig.remote.sources || {};
    if (!availableSources[originName]) {
      this.fail(`Remote source not found in available ${target.scope} sources: ${originName}`);
    }

    const next = mergeConfig(createDefaultConfig(), target.targetConfig);
    next.remote.defaultSource = originName;
    await persistTargetConfig(target.path, next);
    console.log(JSON.stringify({
      action: "use",
      scope: target.scope,
      path: target.path,
      default_source: originName,
      source: availableSources[originName],
    }, null, 2));
  }
}

function renderRemoteSourceHelp(): string {
  const lines = [
    "remote source",
    "",
    "Manage named remote registry sources",
    "",
    "Usage:",
    ...REMOTE_SOURCE_HELP_ENTRY.usage.map((usageLine) => `  skuare ${usageLine}`),
    ...REMOTE_SOURCE_HELP_ENTRY.usage.map((usageLine) => `  skr ${usageLine}`),
    "",
    "Details:",
    ...REMOTE_SOURCE_HELP_ENTRY.details!.map((detail) => `  ${detail}`),
  ];
  return lines.join("\n");
}

async function loadTargetConfig(cwd: string, isGlobal: boolean): Promise<SourceCommandTarget> {
  const globalPath = getGlobalConfigPath();
  const globalConfig = await loadConfig(globalPath);
  if (isGlobal) {
    return {
      scope: "global",
      path: globalPath,
      globalConfig,
      targetConfig: globalConfig,
      mergedConfig: mergeConfig(createDefaultConfig(), globalConfig),
    };
  }

  const workspaceFound = await findNearestWorkspaceConfig(cwd);
  const path = workspaceFound?.path || getWorkspaceConfigPath(cwd);
  const targetConfig = workspaceFound?.config;
  return {
    scope: "workspace",
    path,
    globalConfig,
    targetConfig,
    mergedConfig: mergeConfig(createDefaultConfig(), globalConfig, targetConfig),
  };
}

async function persistTargetConfig(path: string, config: SkuareConfig): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeConfig(path, config);
}

function parseAddSourceArgs(
  args: string[]
): { isGlobal: boolean; kind: RemoteSourceKind; positional: [string, string] } {
  const usage = "Usage: skuare remote source add [--global] <originName> [--git|--svc] <remoteUrl>";
  const isGlobal = args.includes("--global");
  const isGit = args.includes("--git");
  const isSvc = args.includes("--svc");
  if (isGit && isSvc) {
    throw new DomainError("CLI_INVALID_ARGUMENT", usage);
  }
  if (isGit === isSvc) {
    throw new DomainError("CLI_INVALID_ARGUMENT", usage);
  }

  const positional = args.filter((arg) => arg !== "--global" && arg !== "--git" && arg !== "--svc");
  if (positional.length !== 2) {
    throw new DomainError("CLI_INVALID_ARGUMENT", usage);
  }
  return {
    isGlobal,
    kind: isGit ? "git" : "svc",
    positional: [positional[0], positional[1]],
  };
}

function parseScopedSourceArgs(
  args: string[],
  usage: string,
  expectedPositionals: number
): { isGlobal: boolean; positional: string[] } {
  const isGlobal = args.includes("--global");
  if (args.includes("--git") || args.includes("--svc")) {
    throw new DomainError("CLI_INVALID_ARGUMENT", usage);
  }

  const positional = args.filter((arg) => arg !== "--global");
  if (positional.length !== expectedPositionals) {
    throw new DomainError("CLI_INVALID_ARGUMENT", usage);
  }
  return { isGlobal, positional };
}
