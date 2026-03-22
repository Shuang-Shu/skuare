import type { SkuareConfig } from "../types";
import { BaseCommand } from "./base";
import type { CommandContext } from "./types";
import { DomainError } from "../domain/errors";
import { getRegistryBackend } from "../registry/factory";
import type { RegistryBackend } from "../registry/backend";
import type { RegistryImportResult, RegistryMigrationBundle, RegistryMigrationRef } from "../registry/types";
import { getGlobalConfigPath, getWorkspaceConfigPath } from "../config/resolver";
import { loadConfig } from "../config/loader";
import { mergeConfig } from "../config/merger";
import { normalizeSourceName } from "../config/sources";
import { isGitRegistryServer } from "../registry/git_backend";

type MigrateResourceType = "skill" | "agentsmd" | "all";

type MigrationResourceRef =
  | { type: "skill"; skill_id: string; version: string }
  | { type: "agentsmd"; agentsmd_id: string; version: string };

type MigrationSummary = {
  source: string;
  destination: string;
  type: MigrateResourceType;
  dry_run: boolean;
  skip_existing: boolean;
  plan: MigrationResourceRef[];
  migrated: MigrationResourceRef[];
  skipped: Array<MigrationResourceRef & { reason: string }>;
};

type BackendResolver = (server: string) => Promise<RegistryBackend>;
type SourceResolver = (cwd: string, token: string) => Promise<string>;

export class RemoteMigrateCommand extends BaseCommand {
  readonly name = "migrate";
  readonly description = "Migrate remote resources from one registry to another";

  constructor(
    private readonly backendResolver: BackendResolver = getRegistryBackend,
    private readonly sourceResolver: SourceResolver = resolveRemoteEndpoint
  ) {
    super();
  }

  async execute(context: CommandContext): Promise<void> {
    const parsed = parseMigrateArgs(context.args);
    const source = await this.sourceResolver(context.cwd, parsed.sourceToken);
    const destination = await this.sourceResolver(context.cwd, parsed.destinationToken);

    if (source === destination) {
      this.fail("Source and destination must be different");
    }

    const sourceBackend = await this.backendResolver(source);
    const destinationBackend = await this.backendResolver(destination);
    const exported = await sourceBackend.exportResources(parsed.type);
    const plan = buildPlan(exported);
    const summary: MigrationSummary = {
      source,
      destination,
      type: parsed.type,
      dry_run: parsed.dryRun,
      skip_existing: parsed.skipExisting,
      plan,
      migrated: [],
      skipped: [],
    };

    if (!parsed.dryRun) {
      const result = await destinationBackend.importResources(exported, {
        auth: context.auth,
        skipExisting: parsed.skipExisting,
      });
      summary.migrated = result.imported;
      summary.skipped = result.skipped;
    }

    console.log(JSON.stringify(summary, null, 2));
  }
}

type ParsedMigrateArgs = {
  sourceToken: string;
  destinationToken: string;
  type: MigrateResourceType;
  dryRun: boolean;
  skipExisting: boolean;
};

function parseMigrateArgs(args: string[]): ParsedMigrateArgs {
  const usage = "Usage: skuare remote migrate <src> <dst> [--type <skill|agentsmd|agmd>] [--dry-run] [--skip-existing]";
  const positional: string[] = [];
  let type: MigrateResourceType = "all";
  let dryRun = false;
  let skipExisting = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (arg === "--skip-existing") {
      skipExisting = true;
      continue;
    }
    if (arg === "--type") {
      const next = args[index + 1];
      if (!next) {
        throw new DomainError("CLI_INVALID_ARGUMENT", usage);
      }
      type = parseMigrateType(next);
      index += 1;
      continue;
    }
    if (arg.startsWith("--")) {
      throw new DomainError("CLI_INVALID_ARGUMENT", usage);
    }
    positional.push(arg);
  }

  if (positional.length !== 2) {
    throw new DomainError("CLI_INVALID_ARGUMENT", usage);
  }

  return {
    sourceToken: positional[0],
    destinationToken: positional[1],
    type,
    dryRun,
    skipExisting,
  };
}

function parseMigrateType(input: string): MigrateResourceType {
  const normalized = input.trim().toLowerCase();
  if (normalized === "skill") {
    return "skill";
  }
  if (normalized === "agentsmd" || normalized === "agmd") {
    return "agentsmd";
  }
  if (normalized === "all") {
    return "all";
  }
  throw new DomainError("CLI_INVALID_ARGUMENT", `Invalid value for --type: ${input}. Expected one of: all, skill, agentsmd, agmd`);
}

async function resolveRemoteEndpoint(cwd: string, token: string): Promise<string> {
  const trimmed = String(token || "").trim();
  if (!trimmed) {
    throw new DomainError("CLI_INVALID_ARGUMENT", "Remote endpoint cannot be empty");
  }

  const merged = await loadMergedConfig(cwd);
  const sourceName = normalizeSourceName(trimmed);
  const source = merged.remote.sources?.[sourceName];
  if (source?.url) {
    return source.url;
  }

  if (looksLikeDirectServer(trimmed)) {
    return trimmed.replace(/\/+$/, "");
  }

  throw new DomainError("CLI_INVALID_ARGUMENT", `Unknown remote source or server URL: ${trimmed}`);
}

async function loadMergedConfig(cwd: string): Promise<SkuareConfig> {
  const globalCfg = await loadConfig(getGlobalConfigPath());
  const workspaceCfg = await loadConfig(getWorkspaceConfigPath(cwd));
  return mergeConfig(globalCfg, workspaceCfg);
}

function looksLikeDirectServer(value: string): boolean {
  return /^https?:\/\//i.test(value) || isGitRegistryServer(value);
}

function buildPlan(bundle: RegistryMigrationBundle): MigrationSummary["plan"] {
  return [
    ...bundle.skills.map((item) => ({ type: "skill", skill_id: item.skill_id, version: item.version }) satisfies RegistryMigrationRef),
    ...bundle.agentsmd.map((item) => ({ type: "agentsmd", agentsmd_id: item.agentsmd_id, version: item.version }) satisfies RegistryMigrationRef),
  ];
}
