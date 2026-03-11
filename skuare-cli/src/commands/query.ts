/**
 * 技能查询命令（读操作）
 */

import type { CommandContext } from "./types";
import { BaseCommand } from "./base";
import { callApi } from "../http/client";
import type { JsonValue } from "./types";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { resolveToolSkillsDir } from "../config/resolver";
import { collectPositionalArgs, parseRegexOption, stripRegexOptions } from "../utils/command_args";
import { resolveInstallTargetRoot, resolvePrimaryTool } from "../utils/install_paths";
import { parseSkillFrontmatter } from "../utils/skill_manifest";
import { compareVersions } from "../utils/versioning";
import { DetailAgentsMDCommand, GetAgentsMDCommand, ListAgentsMDCommand, PeekAgentsMDCommand } from "./agentsmd";
import { normalizeResourceContext } from "./resource_type";

type RemoteFile = { path: string; content: string };
type InstallResult = { skills: string[]; conflictFiles: string[] };
type InstallTargetPlan = { targetRoot: string; tools: string[] };
type NormalizedSkillItem = {
  id: string;
  name: string;
  author: string;
  skill_id: JsonValue;
  version: JsonValue;
  description: JsonValue;
};
type ParsedSkillSelectorInput =
  | { type: "author-name"; author: string; name: string; version?: string }
  | { type: "name-only"; name: string; version?: string };
type SkillSelectionCandidate = {
  skillID: string;
  version: string;
  name: string;
  author: string;
  description: string;
};
type SkillCandidateResolutionOptions = {
  allowMissingFallback?: boolean;
  matchVersion?: boolean;
  notFoundMessage: (input: string) => string;
  selectionTitle: string;
};
type DependencyRef = {
  skillID: string;
  version: string;
  requestedVersion: string;
  alias?: string;
};
type SkillGraphNode = {
  skillID: string;
  version: string;
  description: string;
  files: RemoteFile[];
  dependencies: DependencyRef[];
};
type DependencyGraph = {
  root: SkillGraphNode;
  nodes: Map<string, SkillGraphNode>;
};
type DependencyCycleContext = {
  cyclePath: string[];
  skillID: string;
  version: string;
};
type WrapMetadata = {
  version: 1;
  mode: "wrap";
  tool: string;
  root_skill_id: string;
  root_version: string;
  install_root: string;
  global: boolean;
};
type LocalRootDescriptor = {
  rootDir: string;
  rootSkillID: string;
  rootVersion: string;
  description: string;
  tool?: string;
  installRoot: string;
  metadata?: WrapMetadata;
  files: RemoteFile[];
  dependencies: DependencyRef[];
};
type LocalInstalledSkill = {
  skillID: string;
  version: string;
  dir: string;
  dependencies: DependencyRef[];
};
type LocalInstallState = {
  skills: Map<string, LocalInstalledSkill>;
  rootConsumersBySkillID: Map<string, string[]>;
};
type InstallNodeStatus = "new" | "unchanged" | "overwrite-version" | "overwrite-content";
type InstallNodePreview = {
  skillID: string;
  version: string;
  role: "root" | "dependency";
  status: InstallNodeStatus;
  localVersion?: string;
  changedFiles: string[];
  addedFiles: string[];
  sharedWith: string[];
};
type InstallTargetPreview = {
  targetRoot: string;
  tools: string[];
  rootSkillID: string;
  nodes: InstallNodePreview[];
  requiresConfirmation: boolean;
  summary: {
    newSkills: number;
    unchangedSkills: number;
    overwriteSkills: number;
    sharedSkills: number;
  };
};

const WRAP_METADATA_FILE = ".skuare-wrap.json";

function normalizePath(input: string): string {
  return input.replace(/\\/g, "/").replace(/^\.\/+/, "");
}

function formatNodeKey(skillID: string, version: string): string {
  return `${skillID}@${version}`;
}

function parseSkillIDParts(skillID: string): { authorFromID: string; nameFromID: string } {
  const trimmed = skillID.trim();
  if (!trimmed) {
    return { authorFromID: "", nameFromID: "" };
  }
  const idx = trimmed.indexOf("/");
  if (idx <= 0 || idx >= trimmed.length - 1 || trimmed.indexOf("/", idx + 1) >= 0) {
    return { authorFromID: "", nameFromID: trimmed };
  }
  return {
    authorFromID: trimmed.slice(0, idx).trim(),
    nameFromID: trimmed.slice(idx + 1).trim(),
  };
}

function parseMetadataAuthorFromSkillFiles(filesValue: JsonValue | undefined): string {
  if (!Array.isArray(filesValue)) {
    return "";
  }
  for (const row of filesValue) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      continue;
    }
    const file = row as Record<string, JsonValue>;
    const path = normalizePath(String(file.path || "").trim());
    if (path !== "SKILL.md") {
      continue;
    }
    return parseSkillFrontmatter(String(file.content || "")).metadataAuthor;
  }
  return "";
}

function parseSkillIdentityFromRemoteFiles(files: RemoteFile[]): { name: string; author: string } {
  const skillFile = files.find((file) => normalizePath(file.path) === "SKILL.md");
  if (!skillFile) {
    return { name: "", author: "" };
  }
  const parsed = parseSkillFrontmatter(skillFile.content);
  return {
    name: parsed.name,
    author: parsed.metadataAuthor,
  };
}

function buildDisplayIdentity(input: {
  skillID: string;
  name?: string;
  author?: string;
  version?: string;
}): { id: string; name: string; author: string } {
  const skillID = input.skillID.trim();
  const parsed = parseSkillIDParts(skillID);
  const name = (input.name || "").trim() || parsed.nameFromID || skillID || "unknown";
  const author = (input.author || "").trim() || parsed.authorFromID || "undefined";
  const version = (input.version || "").trim();
  const id = version ? `${author}/${name}@${version}` : `${author}/${name}`;
  return { id, name, author };
}

function normalizeListItems(items: JsonValue[]): NormalizedSkillItem[] {
  return items
    .filter((x): x is Record<string, JsonValue> => !!x && typeof x === "object" && !Array.isArray(x))
    .map((x) => {
      const skillID = String(x.skill_id || "").trim();
      const version = String(x.version || "").trim();
      const nameRaw = String(x.name || "").trim();
      const authorRaw = String(x.author || "").trim();
      const display = buildDisplayIdentity({
        skillID,
        version,
        name: nameRaw,
        author: authorRaw,
      });
      return {
        id: display.id,
        name: display.name,
        author: display.author,
        skill_id: x.skill_id,
        version: x.version,
        description: x.description,
      };
    });
}

function isRegexMatch(regex: RegExp, value: string): boolean {
  regex.lastIndex = 0;
  return regex.test(value);
}

function matchesSkill(regex: RegExp, item: NormalizedSkillItem): boolean {
  return [
    String(item.id || ""),
    String(item.skill_id || ""),
    String(item.name || ""),
    String(item.author || ""),
    String(item.description || ""),
  ].some((v) => isRegexMatch(regex, v));
}

function resolveDetailTarget(rootDir: string, input: string): { absolutePath: string; displayPath: string } {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("detail path cannot be empty");
  }
  if (isAbsolute(trimmed)) {
    throw new Error(`detail only accepts skill-relative paths: ${input}`);
  }
  const absoluteRoot = resolve(rootDir);
  const absolutePath = resolve(absoluteRoot, trimmed);
  const rel = relative(absoluteRoot, absolutePath);
  if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(`detail path escapes current skill directory: ${input}`);
  }
  return {
    absolutePath,
    displayPath: normalizePath(rel),
  };
}

async function isSkillDir(candidate: string): Promise<boolean> {
  const info = await stat(join(candidate, "SKILL.md")).catch(() => undefined);
  return !!info?.isFile();
}

async function collectSkillDirs(rootDir: string): Promise<string[]> {
  const out: string[] = [];

  async function walk(currentDir: string): Promise<void> {
    if (await isSkillDir(currentDir)) {
      out.push(currentDir);
      return;
    }

    const entries = await readdir(currentDir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      await walk(join(currentDir, entry.name));
    }
  }

  await walk(rootDir);
  return out;
}

function resolveDetailTool(context: CommandContext): string {
  const tool = (context.llmTools || []).map((v) => v.trim()).find(Boolean);
  if (!tool) {
    throw new Error("No llmTools configured. Run `skr init` and select at least one tool");
  }
  return tool;
}

async function resolveDetailSkillDir(context: CommandContext, skillRef: string): Promise<{ skillDir: string; skillID: string; skillsRoot: string }> {
  const trimmed = skillRef.trim();
  if (!trimmed) {
    throw new Error("Usage: skuare detail <skillName|skillID> [relativePath...]");
  }

  const tool = resolveDetailTool(context);
  const skillsRoot = resolveToolSkillsDir(context.cwd, tool, context.toolSkillDirs[tool]);
  const exactDir = resolve(skillsRoot, normalizePath(trimmed));
  if (await isSkillDir(exactDir)) {
    return {
      skillDir: exactDir,
      skillID: normalizePath(relative(skillsRoot, exactDir)),
      skillsRoot,
    };
  }

  const matches = (await collectSkillDirs(skillsRoot))
    .map((skillDir) => ({
      skillDir,
      skillID: normalizePath(relative(skillsRoot, skillDir)),
    }))
    .filter((row) => {
      if (!row.skillID) {
        return false;
      }
      const parts = row.skillID.split("/");
      return parts[parts.length - 1] === trimmed;
    });

  if (matches.length === 1) {
    return { ...matches[0], skillsRoot };
  }
  if (matches.length > 1) {
    const choices = matches
      .map((row) => row.skillID)
      .sort((a, b) => a.localeCompare(b))
      .join(", ");
    throw new Error(`detail skillName matched multiple skills: ${choices}`);
  }

  throw new Error(`detail skill not found in ${skillsRoot}: ${trimmed}`);
}

function parseSkillSelectorInput(input: string): ParsedSkillSelectorInput {
  const trimmed = input.trim();
  const atIndex = trimmed.indexOf("@");

  if (atIndex > 0) {
    const beforeAt = trimmed.slice(0, atIndex);
    const version = trimmed.slice(atIndex + 1).trim();
    const slashIndex = beforeAt.indexOf("/");

    if (slashIndex > 0) {
      return {
        type: "author-name",
        author: beforeAt.slice(0, slashIndex).trim(),
        name: beforeAt.slice(slashIndex + 1).trim(),
        version,
      };
    }

    return {
      type: "name-only",
      name: beforeAt.trim(),
      version,
    };
  }

  const slashIndex = trimmed.indexOf("/");
  if (slashIndex > 0) {
    return {
      type: "author-name",
      author: trimmed.slice(0, slashIndex).trim(),
      name: trimmed.slice(slashIndex + 1).trim(),
    };
  }

  return { type: "name-only", name: trimmed };
}

function withExplicitSelectorVersion(
  input: ParsedSkillSelectorInput,
  explicitVersion?: string
): ParsedSkillSelectorInput {
  if (!explicitVersion) {
    return input;
  }
  if (input.type === "author-name") {
    return { ...input, version: explicitVersion };
  }
  return { ...input, version: explicitVersion };
}

function buildRequestedSkillID(input: ParsedSkillSelectorInput): string {
  return input.type === "author-name" ? `${input.author}/${input.name}` : input.name;
}

function formatParsedSkillSelectorInput(input: ParsedSkillSelectorInput): string {
  const skillID = buildRequestedSkillID(input);
  return input.version ? `${skillID}@${input.version}` : skillID;
}

function matchesSkillSelectorCandidate(
  input: ParsedSkillSelectorInput,
  candidate: SkillSelectionCandidate,
  options: { matchVersion?: boolean }
): boolean {
  if (options.matchVersion && input.version && candidate.version !== input.version) {
    return false;
  }
  if (input.type === "author-name") {
    const requestedSkillID = buildRequestedSkillID(input);
    return candidate.skillID === requestedSkillID || (candidate.author === input.author && candidate.name === input.name);
  }
  return candidate.skillID === input.name || candidate.name === input.name;
}

abstract class SkillCatalogCommand extends BaseCommand {
  protected compileRegex(pattern: string): RegExp {
    try {
      return new RegExp(pattern);
    } catch {
      this.fail(`Invalid regex pattern: ${pattern}`);
    }
  }

  protected async resolveSkillIDByRegex(context: CommandContext, pattern: string): Promise<string> {
    const matched = (await this.loadCatalogItems(context)).filter((item) => matchesSkill(this.compileRegex(pattern), item));
    if (matched.length === 0) {
      this.fail(`No skill matched regex: ${pattern}`);
    }
    if (matched.length > 1) {
      const choices = matched
        .slice(0, 10)
        .map((item) => String(item.id || item.skill_id || "unknown"))
        .join(", ");
      const suffix = matched.length > 10 ? ", ..." : "";
      this.fail(`Regex matched multiple skills (${matched.length}): ${choices}${suffix}`);
    }
    const skillID = String(matched[0].skill_id || "").trim();
    if (!skillID) {
      this.fail(`Matched skill has empty skill_id for regex: ${pattern}`);
    }
    return skillID;
  }

  protected async loadCatalogItems(context: CommandContext): Promise<NormalizedSkillItem[]> {
    const resp = await callApi({
      method: "GET",
      path: "/api/v1/skills",
      server: context.server,
      silent: true,
    });
    const itemsRaw = (resp.data && typeof resp.data === "object" && !Array.isArray(resp.data))
      ? (resp.data as { items?: JsonValue }).items
      : undefined;
    const items = Array.isArray(itemsRaw) ? itemsRaw : [];
    return normalizeListItems(items);
  }

  protected createSkillSelectionCandidate(input: {
    skillID: string;
    version?: string;
    name?: string;
    author?: string;
    description?: string;
  }): SkillSelectionCandidate {
    const display = buildDisplayIdentity({
      skillID: input.skillID,
      version: input.version,
      name: input.name,
      author: input.author,
    });
    return {
      skillID: input.skillID.trim(),
      version: (input.version || "").trim(),
      name: display.name,
      author: display.author,
      description: (input.description || "").trim(),
    };
  }

  protected createCatalogSkillCandidates(
    items: NormalizedSkillItem[],
    options?: { collapseVersions?: boolean }
  ): SkillSelectionCandidate[] {
    const candidates = items.map((item) => this.createSkillSelectionCandidate({
      skillID: String(item.skill_id || "").trim(),
      version: String(item.version || "").trim(),
      name: item.name,
      author: item.author,
      description: String(item.description || "").trim(),
    }));

    if (!options?.collapseVersions) {
      return candidates;
    }

    const latestBySkillID = new Map<string, SkillSelectionCandidate>();
    for (const candidate of candidates) {
      const existing = latestBySkillID.get(candidate.skillID);
      if (!existing || compareVersions(candidate.version, existing.version) > 0) {
        latestBySkillID.set(candidate.skillID, candidate);
      }
    }
    return Array.from(latestBySkillID.values());
  }

  protected async resolveSkillCandidate(
    parsed: ParsedSkillSelectorInput,
    candidates: SkillSelectionCandidate[],
    options: SkillCandidateResolutionOptions
  ): Promise<SkillSelectionCandidate> {
    const matched = this.sortSkillSelectionCandidates(
      candidates.filter((candidate) => matchesSkillSelectorCandidate(parsed, candidate, { matchVersion: options.matchVersion }))
    );

    if (matched.length === 0) {
      if (options.allowMissingFallback) {
        return this.createSkillSelectionCandidate({
          skillID: buildRequestedSkillID(parsed),
          version: parsed.version,
          name: parsed.name,
          author: parsed.type === "author-name" ? parsed.author : "",
        });
      }
      this.fail(options.notFoundMessage(formatParsedSkillSelectorInput(parsed)));
    }
    if (matched.length === 1) {
      return matched[0];
    }
    return this.selectSkillCandidate(matched, options.selectionTitle);
  }

  protected async resolveCatalogSkillSelection(
    context: CommandContext,
    input: string,
    explicitVersion: string | undefined,
    options: {
      allowMissingFallback?: boolean;
      selectionTitle: string;
      notFoundMessage: (input: string) => string;
      includeSelectedVersion?: boolean;
    }
  ): Promise<{ skillID: string; version?: string }> {
    const parsed = withExplicitSelectorVersion(parseSkillSelectorInput(input), explicitVersion);
    const selected = await this.resolveSkillCandidate(
      parsed,
      this.createCatalogSkillCandidates(await this.loadCatalogItems(context), {
        collapseVersions: !options.includeSelectedVersion,
      }),
      {
        allowMissingFallback: options.allowMissingFallback,
        matchVersion: false,
        notFoundMessage: options.notFoundMessage,
        selectionTitle: options.selectionTitle,
      }
    );
    return {
      skillID: selected.skillID,
      version: parsed.version || (options.includeSelectedVersion ? selected.version || undefined : undefined),
    };
  }

  private sortSkillSelectionCandidates(candidates: SkillSelectionCandidate[]): SkillSelectionCandidate[] {
    return [...candidates].sort((a, b) => {
      const left = `${a.skillID}@${a.version}`;
      const right = `${b.skillID}@${b.version}`;
      return left.localeCompare(right);
    });
  }

  private async selectSkillCandidate(
    candidates: SkillSelectionCandidate[],
    selectionTitle: string
  ): Promise<SkillSelectionCandidate> {
    const { selectSkillWithScroll } = await import("../ui/selectors.js");
    const options = candidates.map((item) => ({
      skillID: item.skillID,
      version: item.version,
      description: item.description,
    }));
    const selected = await selectSkillWithScroll(options, selectionTitle);
    const matched = candidates.find((item) => item.skillID === selected.skillID && item.version === selected.version);
    if (!matched) {
      this.fail(`Selected skill is not part of current candidate set: ${selected.skillID}@${selected.version}`);
    }
    return matched;
  }
}

/**
 * 列出技能命令
 */
export class ListCommand extends BaseCommand {
  readonly name = "list";
  readonly description = "List skills (GET /api/v1/skills)";

  async execute(context: CommandContext): Promise<void> {
    const resourceContext = normalizeResourceContext(context);
    if (resourceContext.resourceType === "agentsmd") {
      await new ListAgentsMDCommand().execute(resourceContext.context);
      return;
    }

    const args = resourceContext.context.args;
    const positional = collectPositionalArgs(args, ["--q", "--rgx", "--regex"]);
    if (positional.length > 0) {
      this.fail("Usage: skuare list [--type <skill|agentsmd|agmd>] [--q <keyword>] [--rgx <re>]. Bare positional arguments are not allowed; use --q or --rgx.");
    }
    const q = this.parseOptionValue(args, "--q");
    const regexPattern = parseRegexOption(args);
    const regex = regexPattern ? this.compileRegex(regexPattern) : undefined;
    const path = q ? `/api/v1/skills?q=${encodeURIComponent(q)}` : "/api/v1/skills";

    const resp = await callApi({
      method: "GET",
      path,
      server: resourceContext.context.server,
      silent: true,
    });

    const itemsRaw = (resp.data && typeof resp.data === "object" && !Array.isArray(resp.data))
      ? (resp.data as { items?: JsonValue }).items
      : undefined;
    const items = Array.isArray(itemsRaw) ? itemsRaw : [];
    const normalizedItems = normalizeListItems(items);
    const filtered = regex ? normalizedItems.filter((item) => matchesSkill(regex, item)) : normalizedItems;

    console.log(JSON.stringify({ items: filtered }, null, 2));
  }

  private compileRegex(pattern: string): RegExp {
    try {
      return new RegExp(pattern);
    } catch {
      this.fail(`Invalid regex pattern: ${pattern}`);
    }
  }
}

/**
 * 获取技能详情命令
 */
export class PeekCommand extends SkillCatalogCommand {
  readonly name = "peek";
  readonly description = "Peek skill overview/detail";

  async execute(context: CommandContext): Promise<void> {
    const normalized = normalizeResourceContext(context);
    if (normalized.resourceType === "agentsmd") {
      await new PeekAgentsMDCommand().execute(normalized.context);
      return;
    }

    const skillContext = normalized.context;
    const regexPattern = parseRegexOption(skillContext.args);
    const positional = stripRegexOptions(skillContext.args);
    if (regexPattern) {
      if (positional.length > 1) {
        this.fail("Usage: skuare peek --rgx <pattern> [version]");
      }
      const skillID = await this.resolveSkillIDByRegex(skillContext, regexPattern);
      const version = positional[0];
      await this.outputSkill(skillContext, skillID, version);
      return;
    }

    const [input, explicitVersion] = positional;
    if (!input) {
      this.fail("Missing <skillRef>. Usage: skuare peek <skillID|name|author/name> [version] | skuare peek --rgx <pattern> [version]");
    }
    if (positional.length > 2) {
      this.fail("Usage: skuare peek <skillID|name|author/name> [version] | skuare peek --rgx <pattern> [version]");
    }
    const resolved = await this.resolveCatalogSkillSelection(skillContext, input, explicitVersion, {
      allowMissingFallback: true,
      notFoundMessage: (value) => `No skill found for: ${value}`,
      selectionTitle: "Multiple skills found, select one (use ↑/↓, Enter to confirm):",
      includeSelectedVersion: false,
    });
    await this.outputSkill(skillContext, resolved.skillID, resolved.version);
  }

  private async outputSkill(context: CommandContext, skillID: string, version?: string): Promise<void> {
    if (version) {
      const resp = await callApi({
        method: "GET",
        path: `/api/v1/skills/${encodeURIComponent(skillID)}/${encodeURIComponent(version)}`,
        server: context.server,
        silent: true,
      });
      const row = (resp.data && typeof resp.data === "object" && !Array.isArray(resp.data))
        ? (resp.data as Record<string, JsonValue>)
        : {};
      const skillIDRaw = String(row.skill_id || skillID).trim();
      const versionRaw = String(row.version || version).trim();
      const nameRaw = String(row.name || "").trim();
      const authorRaw = String(row.author || "").trim() || parseMetadataAuthorFromSkillFiles(row.files);
      const display = buildDisplayIdentity({
        skillID: skillIDRaw,
        version: versionRaw,
        name: nameRaw,
        author: authorRaw,
      });
      const out: Record<string, JsonValue> = {
        id: display.id,
        name: display.name,
        author: display.author,
        skill_id: row.skill_id ?? skillIDRaw,
        version: row.version ?? versionRaw,
      };
      if (row.description !== undefined) {
        out.description = row.description;
      }
      if (row.overview !== undefined) {
        out.overview = row.overview;
      }
      if (row.sections !== undefined) {
        out.sections = row.sections;
      }
      if (row.files !== undefined) {
        out.files = row.files;
      }
      if (row.path !== undefined) {
        out.path = row.path;
      }
      if (row.updated_at !== undefined) {
        out.updated_at = row.updated_at;
      }
      console.log(JSON.stringify(out, null, 2));
      return;
    }

    const resp = await callApi({
      method: "GET",
      path: `/api/v1/skills/${encodeURIComponent(skillID)}`,
      server: context.server,
      silent: true,
    });
    const row = (resp.data && typeof resp.data === "object" && !Array.isArray(resp.data))
      ? (resp.data as Record<string, JsonValue>)
      : {};
    const skillIDRaw = String(row.skill_id || skillID).trim();
    const versionsRaw = Array.isArray(row.versions) ? row.versions.map((v) => String(v).trim()).filter(Boolean) : [];
    const latestVersion = versionsRaw.length > 0 ? versionsRaw[versionsRaw.length - 1] : "";
    const authorRaw = String(row.author || "").trim();
    const display = buildDisplayIdentity({
      skillID: skillIDRaw,
      version: latestVersion,
      author: authorRaw,
    });
    const ids = versionsRaw.map((v) => buildDisplayIdentity({ skillID: skillIDRaw, version: v, name: display.name, author: display.author }).id);
    console.log(JSON.stringify({
      id: display.id,
      name: display.name,
      author: display.author,
      skill_id: row.skill_id ?? skillIDRaw,
      latest_version: latestVersion || null,
      versions: versionsRaw,
      ids,
    }, null, 2));
  }
}

abstract class DependencyAwareCommand extends SkillCatalogCommand {
  protected resolvePrimaryTool(llmTools: string[]): string {
    return resolvePrimaryTool(llmTools);
  }

  protected resolveInstallTargetRoot(cwd: string, tool: string, configured: string | undefined, isGlobal: boolean): string {
    return resolveInstallTargetRoot(cwd, tool, isGlobal, configured);
  }

  protected resolveInstallTargets(context: CommandContext, isGlobal: boolean): InstallTargetPlan[] {
    const tools = isGlobal
      ? Array.from(new Set((context.llmTools || []).map((value) => value.trim()).filter(Boolean)))
      : [this.resolvePrimaryTool(context.llmTools)];
    const targets = new Map<string, string[]>();
    for (const tool of tools) {
      const targetRoot = this.resolveInstallTargetRoot(context.cwd, tool, context.toolSkillDirs[tool], isGlobal);
      const existing = targets.get(targetRoot);
      if (existing) {
        existing.push(tool);
      } else {
        targets.set(targetRoot, [tool]);
      }
    }
    return Array.from(targets.entries()).map(([targetRoot, groupedTools]) => ({
      targetRoot,
      tools: groupedTools,
    }));
  }

  protected onDependencyCycle(context: DependencyCycleContext): never {
    this.fail(`Detected circular dependency: ${context.cyclePath.join(" -> ")}`);
  }

  protected onDependencyVersionConflict(skillID: string, existingVersion: string, nextVersion: string): never {
    this.fail(`Conflicting dependency versions for ${skillID}: ${existingVersion} vs ${nextVersion}`);
  }

  protected createDependencySkillCandidates(nodes: SkillGraphNode[]): SkillSelectionCandidate[] {
    return nodes.map((node) => {
      const identity = parseSkillIdentityFromRemoteFiles(node.files);
      return this.createSkillSelectionCandidate({
        skillID: node.skillID,
        version: node.version,
        name: identity.name && identity.name !== node.skillID ? identity.name : undefined,
        author: identity.author,
        description: node.description,
      });
    });
  }

  protected async resolveDependencyTarget(
    graph: DependencyGraph,
    rootSkillID: string,
    depInput: string
  ): Promise<SkillGraphNode> {
    const descendants = this.collectSubtree(graph, rootSkillID).filter((node) => node.skillID !== rootSkillID);
    const selected = await this.resolveSkillCandidate(
      parseSkillSelectorInput(depInput),
      this.createDependencySkillCandidates(descendants),
      {
        matchVersion: true,
        notFoundMessage: (input) => `Dependency ${input} is not part of ${rootSkillID}`,
        selectionTitle: "Multiple dependencies found, select one (use ↑/↓, Enter to confirm):",
      }
    );
    const target = descendants.find((node) => node.skillID === selected.skillID && node.version === selected.version);
    if (!target) {
      this.fail(`Dependency ${selected.skillID}@${selected.version} is not part of ${rootSkillID}`);
    }
    return target;
  }

  protected parseDependencyRefs(files: RemoteFile[], sourceLabel: string): DependencyRef[] {
    const lock = files.find((f) => normalizePath(f.path) === "skill-deps.lock.json");
    const plain = files.find((f) => normalizePath(f.path) === "skill-deps.json");
    const depFile = lock || plain;
    if (!depFile) {
      return [];
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(depFile.content) as unknown;
    } catch {
      this.fail(`Invalid dependency file JSON in ${sourceLabel}: ${depFile.path}`);
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      this.fail(`Invalid dependency file in ${sourceLabel}: ${depFile.path}`);
    }
    const deps = (parsed as { dependencies?: unknown }).dependencies;
    if (!Array.isArray(deps)) {
      this.fail(`Invalid dependencies format in ${sourceLabel}: ${depFile.path}`);
    }
    return deps.map((row) => this.parseDependencyRef(row, sourceLabel, !!lock));
  }

  protected parseDependencyRef(item: unknown, sourceLabel: string, fromLockFile: boolean): DependencyRef {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      this.fail(`Invalid dependency item in ${sourceLabel}`);
    }
    const row = item as { skill?: unknown; version?: unknown; resolved?: unknown; alias?: unknown };
    const skillID = String(row.skill || "").trim();
    const requestedVersion = String(row.version || "").trim();
    const resolvedVersion = fromLockFile ? String(row.resolved || row.version || "").trim() : requestedVersion;
    const aliasRaw = row.alias;
    const alias = aliasRaw === undefined ? "" : String(aliasRaw).trim();
    if (!skillID || !requestedVersion) {
      this.fail(`Dependency item requires skill/version in ${sourceLabel}`);
    }
    if (aliasRaw !== undefined && !alias) {
      this.fail(`Dependency alias must be a non-empty string in ${sourceLabel}`);
    }
    return {
      skillID,
      version: resolvedVersion || requestedVersion,
      requestedVersion,
      ...(alias ? { alias } : {}),
    };
  }

  protected async resolveVersion(context: CommandContext, skillID: string, preferred?: string): Promise<string> {
    if (preferred) {
      return preferred;
    }
    const resp = await callApi({
      method: "GET",
      path: `/api/v1/skills/${encodeURIComponent(skillID)}`,
      server: context.server,
      silent: true,
    });
    const data = (resp.data && typeof resp.data === "object" && !Array.isArray(resp.data))
      ? (resp.data as { versions?: JsonValue }).versions
      : undefined;
    const versions = Array.isArray(data) ? data.map((v) => String(v)).filter(Boolean) : [];
    if (versions.length === 0) {
      this.fail(`No versions found for skill: ${skillID}`);
    }
    return versions[versions.length - 1];
  }

  protected async fetchRemoteSkillNode(context: CommandContext, skillID: string, preferredVersion?: string): Promise<SkillGraphNode> {
    const version = await this.resolveVersion(context, skillID, preferredVersion);
    const resp = await callApi({
      method: "GET",
      path: `/api/v1/skills/${encodeURIComponent(skillID)}/${encodeURIComponent(version)}`,
      server: context.server,
      silent: true,
    });
    const row = (resp.data && typeof resp.data === "object" && !Array.isArray(resp.data))
      ? (resp.data as Record<string, JsonValue>)
      : {};
    const filesRaw = Array.isArray(row.files) ? row.files : [];
    const files: RemoteFile[] = [];
    for (const entry of filesRaw) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        continue;
      }
      const file = entry as Record<string, JsonValue>;
      const path = String(file.path || "").trim();
      if (!path) {
        continue;
      }
      files.push({ path, content: String(file.content || "") });
    }
    if (files.length === 0) {
      this.fail(`Skill ${skillID}@${version} does not contain downloadable files`);
    }
    const skillFile = files.find((file) => normalizePath(file.path) === "SKILL.md");
    const metadata = skillFile ? parseSkillFrontmatter(skillFile.content) : { name: "", description: "", metadataVersion: "", metadataAuthor: "" };
    return {
      skillID: String(row.skill_id || skillID).trim() || skillID,
      version: String(row.version || version).trim() || version,
      description: String(row.description || "").trim() || metadata.description,
      files,
      dependencies: this.parseDependencyRefs(files, `${skillID}@${version}`),
    };
  }

  protected async buildDependencyGraph(context: CommandContext, root: SkillGraphNode): Promise<DependencyGraph> {
    const nodes = new Map<string, SkillGraphNode>();
    const loaded = new Map<string, SkillGraphNode>();
    const completed = new Set<string>();
    const active = new Set<string>();
    const stack: string[] = [];
    const versionsBySkillID = new Map<string, string>();

    const visit = async (node: SkillGraphNode): Promise<void> => {
      const nodeKey = formatNodeKey(node.skillID, node.version);
      const existingVersion = versionsBySkillID.get(node.skillID);
      if (existingVersion && existingVersion !== node.version) {
        this.onDependencyVersionConflict(node.skillID, existingVersion, node.version);
      }
      versionsBySkillID.set(node.skillID, node.version);

      if (completed.has(nodeKey)) {
        nodes.set(nodeKey, node);
        return;
      }
      if (active.has(nodeKey)) {
        const cycleStart = stack.indexOf(nodeKey);
        const cyclePath = cycleStart >= 0 ? [...stack.slice(cycleStart), nodeKey] : [...stack, nodeKey];
        this.onDependencyCycle({ cyclePath, skillID: node.skillID, version: node.version });
      }

      nodes.set(nodeKey, node);
      active.add(nodeKey);
      stack.push(nodeKey);
      try {
        for (const dep of node.dependencies) {
          const depKey = formatNodeKey(dep.skillID, dep.version);
          let depNode = loaded.get(depKey);
          if (!depNode) {
            depNode = await this.fetchRemoteSkillNode(context, dep.skillID, dep.version);
            loaded.set(depKey, depNode);
          }
          await visit(depNode);
        }
        completed.add(nodeKey);
      } finally {
        stack.pop();
        active.delete(nodeKey);
      }
    };

    await visit(root);
    return { root, nodes };
  }

  protected collectSubtree(graph: DependencyGraph, rootSkillID: string): SkillGraphNode[] {
    const out: SkillGraphNode[] = [];
    const visited = new Set<string>();
    const rootNode = Array.from(graph.nodes.values()).find((node) => node.skillID === rootSkillID);
    if (!rootNode) {
      this.fail(`Skill not found in dependency graph: ${rootSkillID}`);
    }

    const walk = (node: SkillGraphNode): void => {
      const nodeKey = formatNodeKey(node.skillID, node.version);
      if (visited.has(nodeKey)) {
        return;
      }
      visited.add(nodeKey);
      out.push(node);
      for (const dep of node.dependencies) {
        const depNode = graph.nodes.get(formatNodeKey(dep.skillID, dep.version));
        if (depNode) {
          walk(depNode);
        }
      }
    };

    walk(rootNode);
    return out;
  }

  protected async writeSkillFiles(
    targetRoot: string,
    skillID: string,
    files: RemoteFile[],
    options?: { sharedLocalDir: boolean }
  ): Promise<string[]> {
    const skillDir = join(targetRoot, skillID);
    await mkdir(skillDir, { recursive: true });
    const conflicts: string[] = [];
    for (const file of files) {
      const rel = normalizePath(file.path).replace(/^(\.\.\/)+/, "");
      const dest = join(skillDir, rel);
      await mkdir(dirname(dest), { recursive: true });
      let oldContent: string | undefined;
      try {
        oldContent = await readFile(dest, "utf8");
      } catch (err) {
        if (!(err && typeof err === "object" && (err as { code?: string }).code === "ENOENT")) {
          throw err;
        }
      }
      if (oldContent === file.content) {
        continue;
      }
      if (options?.sharedLocalDir && oldContent !== undefined) {
        conflicts.push(normalizePath(join(skillID, rel)));
      }
      await writeFile(dest, file.content, "utf8");
    }
    return conflicts;
  }

  protected async installGraphNodes(
    targetRoot: string,
    nodes: SkillGraphNode[],
    options?: { sharedLocalDir: boolean }
  ): Promise<InstallResult> {
    const installed = new Set<string>();
    const conflicts = new Set<string>();
    for (const node of nodes) {
      const changed = await this.writeSkillFiles(targetRoot, node.skillID, node.files, options);
      installed.add(node.skillID);
      for (const path of changed) {
        conflicts.add(path);
      }
    }
    return {
      skills: Array.from(installed),
      conflictFiles: Array.from(conflicts),
    };
  }

  protected isInteractiveInstallSession(): boolean {
    const stdin = process.stdin as { isTTY?: boolean };
    const stdout = process.stdout as { isTTY?: boolean };
    return !!stdin.isTTY && !!stdout.isTTY;
  }

  protected async loadLocalInstalledSkill(targetRoot: string, skillDir: string): Promise<LocalInstalledSkill> {
    const root = resolve(targetRoot);
    const skillID = normalizePath(relative(root, skillDir));
    const skillPath = join(skillDir, "SKILL.md");
    const skillContent = await readFile(skillPath, "utf8");
    const lockPath = join(skillDir, "skill-deps.lock.json");
    const plainPath = join(skillDir, "skill-deps.json");
    const files: RemoteFile[] = [{ path: "SKILL.md", content: skillContent }];

    const lockInfo = await stat(lockPath).catch(() => undefined);
    if (lockInfo?.isFile()) {
      files.push({ path: "skill-deps.lock.json", content: await readFile(lockPath, "utf8") });
    }
    const plainInfo = await stat(plainPath).catch(() => undefined);
    if (plainInfo?.isFile()) {
      files.push({ path: "skill-deps.json", content: await readFile(plainPath, "utf8") });
    }

    return {
      skillID,
      version: parseSkillFrontmatter(skillContent).metadataVersion,
      dir: skillDir,
      dependencies: this.parseDependencyRefs(files, skillDir),
    };
  }

  protected async scanLocalInstallState(targetRoot: string): Promise<LocalInstallState> {
    const skills = new Map<string, LocalInstalledSkill>();
    for (const skillDir of await collectSkillDirs(resolve(targetRoot))) {
      const skill = await this.loadLocalInstalledSkill(targetRoot, skillDir);
      skills.set(skill.skillID, skill);
    }

    const directDependents = new Map<string, Set<string>>();
    for (const skill of skills.values()) {
      for (const dep of skill.dependencies) {
        if (!skills.has(dep.skillID)) {
          continue;
        }
        const existing = directDependents.get(dep.skillID);
        if (existing) {
          existing.add(skill.skillID);
        } else {
          directDependents.set(dep.skillID, new Set([skill.skillID]));
        }
      }
    }

    const roots = Array.from(skills.keys())
      .filter((skillID) => !directDependents.has(skillID))
      .sort((a, b) => a.localeCompare(b));
    const rootConsumersBySkillID = new Map<string, string[]>();
    const appendRootConsumer = (skillID: string, rootSkillID: string): void => {
      const existing = rootConsumersBySkillID.get(skillID);
      if (!existing) {
        rootConsumersBySkillID.set(skillID, [rootSkillID]);
        return;
      }
      if (!existing.includes(rootSkillID)) {
        existing.push(rootSkillID);
        existing.sort((a, b) => a.localeCompare(b));
      }
    };

    const visitFromRoot = (rootSkillID: string, skillID: string, seen: Set<string>): void => {
      if (seen.has(skillID)) {
        return;
      }
      seen.add(skillID);
      appendRootConsumer(skillID, rootSkillID);
      const skill = skills.get(skillID);
      if (!skill) {
        return;
      }
      for (const dep of skill.dependencies) {
        if (!skills.has(dep.skillID)) {
          continue;
        }
        visitFromRoot(rootSkillID, dep.skillID, seen);
      }
    };

    for (const rootSkillID of roots) {
      visitFromRoot(rootSkillID, rootSkillID, new Set<string>());
    }

    return { skills, rootConsumersBySkillID };
  }

  protected async buildInstallTargetPreview(
    targetRoot: string,
    tools: string[],
    nodes: SkillGraphNode[],
    rootSkillID: string,
    options?: { excludeRootConsumers?: string[] }
  ): Promise<InstallTargetPreview> {
    const localState = await this.scanLocalInstallState(targetRoot);
    const installSkillIDs = new Set(nodes.map((node) => node.skillID));
    const excludedRootConsumers = new Set((options?.excludeRootConsumers || []).map((value) => value.trim()).filter(Boolean));
    const nodePreviews: InstallNodePreview[] = [];

    for (const node of nodes) {
      const local = localState.skills.get(node.skillID);
      const changedFiles: string[] = [];
      const addedFiles: string[] = [];

      for (const file of node.files) {
        const rel = normalizePath(file.path).replace(/^(\.\.\/)+/, "");
        const dest = join(targetRoot, node.skillID, rel);
        let oldContent: string | undefined;
        try {
          oldContent = await readFile(dest, "utf8");
        } catch (err) {
          if (!(err && typeof err === "object" && (err as { code?: string }).code === "ENOENT")) {
            throw err;
          }
        }
        if (oldContent === undefined) {
          addedFiles.push(rel);
        } else if (oldContent !== file.content) {
          changedFiles.push(rel);
        }
      }

      let status: InstallNodeStatus;
      if (!local) {
        status = "new";
      } else if (changedFiles.length === 0 && addedFiles.length === 0) {
        status = "unchanged";
      } else if ((local.version || "").trim() !== node.version) {
        status = "overwrite-version";
      } else {
        status = "overwrite-content";
      }

      const sharedWith = (localState.rootConsumersBySkillID.get(node.skillID) || [])
        .filter((consumer) => !installSkillIDs.has(consumer) && !excludedRootConsumers.has(consumer))
        .sort((a, b) => a.localeCompare(b));

      nodePreviews.push({
        skillID: node.skillID,
        version: node.version,
        role: node.skillID === rootSkillID ? "root" : "dependency",
        status,
        localVersion: local?.version,
        changedFiles: changedFiles.sort((a, b) => a.localeCompare(b)),
        addedFiles: addedFiles.sort((a, b) => a.localeCompare(b)),
        sharedWith,
      });
    }

    return {
      targetRoot,
      tools,
      rootSkillID,
      nodes: nodePreviews,
      requiresConfirmation: nodePreviews.some((node) => node.status === "overwrite-version" || node.status === "overwrite-content"),
      summary: {
        newSkills: nodePreviews.filter((node) => node.status === "new").length,
        unchangedSkills: nodePreviews.filter((node) => node.status === "unchanged").length,
        overwriteSkills: nodePreviews.filter((node) => node.status === "overwrite-version" || node.status === "overwrite-content").length,
        sharedSkills: nodePreviews.filter((node) => node.sharedWith.length > 0).length,
      },
    };
  }

  protected renderInstallTargetPreview(preview: InstallTargetPreview): string[] {
    const lines = [
      "",
      "Install overwrite confirmation",
      `  target: ${preview.targetRoot}`,
      `  root skill: ${preview.rootSkillID}`,
      `  tools: ${preview.tools.join(", ")}`,
      `  summary: ${preview.summary.newSkills} new, ${preview.summary.unchangedSkills} unchanged, ${preview.summary.overwriteSkills} overwrite, ${preview.summary.sharedSkills} shared`,
      "  overwrite items:",
    ];
    const overwriteNodes = preview.nodes.filter((node) => node.status === "overwrite-version" || node.status === "overwrite-content");
    for (const node of overwriteNodes) {
      const localVersion = node.localVersion || "unknown";
      const statusLabel = node.status === "overwrite-version"
        ? `${localVersion} -> ${node.version}`
        : `${node.version} (content differs)`;
      const fileParts: string[] = [];
      if (node.changedFiles.length > 0) {
        fileParts.push(`changed=${node.changedFiles.join(",")}`);
      }
      if (node.addedFiles.length > 0) {
        fileParts.push(`added=${node.addedFiles.join(",")}`);
      }
      const sharedLabel = node.sharedWith.length > 0 ? `; shared with ${node.sharedWith.join(",")}` : "";
      lines.push(`  - [${node.role}] ${node.skillID}: ${statusLabel}${sharedLabel}${fileParts.length > 0 ? `; ${fileParts.join("; ")}` : ""}`);
    }
    return lines;
  }

  protected async confirmInstallTargetPreview(preview: InstallTargetPreview): Promise<boolean> {
    const { selectWithArrows } = await import("../ui/selectors.js");
    process.stdout.write(`${this.renderInstallTargetPreview(preview).join("\n")}\n`);
    const decision = await selectWithArrows({
      options: ["overwrite", "cancel"],
      labels: [
        `overwrite ${preview.summary.overwriteSkills} existing skill(s) and continue`,
        "cancel install",
      ],
      defaultIndex: 0,
      title: "Select install action (use ↑/↓, Enter to confirm):",
    });
    return decision === "overwrite";
  }

  protected buildNonInteractiveOverwriteMessage(previews: InstallTargetPreview[]): string {
    const lines = [
      "Overwrite confirmation required, but current session is not interactive.",
      "Re-run this command in a TTY session to review and confirm the install impact.",
    ];
    for (const preview of previews.filter((entry) => entry.requiresConfirmation)) {
      const overwriteNodes = preview.nodes.filter((node) => node.status === "overwrite-version" || node.status === "overwrite-content");
      const details = overwriteNodes
        .map((node) => {
          const localVersion = node.localVersion || "unknown";
          const suffix = node.sharedWith.length > 0 ? ` (shared with ${node.sharedWith.join(",")})` : "";
          return `${node.skillID}:${localVersion}->${node.version}${suffix}`;
        })
        .join(", ");
      lines.push(`- ${preview.targetRoot}: ${details}`);
    }
    return lines.join("\n");
  }

  protected async ensureInstallTargetPreviewsConfirmed(previews: InstallTargetPreview[]): Promise<void> {
    const pending = previews.filter((preview) => preview.requiresConfirmation);
    if (pending.length === 0) {
      return;
    }
    if (!this.isInteractiveInstallSession()) {
      this.fail(this.buildNonInteractiveOverwriteMessage(pending));
    }
    for (const preview of pending) {
      const confirmed = await this.confirmInstallTargetPreview(preview);
      if (!confirmed) {
        this.fail(`Install cancelled for ${preview.targetRoot}`);
      }
    }
  }

  protected async readWrapMetadata(skillDir: string): Promise<WrapMetadata | undefined> {
    const filePath = join(skillDir, WRAP_METADATA_FILE);
    const info = await stat(filePath).catch(() => undefined);
    if (!info?.isFile()) {
      return undefined;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(await readFile(filePath, "utf8")) as unknown;
    } catch {
      this.fail(`Invalid wrap metadata JSON: ${filePath}`);
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      this.fail(`Invalid wrap metadata: ${filePath}`);
    }
    const row = parsed as Record<string, unknown>;
    const metadata: WrapMetadata = {
      version: Number(row.version) === 1 ? 1 : 1,
      mode: row.mode === "wrap" ? "wrap" : "wrap",
      tool: String(row.tool || "").trim(),
      root_skill_id: String(row.root_skill_id || "").trim(),
      root_version: String(row.root_version || "").trim(),
      install_root: String(row.install_root || "").trim(),
      global: row.global === true,
    };
    if (!metadata.tool || !metadata.root_skill_id || !metadata.root_version || !metadata.install_root) {
      this.fail(`Wrap metadata is missing required fields: ${filePath}`);
    }
    return metadata;
  }

  protected async loadLocalRootDescriptor(rootSkillDir: string): Promise<LocalRootDescriptor> {
    const rootDir = resolve(rootSkillDir);
    const skillPath = join(rootDir, "SKILL.md");
    const skillInfo = await stat(skillPath).catch(() => undefined);
    if (!skillInfo?.isFile()) {
      this.fail(`rootSkillDir does not contain SKILL.md: ${rootSkillDir}`);
    }

    const skillContent = await readFile(skillPath, "utf8");
    const skillMeta = parseSkillFrontmatter(skillContent);
    const wrapMetadata = await this.readWrapMetadata(rootDir);
    const files: RemoteFile[] = [{ path: "SKILL.md", content: skillContent }];
    const lockPath = join(rootDir, "skill-deps.lock.json");
    const plainPath = join(rootDir, "skill-deps.json");

    const lockInfo = await stat(lockPath).catch(() => undefined);
    if (lockInfo?.isFile()) {
      files.push({ path: "skill-deps.lock.json", content: await readFile(lockPath, "utf8") });
    }
    const plainInfo = await stat(plainPath).catch(() => undefined);
    if (plainInfo?.isFile()) {
      files.push({ path: "skill-deps.json", content: await readFile(plainPath, "utf8") });
    }

    const rootSkillID = wrapMetadata?.root_skill_id || skillMeta.name || basename(rootDir);
    const rootVersion = wrapMetadata?.root_version || skillMeta.metadataVersion;
    if (!rootSkillID || !rootVersion) {
      this.fail(`Cannot resolve root skill identity/version from ${rootSkillDir}`);
    }

    return {
      rootDir,
      rootSkillID,
      rootVersion,
      description: skillMeta.description,
      tool: wrapMetadata?.tool || undefined,
      installRoot: wrapMetadata?.install_root || dirname(rootDir),
      metadata: wrapMetadata,
      files,
      dependencies: this.parseDependencyRefs(files, rootDir),
    };
  }

  protected async buildGraphFromLocalRoot(context: CommandContext, rootSkillDir: string): Promise<{ descriptor: LocalRootDescriptor; graph: DependencyGraph }> {
    const descriptor = await this.loadLocalRootDescriptor(rootSkillDir);
    const rootNode: SkillGraphNode = {
      skillID: descriptor.rootSkillID,
      version: descriptor.rootVersion,
      description: descriptor.description,
      files: descriptor.files,
      dependencies: descriptor.dependencies,
    };
    const graph = await this.buildDependencyGraph(context, rootNode);
    return { descriptor, graph };
  }

  protected resolveDepsInstallRoot(context: CommandContext, descriptor: LocalRootDescriptor, isGlobal: boolean): string {
    if (isGlobal) {
      const tool = descriptor.tool || this.resolvePrimaryTool(context.llmTools);
      return this.resolveInstallTargetRoot(context.cwd, tool, context.toolSkillDirs[tool], true);
    }
    return descriptor.installRoot || dirname(descriptor.rootDir);
  }
}

export class GetCommand extends DependencyAwareCommand {
  readonly name = "get";
  readonly description = "Install skill to local partial repository";

  async execute(context: CommandContext): Promise<void> {
    const normalized = normalizeResourceContext(context);
    if (normalized.resourceType === "agentsmd") {
      await new GetAgentsMDCommand().execute(normalized.context);
      return;
    }

    const skillContext = normalized.context;
    const isGlobal = skillContext.args.includes("--global");
    const wrapMode = skillContext.args.includes("--wrap");
    const regexPattern = parseRegexOption(skillContext.args);
    const positional = stripRegexOptions(skillContext.args).filter((arg) => arg !== "--global" && arg !== "--wrap");

    let skillID: string;
    let versionArg: string | undefined;

    if (regexPattern) {
      if (positional.length > 1) {
        this.fail("Usage: skuare get --rgx <pattern> [version] [--global] [--wrap]");
      }
      skillID = await this.resolveSkillIDByRegex(skillContext, regexPattern);
      versionArg = positional[0];
    } else {
      const [input, version] = positional;
      if (!input) {
        this.fail("Missing <skillRef>. Usage: skuare get <skillID|name|author/name> [version] [--rgx <pattern>] [--global] [--wrap]");
      }
      if (positional.length > 2) {
        this.fail("Usage: skuare get <skillID|name|author/name> [version] [--rgx <pattern>] [--global] [--wrap]");
      }

      const resolved = await this.resolveCatalogSkillSelection(skillContext, input, version, {
        allowMissingFallback: true,
        notFoundMessage: (value) => `No skill found for: ${value}`,
        selectionTitle: "Multiple skills found, select one (use ↑/↓, Enter to confirm):",
        includeSelectedVersion: true,
      });
      skillID = resolved.skillID;
      versionArg = resolved.version;
    }

    const installTargets = this.resolveInstallTargets(skillContext, isGlobal);
    const primaryTool = isGlobal
      ? installTargets.flatMap((entry) => entry.tools)[0] || this.resolvePrimaryTool(skillContext.llmTools)
      : this.resolvePrimaryTool(skillContext.llmTools);
    const primaryTargetRoot = installTargets[0]?.targetRoot || this.resolveInstallTargetRoot(
      skillContext.cwd,
      primaryTool,
      skillContext.toolSkillDirs[primaryTool],
      isGlobal
    );
    const rootNode = await this.fetchRemoteSkillNode(skillContext, skillID, versionArg);
    const graph = await this.buildDependencyGraph(skillContext, rootNode);
    const sharedLocalDir = false;
    const nodesToInstall = wrapMode ? [graph.root] : this.collectSubtree(graph, graph.root.skillID);
    const previews = await Promise.all(
      installTargets.map((installTarget) =>
        this.buildInstallTargetPreview(installTarget.targetRoot, installTarget.tools, nodesToInstall, graph.root.skillID)
      )
    );
    await this.ensureInstallTargetPreviewsConfirmed(previews);
    const installedSkills = new Set<string>();
    const conflictFiles = new Set<string>();
    for (const installTarget of installTargets) {
      const result = await this.installGraphNodes(installTarget.targetRoot, nodesToInstall, { sharedLocalDir });
      for (const skill of result.skills) {
        installedSkills.add(skill);
      }
      for (const conflict of result.conflictFiles) {
        conflictFiles.add(conflict);
      }
      if (wrapMode) {
        for (const tool of installTarget.tools) {
          await this.writeWrapMetadata(installTarget.targetRoot, graph.root.skillID, {
            version: 1,
            mode: "wrap",
            tool,
            root_skill_id: graph.root.skillID,
            root_version: graph.root.version,
            install_root: installTarget.targetRoot,
            global: isGlobal,
          });
        }
      }
    }
    const result = {
      skills: Array.from(installedSkills),
      conflictFiles: Array.from(conflictFiles),
    };
    if (sharedLocalDir && result.conflictFiles.length > 0) {
      console.log(
        `${this.yellow("[WARN]")} local mode shared repository detected, overwrite ${result.conflictFiles.length} file(s) during install`
      );
    }
    console.log(JSON.stringify({
      global: isGlobal,
      wrap: wrapMode,
      llm_tool: primaryTool,
      llm_tools: installTargets.flatMap((entry) => entry.tools),
      target: primaryTargetRoot,
      targets: installTargets.map((entry) => ({ target: entry.targetRoot, tools: entry.tools })),
      shared_local_dir: sharedLocalDir,
      confirmation_required: previews.some((preview) => preview.requiresConfirmation),
      overwrite_targets: previews
        .filter((preview) => preview.requiresConfirmation)
        .map((preview) => ({
          target: preview.targetRoot,
          tools: preview.tools,
          skills: preview.nodes
            .filter((node) => node.status === "overwrite-version" || node.status === "overwrite-content")
            .map((node) => ({
              skill_id: node.skillID,
              local_version: node.localVersion || null,
              target_version: node.version,
              shared_with: node.sharedWith,
            })),
        })),
      conflicts: result.conflictFiles.sort((a, b) => a.localeCompare(b)),
      skills: result.skills.sort((a, b) => a.localeCompare(b)),
    }, null, 2));
  }

  private async writeWrapMetadata(targetRoot: string, skillID: string, metadata: WrapMetadata): Promise<void> {
    const filePath = join(targetRoot, skillID, WRAP_METADATA_FILE);
    await writeFile(filePath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
  }
}

export class DepsCommand extends DependencyAwareCommand {
  readonly name = "deps";
  readonly description = "Inspect or install wrapped skill dependencies";

  async execute(context: CommandContext): Promise<void> {
    const actionFlags = ["--brief", "--content", "--tree", "--install"].filter((flag) => context.args.includes(flag));
    if (actionFlags.length !== 1) {
      this.fail("Usage: skuare deps (--brief|--content|--tree|--install) <rootSkillDir> [depSkillID] [--global]");
    }
    const isGlobal = context.args.includes("--global");
    const positional = context.args.filter((arg) =>
      arg !== "--brief" && arg !== "--content" && arg !== "--tree" && arg !== "--install" && arg !== "--global"
    );
    const [action] = actionFlags;

    if (action === "--brief") {
      const [rootSkillDir] = positional;
      if (!rootSkillDir || positional.length !== 1) {
        this.fail("Usage: skuare deps --brief <rootSkillDir>");
      }
      const { descriptor, graph } = await this.buildGraphFromLocalRoot(context, rootSkillDir);
      const dependencies = this.collectDescendants(graph, descriptor.rootSkillID)
        .map((node) => ({
          skill_id: node.skillID,
          version: node.version,
          description: node.description,
        }))
        .sort((a, b) => a.skill_id.localeCompare(b.skill_id));
      console.log(JSON.stringify({
        root_skill_id: descriptor.rootSkillID,
        root_version: descriptor.rootVersion,
        dependencies,
      }, null, 2));
      return;
    }

    const [rootSkillDir, depTarget] = positional;
    if (!rootSkillDir || !depTarget || positional.length !== 2) {
      this.fail("Usage: skuare deps (--content|--tree|--install) <rootSkillDir> <skillID|name|author/name|...@version> [--global]");
    }

    const { descriptor, graph } = await this.buildGraphFromLocalRoot(context, rootSkillDir);
    const targetNode = await this.resolveDependencyTarget(graph, descriptor.rootSkillID, depTarget);

    if (action === "--content") {
      const skillFile = targetNode.files.find((file) => normalizePath(file.path) === "SKILL.md");
      if (!skillFile) {
        this.fail(`Dependency ${targetNode.skillID}@${targetNode.version} does not contain SKILL.md`);
      }
      process.stdout.write(skillFile.content);
      return;
    }

    if (action === "--tree") {
      const files = targetNode.files
        .map((file) => normalizePath(file.path))
        .sort((a, b) => a.localeCompare(b));
      console.log(JSON.stringify({
        skill_id: targetNode.skillID,
        version: targetNode.version,
        files,
      }, null, 2));
      return;
    }

    const installRoot = this.resolveDepsInstallRoot(context, descriptor, isGlobal);
    const nodesToInstall = this.collectSubtree(graph, targetNode.skillID);
    const previews = [await this.buildInstallTargetPreview(installRoot, [], nodesToInstall, targetNode.skillID, {
      excludeRootConsumers: [descriptor.rootSkillID],
    })];
    await this.ensureInstallTargetPreviewsConfirmed(previews);
    const result = await this.installGraphNodes(installRoot, nodesToInstall, { sharedLocalDir: false });
    console.log(JSON.stringify({
      global: isGlobal,
      root_skill_id: descriptor.rootSkillID,
      target_skill_id: targetNode.skillID,
      install_root: installRoot,
      confirmation_required: previews.some((preview) => preview.requiresConfirmation),
      overwrite_targets: previews
        .filter((preview) => preview.requiresConfirmation)
        .map((preview) => ({
          target: preview.targetRoot,
          tools: preview.tools,
          skills: preview.nodes
            .filter((node) => node.status === "overwrite-version" || node.status === "overwrite-content")
            .map((node) => ({
              skill_id: node.skillID,
              local_version: node.localVersion || null,
              target_version: node.version,
              shared_with: node.sharedWith,
            })),
        })),
      skills: result.skills.sort((a, b) => a.localeCompare(b)),
      conflicts: result.conflictFiles.sort((a, b) => a.localeCompare(b)),
    }, null, 2));
  }

  private collectDescendants(graph: DependencyGraph, rootSkillID: string): SkillGraphNode[] {
    return this.collectSubtree(graph, rootSkillID).filter((node) => node.skillID !== rootSkillID);
  }
}

export class DetailCommand extends BaseCommand {
  readonly name = "detail";
  readonly description = "Show local skill file contents";

  async execute(context: CommandContext): Promise<void> {
    const normalized = normalizeResourceContext(context);
    if (normalized.resourceType === "agentsmd") {
      await new DetailAgentsMDCommand().execute(normalized.context);
      return;
    }

    const skillContext = normalized.context;
    const [skillRef, ...relativePaths] = skillContext.args;
    if (!skillRef) {
      this.fail("Usage: skuare detail <skillName|skillID> [relativePath...]");
    }
    let skillDir: string;
    try {
      ({ skillDir } = await resolveDetailSkillDir(skillContext, skillRef));
    } catch (err) {
      this.fail(err instanceof Error ? err.message : `Invalid detail skill: ${skillRef}`);
    }

    const inputs = relativePaths.length > 0 ? relativePaths : ["SKILL.md"];
    const outputs: string[] = [];
    for (const input of inputs) {
      let target: { absolutePath: string; displayPath: string };
      try {
        target = resolveDetailTarget(skillDir, input);
      } catch (err) {
        this.fail(err instanceof Error ? err.message : `Invalid detail path: ${input}`);
      }
      let content: string;
      try {
        content = await readFile(target.absolutePath, "utf8");
      } catch (err) {
        const code = err && typeof err === "object" ? (err as { code?: string }).code : undefined;
        if (code === "ENOENT") {
          this.fail(`detail file not found: ${target.displayPath}`);
        }
        this.fail(`detail cannot read file: ${target.displayPath}`);
      }
      outputs.push(inputs.length === 1 ? content : `===== ${target.displayPath} =====\n${content}`);
    }
    process.stdout.write(outputs.join("\n\n"));
  }
}

/**
 * 验证技能命令
 */
export class ValidateCommand extends BaseCommand {
  readonly name = "validate";
  readonly description = "Validate a version";

  async execute(context: CommandContext): Promise<void> {
    const [skillID, version] = context.args;

    if (!skillID || !version) {
      this.fail("Usage: skuare validate <skillID> <version>");
    }

    await callApi({
      method: "POST",
      path: `/api/v1/skills/${encodeURIComponent(skillID)}/${encodeURIComponent(version)}/validate`,
      server: context.server,
    });
  }
}
