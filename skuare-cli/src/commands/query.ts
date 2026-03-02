/**
 * 技能查询命令（读操作）
 */

import type { CommandContext } from "./types";
import { BaseCommand } from "./base";
import { callApi } from "../http/client";
import type { JsonValue } from "./types";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { homedir } from "node:os";
import { resolveToolSkillsDir } from "../config/resolver";

type RemoteFile = { path: string; content: string };
type InstallResult = { skills: string[]; conflictFiles: string[] };
type NormalizedSkillItem = {
  id: string;
  name: string;
  author: string;
  skill_id: JsonValue;
  version: JsonValue;
  description: JsonValue;
};

function normalizePath(input: string): string {
  return input.replace(/\\/g, "/").replace(/^\.\/+/, "");
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
    const content = String(file.content || "");
    const lines = content.split(/\r?\n/);
    if (lines[0]?.trim() !== "---") {
      continue;
    }
    let fmEnd = -1;
    for (let i = 1; i < lines.length; i += 1) {
      if (lines[i].trim() === "---") {
        fmEnd = i;
        break;
      }
    }
    if (fmEnd < 0) {
      continue;
    }
    let metadataIndent = -1;
    for (const rawLine of lines.slice(1, fmEnd)) {
      const line = rawLine.trim();
      const indent = rawLine.length - rawLine.trimStart().length;
      if (line === "metadata:") {
        metadataIndent = indent;
        continue;
      }
      if (metadataIndent >= 0) {
        if (line && indent <= metadataIndent) {
          metadataIndent = -1;
          continue;
        }
        if (line.startsWith("author:")) {
          return unquoteYaml(line.slice("author:".length).trim());
        }
      }
    }
  }
  return "";
}

function unquoteYaml(v: string): string {
  if ((v.startsWith("\"") && v.endsWith("\"")) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1).trim();
  }
  return v.trim();
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

function stripOptionsWithValues(args: string[], options: string[]): string[] {
  const set = new Set(options);
  const out: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    if (set.has(args[i])) {
      i += 1;
      continue;
    }
    out.push(args[i]);
  }
  return out;
}

function parseOptionValue(args: string[], option: string): string | undefined {
  const idx = args.indexOf(option);
  if (idx < 0) {
    return undefined;
  }
  const value = args[idx + 1];
  if (!value) {
    throw new Error(`Missing value for ${option}`);
  }
  return value;
}

function parseRegexOption(args: string[]): string | undefined {
  return parseOptionValue(args, "--rgx") || parseOptionValue(args, "--regex");
}

function stripRegexOptions(args: string[]): string[] {
  return stripOptionsWithValues(args, ["--rgx", "--regex"]);
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

/**
 * 列出技能命令
 */
export class ListCommand extends BaseCommand {
  readonly name = "list";
  readonly description = "List skills (GET /api/v1/skills)";

  async execute(context: CommandContext): Promise<void> {
    const q = this.parseOptionValue(context.args, "--q");
    const regexPattern = parseRegexOption(context.args);
    const regex = regexPattern ? this.compileRegex(regexPattern) : undefined;
    const path = q ? `/api/v1/skills?q=${encodeURIComponent(q)}` : "/api/v1/skills";

    const resp = await callApi({
      method: "GET",
      path,
      server: context.server,
      silent: true,
    });

    const itemsRaw = (resp.data && typeof resp.data === "object" && !Array.isArray(resp.data))
      ? (resp.data as { items?: JsonValue }).items
      : undefined;
    const items = Array.isArray(itemsRaw) ? itemsRaw : [];
    const normalized = normalizeListItems(items);
    const filtered = regex ? normalized.filter((item) => matchesSkill(regex, item)) : normalized;

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
export class PeekCommand extends BaseCommand {
  readonly name = "peek";
  readonly description = "Peek skill overview/detail";

  async execute(context: CommandContext): Promise<void> {
    const regexPattern = parseRegexOption(context.args);
    const positional = stripRegexOptions(context.args);
    let [skillID, version] = positional;

    if (regexPattern) {
      if (positional.length > 1) {
        this.fail("Usage: skuare peek --rgx <pattern> [version]");
      }
      skillID = await this.resolveSkillIDByRegex(context, regexPattern);
      version = positional[0];
    }

    if (!skillID) {
      this.fail("Missing <skillID>. Usage: skuare peek <skillID> [version] | skuare peek --rgx <pattern> [version]");
    }

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

  private compileRegex(pattern: string): RegExp {
    try {
      return new RegExp(pattern);
    } catch {
      this.fail(`Invalid regex pattern: ${pattern}`);
    }
  }

  private async resolveSkillIDByRegex(context: CommandContext, pattern: string): Promise<string> {
    const regex = this.compileRegex(pattern);
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
    const matched = normalizeListItems(items).filter((item) => matchesSkill(regex, item));
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
}

export class GetCommand extends BaseCommand {
  readonly name = "get";
  readonly description = "Install skill to local partial repository";

  async execute(context: CommandContext): Promise<void> {
    const isGlobal = context.args.includes("--global");
    const regexPattern = parseRegexOption(context.args);
    const positional = stripOptionsWithValues(stripRegexOptions(context.args), []).filter(arg => arg !== "--global");
    let [skillID, versionArg] = positional;
    if (regexPattern) {
      if (positional.length > 1) {
        this.fail("Usage: skuare get --rgx <pattern> [version] [--global]");
      }
      skillID = await this.resolveSkillIDByRegex(context, regexPattern);
      versionArg = positional[0];
    }
    if (!skillID) {
      this.fail("Missing <skillID>. Usage: skuare get <skillID> [version] [--rgx <pattern>] [--global]");
    }
    if (positional.length > 2) {
      this.fail("Usage: skuare get <skillID> [version] [--rgx <pattern>] [--global]");
    }
    const tool = this.resolveTargetTool(context.llmTools);
    const targetRoot = this.resolveInstallTargetRoot(context.cwd, tool, isGlobal);
    const sharedLocalDir = false;
    const result = await this.installWithDependencies(context, targetRoot, skillID, versionArg, { sharedLocalDir });
    if (sharedLocalDir && result.conflictFiles.length > 0) {
      console.log(
        `${this.yellow("[WARN]")} local mode shared repository detected, overwrite ${result.conflictFiles.length} file(s) during install`
      );
    }
    console.log(JSON.stringify({
      global: isGlobal,
      llm_tool: tool,
      target: targetRoot,
      shared_local_dir: sharedLocalDir,
      conflicts: result.conflictFiles.sort((a, b) => a.localeCompare(b)),
      skills: result.skills.sort((a, b) => a.localeCompare(b)),
    }, null, 2));
  }

  private compileRegex(pattern: string): RegExp {
    try {
      return new RegExp(pattern);
    } catch {
      this.fail(`Invalid regex pattern: ${pattern}`);
    }
  }

  private async resolveSkillIDByRegex(context: CommandContext, pattern: string): Promise<string> {
    const regex = this.compileRegex(pattern);
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
    const matched = normalizeListItems(items).filter((item) => matchesSkill(regex, item));
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
    const resolvedSkillID = String(matched[0].skill_id || "").trim();
    if (!resolvedSkillID) {
      this.fail(`Matched skill has empty skill_id for regex: ${pattern}`);
    }
    return resolvedSkillID;
  }

  private resolveTargetTool(llmTools: string[]): string {
    const first = (llmTools || []).map((v) => v.trim()).find(Boolean);
    if (!first) {
      this.fail("No llmTools configured. Run `skr init` and select at least one tool");
    }
    return first;
  }

  private resolveInstallTargetRoot(cwd: string, tool: string, isGlobal: boolean): string {
    return isGlobal 
      ? join(homedir(), `.${tool}`, "skills")
      : join(cwd, `.${tool}`, "skills");
  }

  private async installWithDependencies(
    context: CommandContext,
    targetRoot: string,
    rootSkill: string,
    versionArg?: string,
    options?: { sharedLocalDir: boolean }
  ): Promise<InstallResult> {
    const queue: string[] = [rootSkill];
    const installed = new Set<string>();
    const visiting = new Set<string>();
    const conflicts = new Set<string>();
    const sharedLocalDir = options?.sharedLocalDir === true;

    while (queue.length > 0) {
      const skill = queue.shift() as string;
      if (installed.has(skill)) {
        continue;
      }
      if (visiting.has(skill)) {
        continue;
      }
      visiting.add(skill);

      const version = await this.resolveVersion(context, skill, skill === rootSkill ? versionArg : undefined);
      const files = await this.fetchRemoteFiles(context, skill, version);
      const deps = this.parseDependenciesFromFiles(files);

      const changed = await this.writeSkillFiles(targetRoot, skill, files, { sharedLocalDir });
      for (const path of changed) {
        conflicts.add(path);
      }
      installed.add(skill);
      visiting.delete(skill);

      for (const dep of deps) {
        if (!installed.has(dep)) {
          queue.push(dep);
        }
      }
    }

    return { skills: Array.from(installed), conflictFiles: Array.from(conflicts) };
  }

  private async resolveVersion(context: CommandContext, skillID: string, preferred?: string): Promise<string> {
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

  private async fetchRemoteFiles(context: CommandContext, skillID: string, version: string): Promise<RemoteFile[]> {
    const resp = await callApi({
      method: "GET",
      path: `/api/v1/skills/${encodeURIComponent(skillID)}/${encodeURIComponent(version)}`,
      server: context.server,
      silent: true,
    });
    const data = (resp.data && typeof resp.data === "object" && !Array.isArray(resp.data))
      ? (resp.data as { files?: JsonValue }).files
      : undefined;
    const rows = Array.isArray(data) ? data : [];
    const files: RemoteFile[] = [];
    for (const row of rows) {
      if (!row || typeof row !== "object" || Array.isArray(row)) {
        continue;
      }
      const obj = row as Record<string, JsonValue>;
      const path = String(obj.path || "").trim();
      const content = String(obj.content || "");
      if (!path) {
        continue;
      }
      files.push({ path, content });
    }
    if (files.length === 0) {
      this.fail(`Skill ${skillID}@${version} does not contain downloadable files`);
    }
    return files;
  }

  private parseDependenciesFromFiles(files: RemoteFile[]): string[] {
    const lock = files.find((f) => normalizePath(f.path) === "skill-deps.lock.json");
    const plain = files.find((f) => normalizePath(f.path) === "skill-deps.json");
    const depFile = lock || plain;
    if (!depFile) {
      return [];
    }
    const parsed = JSON.parse(depFile.content) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return [];
    }
    const deps = (parsed as { dependencies?: unknown }).dependencies;
    if (!Array.isArray(deps)) {
      return [];
    }
    return deps
      .map((row) => (row && typeof row === "object" ? String((row as { skill?: unknown }).skill || "").trim() : ""))
      .filter(Boolean);
  }

  private async writeSkillFiles(
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
}

export class DetailCommand extends BaseCommand {
  readonly name = "detail";
  readonly description = "Show local skill file contents";

  async execute(context: CommandContext): Promise<void> {
    const [skillRef, ...relativePaths] = context.args;
    if (!skillRef) {
      this.fail("Usage: skuare detail <skillName|skillID> [relativePath...]");
    }
    let skillDir: string;
    try {
      ({ skillDir } = await resolveDetailSkillDir(context, skillRef));
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
