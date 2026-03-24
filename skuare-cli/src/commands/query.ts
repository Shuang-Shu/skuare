/**
 * 技能查询命令（读操作）
 */

import type { CommandContext } from "./types";
import { BaseCommand } from "./base";
import type { JsonValue } from "./types";
import { lstat, mkdir, readFile, readdir, readlink, rm, stat, symlink, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { resolveToolSkillsDir } from "../config/resolver";
import { findNearestWorkspaceRepo } from "../config/resolver";
import { collectPositionalArgs, parseRegexOption, stripRegexOptions } from "../utils/command_args";
import { resolveInstallTargetRoot, resolvePrimaryTool } from "../utils/install_paths";
import { parseSkillFrontmatter } from "../utils/skill_manifest";
import { compareVersions } from "../utils/versioning";
import { DetailAgentsMDCommand, GetAgentsMDCommand, ListAgentsMDCommand, PeekAgentsMDCommand } from "./agentsmd";
import { normalizeResourceContext } from "./resource_type";
import type { RegistryFile, RegistrySkillDetail, RegistrySkillEntry } from "../registry/types";

type RemoteFile = { path: string; content: Buffer };
type InstallResult = { skills: string[]; conflictFiles: string[] };
type InstallTargetPlan = { targetRoot: string; tools: string[] };
type InstallStrategy = "copy" | "slink";
type NormalizedSkillItem = {
  id: string;
  name: string;
  author: string;
  skill_id: string;
  version: string;
  description: string;
};
type ParsedSkillSelectorInput =
  | { type: "author-name"; author: string; name: string; version?: string }
  | { type: "name-only"; name: string; version?: string };
export type SkillSelectionCandidate = {
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
  name: string;
  author: string;
  description: string;
  skillDir: string;
  installRoot: string;
  metadata?: WrapMetadata;
  dependencies: DependencyRef[];
};
type RemovePlan = {
  removed: LocalInstalledSkill[];
  keptSharedDependencies: LocalInstalledSkill[];
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

function parseMetadataAuthorFromRegistryFiles(files: RegistryFile[]): string {
  for (const file of files) {
    if (normalizePath(file.path) !== "SKILL.md") {
      continue;
    }
    return file.encoding === "base64"
      ? parseSkillFrontmatter(Buffer.from(file.content, "base64").toString("utf8")).metadataAuthor
      : parseSkillFrontmatter(file.content).metadataAuthor;
  }
  return "";
}

function parseSkillIdentityFromRemoteFiles(files: RemoteFile[]): { name: string; author: string } {
  const skillFile = files.find((file) => normalizePath(file.path) === "SKILL.md");
  if (!skillFile) {
    return { name: "", author: "" };
  }
  const parsed = parseSkillFrontmatter(decodeRemoteTextFile(skillFile, "SKILL.md"));
  return {
    name: parsed.name,
    author: parsed.metadataAuthor,
  };
}

function decodeRemoteFileJsonContent(file: Record<string, JsonValue>): string {
  const encoding = String(file.encoding || "").trim().toLowerCase();
  const content = String(file.content || "");
  if (encoding === "base64") {
    return Buffer.from(content, "base64").toString("utf8");
  }
  return content;
}

function decodeRemoteTextFile(file: RemoteFile, sourceLabel: string): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(file.content);
  } catch {
    throw new Error(`Expected UTF-8 text file in ${sourceLabel}: ${file.path}`);
  }
}

function buffersEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
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

function normalizeSkillEntries(items: RegistrySkillEntry[]): NormalizedSkillItem[] {
  return items
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
        skill_id: skillID,
        version,
        description: String(x.description || "").trim(),
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

async function pathExists(candidate: string): Promise<boolean> {
  try {
    await stat(candidate);
    return true;
  } catch {
    return false;
  }
}

function isInteractiveTTY(): boolean {
  return !!process.stdin.isTTY && !!process.stdout.isTTY;
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

export abstract class SkillCatalogCommand extends BaseCommand {
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
    return normalizeSkillEntries(await (await this.getBackend(context)).listSkills());
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
    return this.selectCatalogSkillCandidate(matched, options.selectionTitle);
  }

  protected async resolveCatalogSkillCandidate(
    context: CommandContext,
    input: string,
    explicitVersion: string | undefined,
    options: {
      allowMissingFallback?: boolean;
      selectionTitle: string;
      notFoundMessage: (input: string) => string;
      includeSelectedVersion?: boolean;
    }
  ): Promise<SkillSelectionCandidate> {
    const parsed = withExplicitSelectorVersion(parseSkillSelectorInput(input), explicitVersion);
    return this.resolveSkillCandidate(
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
    const selected = await this.resolveCatalogSkillCandidate(context, input, explicitVersion, options);
    return {
      skillID: selected.skillID,
      version: parsed.version || (options.includeSelectedVersion ? selected.version || undefined : undefined),
    };
  }

  protected sortSkillSelectionCandidates(candidates: SkillSelectionCandidate[]): SkillSelectionCandidate[] {
    return [...candidates].sort((a, b) => {
      const left = `${a.skillID}@${a.version}`;
      const right = `${b.skillID}@${b.version}`;
      return left.localeCompare(right);
    });
  }

  protected async selectCatalogSkillCandidate(
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
    const backend = await this.getBackend(resourceContext.context);
    const normalizedItems = normalizeSkillEntries(await backend.listSkills(q || ""));
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
    const backend = await this.getBackend(context);
    if (version) {
      const row = await backend.getSkillVersion(skillID, version);
      const skillIDRaw = row.skill_id.trim() || skillID;
      const versionRaw = row.version.trim() || version;
      const nameRaw = row.name.trim();
      const authorRaw = row.author.trim() || parseMetadataAuthorFromRegistryFiles(row.files);
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
        skill_id: row.skill_id || skillIDRaw,
        version: row.version || versionRaw,
      };
      out.description = row.description;
      out.files = row.files as unknown as JsonValue;
      out.path = row.path;
      out.updated_at = row.updated_at;
      console.log(JSON.stringify(out, null, 2));
      return;
    }

    const row = await backend.getSkillOverview(skillID);
    const skillIDRaw = row.skill_id.trim() || skillID;
    const versionsRaw = row.versions;
    const latestVersion = versionsRaw.length > 0 ? versionsRaw[versionsRaw.length - 1] : "";
    const authorRaw = row.author.trim();
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
      skill_id: row.skill_id || skillIDRaw,
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

  protected resolveLocalSkillRepoRoot(): string {
    return resolve(__dirname, "..", "..", "..");
  }

  protected async resolveLocalSkillSourceDir(skillID: string): Promise<string> {
    const repoRoot = this.resolveLocalSkillRepoRoot();
    const skillName = skillID.split("/").pop()?.trim() || skillID.trim();
    const searchRoots = [
      join(repoRoot, ".codex", "skills"),
      join(repoRoot, "skills"),
      join(repoRoot, "examples"),
    ];
    const existingRoots = (
      await Promise.all(searchRoots.map(async (root) => await pathExists(root) ? root : ""))
    ).filter(Boolean);

    const exactMatches = await this.collectLocalSkillSourceMatches(existingRoots.map((root) => join(root, normalizePath(skillID))));
    if (exactMatches.length === 1) {
      return exactMatches[0];
    }
    if (exactMatches.length > 1) {
      this.fail(`Multiple local skill directories matched ${skillID}: ${exactMatches.join(", ")}`);
    }

    const fallbackMatches = await this.collectLocalSkillSourceMatches(existingRoots.map((root) => join(root, skillName)));
    if (fallbackMatches.length === 1) {
      return fallbackMatches[0];
    }
    if (fallbackMatches.length > 1) {
      this.fail(`Multiple local skill directories matched ${skillID} by name ${skillName}: ${fallbackMatches.join(", ")}`);
    }

    this.fail(`No local skill directory found for ${skillID} under ${existingRoots.join(", ") || repoRoot}`);
  }

  private async collectLocalSkillSourceMatches(candidates: string[]): Promise<string[]> {
    const matches: string[] = [];
    for (const candidate of candidates) {
      if (await isSkillDir(candidate)) {
        matches.push(resolve(candidate));
      }
    }
    return Array.from(new Set(matches)).sort((a, b) => a.localeCompare(b));
  }

  protected resolveInstallTargets(context: CommandContext, isGlobal: boolean): InstallTargetPlan[] {
    const configuredTools = Array.from(new Set((context.llmTools || []).map((value) => value.trim()).filter(Boolean)));
    const tools = configuredTools.length > 0 ? configuredTools : [this.resolvePrimaryTool(context.llmTools)];
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
      parsed = JSON.parse(decodeRemoteTextFile(depFile, sourceLabel)) as unknown;
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
    const versions = (await (await this.getBackend(context)).getSkillOverview(skillID)).versions;
    if (versions.length === 0) {
      this.fail(`No versions found for skill: ${skillID}`);
    }
    return versions[versions.length - 1];
  }

  protected async fetchRemoteSkillNode(context: CommandContext, skillID: string, preferredVersion?: string): Promise<SkillGraphNode> {
    const version = await this.resolveVersion(context, skillID, preferredVersion);
    const row: RegistrySkillDetail = await (await this.getBackend(context)).getSkillVersion(skillID, version);
    const filesRaw = row.files;
    const files: RemoteFile[] = [];
    for (const entry of filesRaw) {
      const path = String(entry.path || "").trim();
      if (!path) {
        continue;
      }
      const encoding = String(entry.encoding || "").trim().toLowerCase();
      const content = String(entry.content || "");
      files.push({
        path,
        content: encoding === "base64"
          ? Buffer.from(content, "base64")
          : Buffer.from(content, "utf8"),
      });
    }
    if (files.length === 0) {
      this.fail(`Skill ${skillID}@${version} does not contain downloadable files`);
    }
    const skillFile = files.find((file) => normalizePath(file.path) === "SKILL.md");
    const metadata = skillFile ? parseSkillFrontmatter(decodeRemoteTextFile(skillFile, `${skillID}@${version}`)) : { name: "", description: "", metadataVersion: "", metadataAuthor: "" };
    return {
      skillID: row.skill_id.trim() || skillID,
      version: row.version.trim() || version,
      description: row.description.trim() || metadata.description,
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
      let oldContent: Buffer | undefined;
      try {
        oldContent = await readFile(dest);
      } catch (err) {
        if (!(err && typeof err === "object" && (err as { code?: string }).code === "ENOENT")) {
          throw err;
        }
      }
      if (oldContent && buffersEqual(oldContent, file.content)) {
        continue;
      }
      if (options?.sharedLocalDir && oldContent !== undefined) {
        conflicts.push(normalizePath(join(skillID, rel)));
      }
      await writeFile(dest, file.content);
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

  protected async installGraphNodesAsSymlinks(
    targetRoot: string,
    nodes: SkillGraphNode[],
  ): Promise<InstallResult> {
    const installed = new Set<string>();
    for (const node of nodes) {
      const sourceDir = await this.resolveLocalSkillSourceDir(node.skillID);
      await this.ensureSkillSymlink(targetRoot, node.skillID, sourceDir);
      installed.add(node.skillID);
    }
    return {
      skills: Array.from(installed),
      conflictFiles: [],
    };
  }

  private async ensureSkillSymlink(targetRoot: string, skillID: string, sourceDir: string): Promise<void> {
    const skillDir = join(targetRoot, skillID);
    const expectedTarget = resolve(sourceDir);
    await mkdir(dirname(skillDir), { recursive: true });
    const existing = await lstat(skillDir).catch(() => undefined);
    if (!existing) {
      await symlink(expectedTarget, skillDir);
      return;
    }
    if (!existing.isSymbolicLink()) {
      this.fail(`Install target already exists and is not a symlink: ${skillDir}`);
    }
    const currentTarget = resolve(dirname(skillDir), await readlink(skillDir));
    if (currentTarget !== expectedTarget) {
      this.fail(`Install target symlink mismatch for ${skillDir}: ${currentTarget} != ${expectedTarget}`);
    }
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
    const skillMeta = parseSkillFrontmatter(skillContent);
    const metadata = await this.readWrapMetadata(skillDir);
    const lockPath = join(skillDir, "skill-deps.lock.json");
    const plainPath = join(skillDir, "skill-deps.json");
    const files: RemoteFile[] = [{ path: "SKILL.md", content: Buffer.from(skillContent, "utf8") }];

    const lockInfo = await stat(lockPath).catch(() => undefined);
    if (lockInfo?.isFile()) {
      files.push({ path: "skill-deps.lock.json", content: Buffer.from(await readFile(lockPath, "utf8"), "utf8") });
    }
    const plainInfo = await stat(plainPath).catch(() => undefined);
    if (plainInfo?.isFile()) {
      files.push({ path: "skill-deps.json", content: Buffer.from(await readFile(plainPath, "utf8"), "utf8") });
    }

    return {
      skillID,
      version: skillMeta.metadataVersion,
      name: skillMeta.name,
      author: skillMeta.metadataAuthor,
      description: skillMeta.description,
      skillDir,
      installRoot: root,
      metadata: metadata || undefined,
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
        let oldContent: Buffer | undefined;
        try {
          oldContent = await readFile(dest);
        } catch (err) {
          if (!(err && typeof err === "object" && (err as { code?: string }).code === "ENOENT")) {
            throw err;
          }
        }
        if (oldContent === undefined) {
          addedFiles.push(rel);
        } else if (!buffersEqual(oldContent, file.content)) {
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
    const files: RemoteFile[] = [{ path: "SKILL.md", content: Buffer.from(skillContent, "utf8") }];
    const lockPath = join(rootDir, "skill-deps.lock.json");
    const plainPath = join(rootDir, "skill-deps.json");

    const lockInfo = await stat(lockPath).catch(() => undefined);
    if (lockInfo?.isFile()) {
      files.push({ path: "skill-deps.lock.json", content: Buffer.from(await readFile(lockPath, "utf8"), "utf8") });
    }
    const plainInfo = await stat(plainPath).catch(() => undefined);
    if (plainInfo?.isFile()) {
      files.push({ path: "skill-deps.json", content: Buffer.from(await readFile(plainPath, "utf8"), "utf8") });
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

  protected async readLocalInstalledSkill(skillDir: string, installRoot: string): Promise<LocalInstalledSkill> {
    const descriptor = await this.loadLocalRootDescriptor(skillDir);
    const skillFile = descriptor.files.find((file) => normalizePath(file.path) === "SKILL.md");
    const parsed = parseSkillFrontmatter(skillFile ? decodeRemoteTextFile(skillFile, skillDir) : "");
    const localSkillID = normalizePath(relative(installRoot, descriptor.rootDir));
    const display = buildDisplayIdentity({
      skillID: localSkillID,
      version: descriptor.rootVersion,
      name: parsed.name,
      author: parsed.metadataAuthor,
    });
    return {
      skillID: localSkillID,
      version: descriptor.rootVersion,
      name: display.name,
      author: display.author,
      description: descriptor.description,
      skillDir: descriptor.rootDir,
      installRoot,
      metadata: descriptor.metadata,
      dependencies: descriptor.dependencies,
    };
  }

  protected async collectInstalledSkills(installRoot: string): Promise<LocalInstalledSkill[]> {
    const rootInfo = await stat(installRoot).catch(() => undefined);
    if (!rootInfo?.isDirectory()) {
      return [];
    }
    const skillDirs = await collectSkillDirs(installRoot);
    const loaded = await Promise.all(skillDirs.map((skillDir) => this.readLocalInstalledSkill(skillDir, installRoot)));
    return loaded.sort((a, b) => {
      const left = `${a.skillID}@${a.version}`;
      const right = `${b.skillID}@${b.version}`;
      return left.localeCompare(right);
    });
  }

  protected createLocalSkillCandidates(skills: LocalInstalledSkill[]): SkillSelectionCandidate[] {
    return skills.map((skill) => this.createSkillSelectionCandidate({
      skillID: skill.skillID,
      version: skill.version,
      name: skill.name,
      author: skill.author,
      description: [
        skill.description,
        skill.metadata ? "wrap root" : "",
      ].filter(Boolean).join(" | "),
    }));
  }

  protected async selectLocalSkills(
    installRoot: string,
    input: string
  ): Promise<LocalInstalledSkill[]> {
    const installed = await this.collectInstalledSkills(installRoot);
    if (installed.length === 0) {
      return [];
    }

    const trimmed = input.trim();
    const exact = installed.find((skill) => skill.skillID === trimmed);
    if (exact) {
      return [exact];
    }

    const parsed = parseSkillSelectorInput(trimmed);
    const candidates = this.createLocalSkillCandidates(installed);
    const matched = this.sortSkillSelectionCandidates(
      candidates.filter((candidate) => matchesSkillSelectorCandidate(parsed, candidate, { matchVersion: true }))
    );
    if (matched.length === 0) {
      return [];
    }
    if (matched.length === 1) {
      const target = installed.find((skill) => skill.skillID === matched[0].skillID);
      return target ? [target] : [];
    }
    if (!isInteractiveTTY()) {
      this.fail(`Multiple installed skills match ${input} in ${installRoot}; interactive removal requires a TTY`);
    }
    const { selectSkillsWithScroll } = await import("../ui/selectors.js");
    const selected = await selectSkillsWithScroll(
      matched.map((item) => ({
        skillID: item.skillID,
        version: item.version,
        description: item.description,
      })),
      "Multiple installed skills found, select one or more to remove (use ↑/↓, Space to toggle, Enter to confirm):"
    );
    const selectedKeys = new Set(selected.map((item) => formatNodeKey(item.skillID, item.version)));
    return installed.filter((skill) => selectedKeys.has(formatNodeKey(skill.skillID, skill.version)));
  }

  protected buildLocalDependencyIndexes(installed: LocalInstalledSkill[]): {
    skillsByID: Map<string, LocalInstalledSkill>;
    childrenByID: Map<string, Set<string>>;
    parentsByID: Map<string, Set<string>>;
  } {
    const skillsByID = new Map(installed.map((skill) => [skill.skillID, skill]));
    const childrenByID = new Map<string, Set<string>>();
    const parentsByID = new Map<string, Set<string>>();

    for (const skill of installed) {
      const children = new Set<string>();
      for (const dep of skill.dependencies) {
        if (!skillsByID.has(dep.skillID)) {
          continue;
        }
        children.add(dep.skillID);
        const parents = parentsByID.get(dep.skillID) || new Set<string>();
        parents.add(skill.skillID);
        parentsByID.set(dep.skillID, parents);
      }
      childrenByID.set(skill.skillID, children);
    }

    return { skillsByID, childrenByID, parentsByID };
  }

  protected buildRemovePlan(installed: LocalInstalledSkill[], selectedSkillIDs: string[], removeDependencies: boolean): RemovePlan {
    const selectedSet = new Set(selectedSkillIDs);
    const { skillsByID, childrenByID, parentsByID } = this.buildLocalDependencyIndexes(installed);

    if (!removeDependencies) {
      return {
        removed: selectedSkillIDs.map((skillID) => skillsByID.get(skillID)).filter((skill): skill is LocalInstalledSkill => !!skill),
        keptSharedDependencies: [],
      };
    }

    const subtree = new Set<string>();
    const walk = (skillID: string) => {
      if (subtree.has(skillID)) {
        return;
      }
      subtree.add(skillID);
      for (const child of childrenByID.get(skillID) || []) {
        walk(child);
      }
    };
    for (const skillID of selectedSet) {
      if (skillsByID.has(skillID)) {
        walk(skillID);
      }
    }

    const removable = new Set<string>(selectedSet);
    let changed = true;
    while (changed) {
      changed = false;
      for (const skillID of subtree) {
        if (removable.has(skillID)) {
          continue;
        }
        const parents = parentsByID.get(skillID) || new Set<string>();
        const hasRetainedParent = Array.from(parents).some((parentID) => !removable.has(parentID));
        if (!hasRetainedParent) {
          removable.add(skillID);
          changed = true;
        }
      }
    }

    return {
      removed: Array.from(removable)
        .map((skillID) => skillsByID.get(skillID))
        .filter((skill): skill is LocalInstalledSkill => !!skill)
        .sort((a, b) => a.skillID.localeCompare(b.skillID)),
      keptSharedDependencies: Array.from(subtree)
        .filter((skillID) => !removable.has(skillID))
        .map((skillID) => skillsByID.get(skillID))
        .filter((skill): skill is LocalInstalledSkill => !!skill)
        .sort((a, b) => a.skillID.localeCompare(b.skillID)),
    };
  }

  protected async removeInstalledSkill(skill: LocalInstalledSkill): Promise<void> {
    await rm(skill.skillDir, { recursive: true, force: true });
    await this.pruneEmptyAncestorDirs(dirname(skill.skillDir), skill.installRoot);
  }

  private async pruneEmptyAncestorDirs(currentDir: string, stopDir: string): Promise<void> {
    let cursor = resolve(currentDir);
    const absoluteStop = resolve(stopDir);
    while (cursor.startsWith(absoluteStop) && cursor !== absoluteStop) {
      const entries = await readdir(cursor).catch(() => []);
      if (entries.length > 0) {
        return;
      }
      await rm(cursor, { recursive: false, force: true }).catch(() => undefined);
      cursor = dirname(cursor);
    }
  }
}

export class GetCommand extends DependencyAwareCommand {
  readonly name = "get";
  readonly description = "Install skill to local partial repository";

  private async resolveWorkspaceInstallBaseDir(context: CommandContext): Promise<string> {
    const workspaceRepo = await findNearestWorkspaceRepo(context.cwd);
    if (!workspaceRepo) {
      this.fail(`Workspace root not found from ${context.cwd} up to /. Run \`skr init\` in your project directory first, or pass \`--global\`.`);
    }
    if (workspaceRepo.isGlobalHomeRepo) {
      this.fail(`Found only global repo at ${workspaceRepo.repoDir}. Run \`skr init\` in your project directory first, or pass \`--global\`.`);
    }
    return workspaceRepo.workspaceRoot;
  }

  private async resolveGetInstallTargets(context: CommandContext, isGlobal: boolean): Promise<InstallTargetPlan[]> {
    const tools = Array.from(new Set((context.llmTools || []).map((value) => value.trim()).filter(Boolean)));
    const installBaseDir = isGlobal ? context.cwd : await this.resolveWorkspaceInstallBaseDir(context);
    const targets = new Map<string, string[]>();
    for (const tool of tools) {
      const targetRoot = this.resolveInstallTargetRoot(installBaseDir, tool, context.toolSkillDirs[tool], isGlobal);
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

  async execute(context: CommandContext): Promise<void> {
    const normalized = normalizeResourceContext(context);
    if (normalized.resourceType === "agentsmd") {
      await new GetAgentsMDCommand().execute(normalized.context);
      return;
    }

    const skillContext = normalized.context;
    const isGlobal = skillContext.args.includes("--global");
    const wrapMode = skillContext.args.includes("--wrap");
    const slinkMode = skillContext.args.includes("--slink");
    const regexPattern = parseRegexOption(skillContext.args);
    const positional = stripRegexOptions(skillContext.args).filter((arg) => arg !== "--global" && arg !== "--wrap" && arg !== "--slink");

    let skillID: string;
    let versionArg: string | undefined;

    if (regexPattern) {
      if (positional.length > 1) {
        this.fail("Usage: skuare get --rgx <pattern> [version] [--global] [--wrap] [--slink]");
      }
      skillID = await this.resolveSkillIDByRegex(skillContext, regexPattern);
      versionArg = positional[0];
    } else {
      const [input, version] = positional;
      if (!input) {
        this.fail("Missing <skillRef>. Usage: skuare get <skillID|name|author/name> [version] [--rgx <pattern>] [--global] [--wrap] [--slink]");
      }
      if (positional.length > 2) {
        this.fail("Usage: skuare get <skillID|name|author/name> [version] [--rgx <pattern>] [--global] [--wrap] [--slink]");
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

    const installTargets = await this.resolveGetInstallTargets(skillContext, isGlobal);
    const primaryTool = isGlobal
      ? installTargets.flatMap((entry) => entry.tools)[0] || this.resolvePrimaryTool(skillContext.llmTools)
      : this.resolvePrimaryTool(skillContext.llmTools);
    const installBaseDir = isGlobal ? skillContext.cwd : await this.resolveWorkspaceInstallBaseDir(skillContext);
    const primaryTargetRoot = installTargets[0]?.targetRoot || this.resolveInstallTargetRoot(
      installBaseDir,
      primaryTool,
      skillContext.toolSkillDirs[primaryTool],
      isGlobal
    );
    const rootNode = await this.fetchRemoteSkillNode(skillContext, skillID, versionArg);
    const graph = await this.buildDependencyGraph(skillContext, rootNode);
    const sharedLocalDir = false;
    const installStrategy: InstallStrategy = slinkMode ? "slink" : "copy";
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
      const result = installStrategy === "slink"
        ? await this.installGraphNodesAsSymlinks(installTarget.targetRoot, nodesToInstall)
        : await this.installGraphNodes(installTarget.targetRoot, nodesToInstall, { sharedLocalDir });
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
      slink: slinkMode,
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

export class RemoveCommand extends DependencyAwareCommand {
  readonly name = "remove";
  readonly description = "Remove installed skill from local repository";

  async execute(context: CommandContext): Promise<void> {
    const normalized = normalizeResourceContext(context);
    if (normalized.resourceType === "agentsmd") {
      this.fail("remove does not support AGENTS.md. Use delete for remote records.");
    }

    const skillContext = normalized.context;
    const isGlobal = skillContext.args.includes("--global");
    const removeDependencies = skillContext.args.includes("--deps");
    const positional = skillContext.args.filter((arg) => arg !== "--global" && arg !== "--deps");
    const [input] = positional;
    if (!input || positional.length !== 1) {
      this.fail("Usage: skuare remove <skillID|name|author/name> [--global] [--deps]");
    }

    const installTargets = this.resolveInstallTargets(skillContext, isGlobal);
    const targetResults: Array<{
      target: string;
      tools: string[];
      removed: string[];
      kept_shared_dependencies: string[];
      missing: boolean;
    }> = [];
    const removedSkills = new Set<string>();
    const keptSharedDependencies = new Set<string>();

    for (const installTarget of installTargets) {
      const selected = await this.selectLocalSkills(installTarget.targetRoot, input);
      if (selected.length === 0) {
        targetResults.push({
          target: installTarget.targetRoot,
          tools: installTarget.tools,
          removed: [],
          kept_shared_dependencies: [],
          missing: true,
        });
        continue;
      }

      const installed = await this.collectInstalledSkills(installTarget.targetRoot);
      const plan = this.buildRemovePlan(installed, selected.map((skill) => skill.skillID), removeDependencies);
      for (const skill of plan.removed) {
        await this.removeInstalledSkill(skill);
        removedSkills.add(skill.skillID);
      }
      for (const skill of plan.keptSharedDependencies) {
        keptSharedDependencies.add(skill.skillID);
      }
      targetResults.push({
        target: installTarget.targetRoot,
        tools: installTarget.tools,
        removed: plan.removed.map((skill) => skill.skillID),
        kept_shared_dependencies: plan.keptSharedDependencies.map((skill) => skill.skillID),
        missing: false,
      });
    }

    console.log(JSON.stringify({
      global: isGlobal,
      deps: removeDependencies,
      input,
      llm_tool: isGlobal
        ? installTargets.flatMap((entry) => entry.tools)[0] || this.resolvePrimaryTool(skillContext.llmTools)
        : this.resolvePrimaryTool(skillContext.llmTools),
      llm_tools: installTargets.flatMap((entry) => entry.tools),
      targets: targetResults,
      removed: Array.from(removedSkills).sort((a, b) => a.localeCompare(b)),
      kept_shared_dependencies: Array.from(keptSharedDependencies).sort((a, b) => a.localeCompare(b)),
    }, null, 2));
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

    console.log(JSON.stringify(await (await this.getBackend(context)).validateSkill(skillID, version), null, 2));
  }
}
