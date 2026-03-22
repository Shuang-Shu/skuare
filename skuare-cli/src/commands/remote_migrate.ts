import type { JsonValue, SkuareConfig } from "../types";
import { BaseCommand } from "./base";
import type { CommandContext } from "./types";
import { DomainError, isDomainError } from "../domain/errors";
import { getRegistryBackend } from "../registry/factory";
import type { RegistryBackend } from "../registry/backend";
import type { RegistryFile, RegistrySkillDetail } from "../registry/types";
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
    const summary: MigrationSummary = {
      source,
      destination,
      type: parsed.type,
      dry_run: parsed.dryRun,
      skip_existing: parsed.skipExisting,
      plan: [],
      migrated: [],
      skipped: [],
    };

    if (parsed.type === "all" || parsed.type === "skill") {
      await this.migrateSkills(sourceBackend, destinationBackend, context, parsed, summary);
    }
    if (parsed.type === "all" || parsed.type === "agentsmd") {
      await this.migrateAgentsMD(sourceBackend, destinationBackend, context, parsed, summary);
    }

    console.log(JSON.stringify(summary, null, 2));
  }

  private async migrateSkills(
    sourceBackend: RegistryBackend,
    destinationBackend: RegistryBackend,
    context: CommandContext,
    parsed: ParsedMigrateArgs,
    summary: MigrationSummary
  ): Promise<void> {
    const items = await sourceBackend.listSkills();
    for (const item of items) {
      const ref: MigrationResourceRef = { type: "skill", skill_id: item.skill_id, version: item.version };
      summary.plan.push(ref);
      if (parsed.dryRun) {
        continue;
      }

      const detail = await sourceBackend.getSkillVersion(item.skill_id, item.version);
      try {
        await destinationBackend.publishSkill({
          body: buildSkillMigrateBody(detail),
          auth: context.auth,
        });
        summary.migrated.push(ref);
      } catch (err) {
        if (parsed.skipExisting && isAlreadyExistsError(err)) {
          summary.skipped.push({ ...ref, reason: "already_exists" });
          continue;
        }
        throw err;
      }
    }
  }

  private async migrateAgentsMD(
    sourceBackend: RegistryBackend,
    destinationBackend: RegistryBackend,
    context: CommandContext,
    parsed: ParsedMigrateArgs,
    summary: MigrationSummary
  ): Promise<void> {
    const items = await sourceBackend.listAgentsMD();
    for (const item of items) {
      const ref: MigrationResourceRef = { type: "agentsmd", agentsmd_id: item.agentsmd_id, version: item.version };
      summary.plan.push(ref);
      if (parsed.dryRun) {
        continue;
      }

      const detail = await sourceBackend.getAgentsMDVersion(item.agentsmd_id, item.version);
      try {
        await destinationBackend.publishAgentsMD({
          agentsmdID: detail.agentsmd_id,
          version: detail.version,
          content: detail.content,
          auth: context.auth,
        });
        summary.migrated.push(ref);
      } catch (err) {
        if (parsed.skipExisting && isAlreadyExistsError(err)) {
          summary.skipped.push({ ...ref, reason: "already_exists" });
          continue;
        }
        throw err;
      }
    }
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

function buildSkillMigrateBody(detail: RegistrySkillDetail): JsonValue {
  return {
    skill_id: detail.skill_id,
    version: detail.version,
    files: detail.files.map(toJsonFileBody),
  } satisfies JsonValue;
}

function toJsonFileBody(file: RegistryFile): JsonValue {
  return {
    path: file.path,
    content: file.content,
    ...(file.encoding ? { encoding: file.encoding } : {}),
  } satisfies JsonValue;
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

function isAlreadyExistsError(err: unknown): boolean {
  if (isDomainError(err)) {
    const code = String(err.code || "");
    if (code.includes("ALREADY_EXISTS")) {
      return true;
    }
    const status = extractStatus(err.details);
    return status === 409;
  }
  const message = err instanceof Error ? err.message : String(err);
  return /already exists/i.test(message) || /\b409\b/.test(message);
}

function extractStatus(details: unknown): number | undefined {
  if (!details || typeof details !== "object" || Array.isArray(details)) {
    return undefined;
  }
  const status = (details as { status?: unknown }).status;
  return typeof status === "number" ? status : undefined;
}
