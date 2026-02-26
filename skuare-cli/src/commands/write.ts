/**
 * 技能写操作命令
 */

import type { CommandContext, JsonValue } from "./types";
import { BaseCommand } from "./base";
import { callApi } from "../http/client";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, posix, relative, resolve } from "node:path";
import * as readlinePromises from "node:readline/promises";

type ReadlineInterface = Awaited<ReturnType<typeof readlinePromises.createInterface>>;

type CreateSource =
  | { kind: "json"; path: string }
  | { kind: "skill"; path: string }
  | { kind: "dir"; path: string };

type SkillDependency = {
  skill: string;
  version: string;
};

/**
 * 创建技能命令
 */
export class CreateCommand extends BaseCommand {
  readonly name = "create";
  readonly description = "Create skill version";

  async execute(context: CommandContext): Promise<void> {
    const sources = await this.resolveCreateSources(context.args, context.cwd);
    for (const source of sources) {
      if (source.kind !== "json") {
        await this.uploadDependencies(source, context);
      }
      const body = source.kind === "json"
        ? (await this.readJsonFile(source.path) as JsonValue)
        : (await this.buildRequestFromSkillSource(context.args, source) as JsonValue);

      try {
        const resp = await callApi({
          method: "POST",
          path: "/api/v1/skills",
          body,
          server: context.server,
          localMode: context.localMode,
          auth: context.auth,
          silent: true,
        });
        this.printCreateResult(resp.data);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!this.isAlreadyExistsError(msg)) {
          throw err;
        }
        const info = this.extractSkillVersion(body);
        console.log(`${this.yellow("[WARN]")} skill version already exists: ${info.skillID}@${info.version}`);
      }
    }
  }

  private async uploadDependencies(source: Exclude<CreateSource, { kind: "json" }>, context: CommandContext): Promise<void> {
    const sourceDir = source.kind === "skill" ? dirname(resolve(source.path)) : resolve(source.path);
    const skillsRoot = dirname(sourceDir);
    const deps = await this.readDependencies(sourceDir);
    const uploaded = new Set<string>();
    const visiting = new Set<string>();
    for (const dep of deps) {
      await this.uploadOneDependency(dep, skillsRoot, context, uploaded, visiting);
    }
  }

  private async uploadOneDependency(
    dep: SkillDependency,
    skillsRoot: string,
    context: CommandContext,
    uploaded: Set<string>,
    visiting: Set<string>
  ): Promise<void> {
    const key = `${dep.skill}@${dep.version}`;
    if (uploaded.has(key)) {
      return;
    }
    if (visiting.has(key)) {
      this.fail(`Dependency cycle detected at ${key}`);
    }
    visiting.add(key);

    const depDir = join(skillsRoot, dep.skill);
    await this.assertSkillDir(depDir);
    const depSkillRaw = await readFile(join(depDir, "SKILL.md"), "utf8");
    const depParsed = this.parseSkillMarkdown(depSkillRaw);
    if (depParsed.version !== dep.version) {
      this.fail(`Dependency version mismatch for ${dep.skill}: deps=${dep.version}, SKILL.md=${depParsed.version}`);
    }

    const transitive = await this.readDependencies(depDir);
    for (const child of transitive) {
      await this.uploadOneDependency(child, skillsRoot, context, uploaded, visiting);
    }

    const depBody = await this.buildRequestFromSkillSource([], { kind: "dir", path: depDir });
    try {
      await callApi({
        method: "POST",
        path: "/api/v1/skills",
        body: depBody,
        server: context.server,
        localMode: context.localMode,
        auth: context.auth,
        silent: true,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!this.isAlreadyExistsError(msg)) {
        throw err;
      }
    }

    visiting.delete(key);
    uploaded.add(key);
  }

  private async readDependencies(skillDir: string): Promise<SkillDependency[]> {
    const depFile = join(skillDir, "skill-deps.json");
    const info = await stat(depFile).catch(() => undefined);
    if (!info?.isFile()) {
      return [];
    }
    const raw = await readFile(depFile, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      this.fail(`Invalid dependency file: ${depFile}`);
    }
    const depsRaw = (parsed as { dependencies?: unknown }).dependencies;
    if (depsRaw === undefined) {
      return [];
    }
    if (!Array.isArray(depsRaw)) {
      this.fail(`Invalid dependencies format in ${depFile}: expected array`);
    }
    const deps: SkillDependency[] = [];
    for (const item of depsRaw) {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        this.fail(`Invalid dependency item in ${depFile}`);
      }
      const skill = String((item as { skill?: unknown }).skill || "").trim();
      const version = String((item as { version?: unknown }).version || "").trim();
      if (!skill || !version) {
        this.fail(`Dependency item requires skill/version in ${depFile}`);
      }
      deps.push({ skill, version });
    }
    return deps;
  }

  private isAlreadyExistsError(message: string): boolean {
    return message.includes("HTTP 409") && message.includes("SKILL_VERSION_ALREADY_EXISTS");
  }

  private extractSkillVersion(body: JsonValue): { skillID: string; version: string } {
    if (body && typeof body === "object" && !Array.isArray(body)) {
      const row = body as Record<string, JsonValue>;
      const skillID = String(row.skill_id || "");
      const version = String(row.version || "");
      return { skillID: skillID || "(unknown)", version: version || "(unknown)" };
    }
    return { skillID: "(unknown)", version: "(unknown)" };
  }

  private printCreateResult(data: JsonValue | string | null): void {
    if (data && typeof data === "object" && !Array.isArray(data)) {
      const row = data as Record<string, JsonValue>;
      const out: Record<string, JsonValue> = {
        skill_id: row.skill_id,
        version: row.version,
        name: row.name,
        description: row.description,
      };
      console.log(JSON.stringify(out, null, 2));
      return;
    }
    console.log(JSON.stringify(data, null, 2));
  }

  private async buildRequestFromSkillSource(args: string[], source: CreateSource): Promise<JsonValue> {
    const versionFromArg = this.parseOptionValue(args, "--version");
    const skillIdFromArg = this.parseOptionValue(args, "--skill-id");
    const resolvedSkillFile = source.kind === "skill"
      ? resolve(source.path)
      : join(resolve(source.path), "SKILL.md");
    const sourceDir = dirname(resolvedSkillFile);
    const content = await readFile(resolvedSkillFile, "utf8");
    const parsed = this.parseSkillMarkdown(content);

    const skillID = (skillIdFromArg || parsed.name).trim();
    if (!skillID) {
      this.fail("Cannot infer skill_id. Provide --skill-id <id> or set frontmatter name in SKILL.md");
    }

    const version = parsed.version.trim();
    if (!version) {
      this.fail("Frontmatter requires metadata.version; uploading SKILL.md without metadata.version is not allowed");
    }
    if (versionFromArg && versionFromArg.trim() !== version) {
      this.fail(`Version mismatch: --version=${versionFromArg.trim()} but SKILL.md frontmatter version=${version}`);
    }

    const files = await this.collectSideFiles(sourceDir, resolvedSkillFile);

    return {
      skill_id: skillID,
      version,
      skill: {
        description: parsed.description,
        overview: parsed.overview,
        sections: parsed.sections,
      },
      files,
    } satisfies JsonValue;
  }

  private async resolveCreateSources(args: string[], cwd: string): Promise<CreateSource[]> {
    const requestFile = this.parseOptionValue(args, "--file");
    const skillFile = this.parseOptionValue(args, "--skill");
    const skillDir = this.parseOptionValue(args, "--dir");
    const includeAll = args.includes("--all");
    const modeCount = [requestFile, skillFile, skillDir].filter(Boolean).length;
    if (modeCount > 1) {
      this.fail("Only one source mode is allowed: --file or --skill or --dir");
    }
    if (modeCount > 0 && includeAll) {
      this.fail("--all cannot be used together with --file/--skill/--dir");
    }

    if (skillFile) {
      await this.assertSkillFile(skillFile);
      return [{ kind: "skill", path: skillFile }];
    }
    if (skillDir) {
      await this.assertSkillDir(skillDir);
      return [{ kind: "dir", path: skillDir }];
    }
    if (requestFile) {
      await this.assertJsonFile(requestFile);
      return [{ kind: "json", path: requestFile }];
    }

    const positional = this.getPositionalArgs(args);
    const allPositional = includeAll
      ? [...positional, ...(await this.discoverSkillDirsInCurrentDir(cwd))]
      : positional;
    const unique = Array.from(new Set(allPositional.map((v) => v.trim()).filter(Boolean)));
    if (unique.length === 0) {
      this.fail("Usage: skuare create --skill <SKILL.md> | --dir <skillDir> | --file <request.json> | create <path...> [--all]");
    }

    const out: CreateSource[] = [];
    for (const p of unique) {
      const abs = resolve(p);
      const info = await stat(abs).catch(() => undefined);
      if (!info) {
        this.fail(`Path not found: ${p}`);
      }

      if (info.isFile() && basename(abs) === "SKILL.md") {
        out.push({ kind: "skill", path: p });
        continue;
      }

      if (info.isDirectory()) {
        const skillPath = join(abs, "SKILL.md");
        const skillInfo = await stat(skillPath).catch(() => undefined);
        if (skillInfo?.isFile()) {
          out.push({ kind: "dir", path: p });
          continue;
        }
      }

      if (info.isFile()) {
        out.push({ kind: "json", path: p });
        continue;
      }

      this.fail(`Cannot detect source mode from path: ${p}`);
    }
    return out;
  }

  private async discoverSkillDirsInCurrentDir(cwd: string): Promise<string[]> {
    const entries = await readdir(cwd, { withFileTypes: true });
    const out: string[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const dir = join(cwd, entry.name);
      const skillPath = join(dir, "SKILL.md");
      const info = await stat(skillPath).catch(() => undefined);
      if (info?.isFile()) {
        out.push(dir);
      }
    }
    return out;
  }

  private getPositionalArgs(args: string[]): string[] {
    const optionsWithValue = new Set(["--file", "--skill", "--dir", "--version", "--skill-id"]);
    const out: string[] = [];
    for (let i = 0; i < args.length; i += 1) {
      const v = args[i];
      if (optionsWithValue.has(v)) {
        i += 1;
        continue;
      }
      if (v === "--all") {
        continue;
      }
      if (v.startsWith("--")) {
        continue;
      }
      out.push(v);
    }
    return out;
  }

  private async assertSkillFile(pathValue: string): Promise<void> {
    const abs = resolve(pathValue);
    const info = await stat(abs).catch(() => undefined);
    if (!info) {
      this.fail(`SKILL file not found: ${pathValue}`);
    }
    if (info.isDirectory()) {
      this.fail(`--skill expects a SKILL.md file, but got directory: ${pathValue}`);
    }
    if (!info.isFile()) {
      this.fail(`--skill expects a regular file: ${pathValue}`);
    }
    if (basename(abs) !== "SKILL.md") {
      this.fail(`--skill must point to SKILL.md, got: ${pathValue}`);
    }
  }

  private async assertSkillDir(pathValue: string): Promise<void> {
    const abs = resolve(pathValue);
    const info = await stat(abs).catch(() => undefined);
    if (!info) {
      this.fail(`Directory not found: ${pathValue}`);
    }
    if (info.isFile()) {
      this.fail(`--dir expects a directory, but got file: ${pathValue}`);
    }
    if (!info.isDirectory()) {
      this.fail(`--dir expects a directory: ${pathValue}`);
    }
    const skillPath = join(abs, "SKILL.md");
    const skillInfo = await stat(skillPath).catch(() => undefined);
    if (!skillInfo || !skillInfo.isFile()) {
      this.fail(`SKILL.md not found in directory: ${pathValue}`);
    }
  }

  private async assertJsonFile(pathValue: string): Promise<void> {
    const abs = resolve(pathValue);
    const info = await stat(abs).catch(() => undefined);
    if (!info || !info.isFile()) {
      this.fail(`JSON file not found: ${pathValue}`);
    }
  }

  private parseSkillMarkdown(content: string): {
    name: string;
    version: string;
    description: string;
    overview: string;
    sections: Array<{ title: string; content: string }>;
  } {
    const lines = content.split(/\r?\n/);
    if (lines.length < 4 || lines[0].trim() !== "---") {
      this.fail("SKILL.md must start with YAML frontmatter");
    }

    let fmEnd = -1;
    for (let i = 1; i < lines.length; i += 1) {
      if (lines[i].trim() === "---") {
        fmEnd = i;
        break;
      }
    }
    if (fmEnd < 0) {
      this.fail("Invalid SKILL.md frontmatter: missing closing ---");
    }

    let name = "";
    let version = "";
    let description = "";
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
        } else if (line.startsWith("version:")) {
          version = this.unquote(line.slice("version:".length).trim());
          continue;
        }
      }
      if (line.startsWith("name:")) {
        name = this.unquote(line.slice("name:".length).trim());
      } else if (line.startsWith("description:")) {
        description = this.unquote(line.slice("description:".length).trim());
      }
    }
    if (!name) {
      this.fail("Frontmatter requires name");
    }
    if (!version) {
      this.fail("Frontmatter requires metadata.version");
    }
    if (!description) {
      this.fail("Frontmatter requires description");
    }

    const body = lines.slice(fmEnd + 1).join("\n");
    const blocks = this.parseH2Blocks(body);
    const overview = (blocks.find((b) => b.title.toLowerCase() === "overview")?.content || "").trim();

    const sections = blocks
      .filter((b) => b.title.toLowerCase() !== "overview" && b.content.trim() !== "")
      .map((b) => ({ title: b.title, content: b.content.trim() }));

    return {
      name,
      version,
      description,
      overview,
      sections,
    };
  }

  private parseH2Blocks(markdown: string): Array<{ title: string; content: string }> {
    const lines = markdown.split(/\r?\n/);
    const blocks: Array<{ title: string; content: string }> = [];
    let currentTitle = "";
    let currentContent: string[] = [];

    const flush = (): void => {
      if (!currentTitle) {
        return;
      }
      blocks.push({ title: currentTitle, content: currentContent.join("\n").trim() });
    };

    for (const line of lines) {
      const m = line.match(/^##\s+(.+?)\s*$/);
      if (m) {
        flush();
        currentTitle = m[1].trim();
        currentContent = [];
        continue;
      }
      if (currentTitle) {
        currentContent.push(line);
      }
    }
    flush();
    return blocks;
  }

  private unquote(v: string): string {
    if ((v.startsWith("\"") && v.endsWith("\"")) || (v.startsWith("'") && v.endsWith("'"))) {
      return v.slice(1, -1).trim();
    }
    return v.trim();
  }

  private async collectSideFiles(dir: string, _skillFilePath: string): Promise<Array<{ path: string; content: string }>> {
    const out: Array<{ path: string; content: string }> = [];
    const root = resolve(dir);

    const walk = async (current: string): Promise<void> => {
      const entries = await readdir(current, { withFileTypes: true });
      for (const entry of entries) {
        const full = join(current, entry.name);
        if (entry.isDirectory()) {
          await walk(full);
          continue;
        }
        if (!entry.isFile()) {
          continue;
        }
        const rel = relative(root, full).split("\\").join("/");
        const content = await readFile(full, "utf8");
        out.push({ path: posix.normalize(rel), content });
      }
    };

    await walk(root);
    out.sort((a, b) => a.path.localeCompare(b.path));
    return out;
  }
}

export class FormatCommand extends BaseCommand {
  readonly name = "format";
  readonly description = "Format skill dirs with metadata.version and metadata.author";

  async execute(context: CommandContext): Promise<void> {
    const includeAll = context.args.includes("--all");
    const positional = this.getPositionalArgs(context.args);
    if (includeAll && positional.length > 0) {
      this.fail("--all cannot be used with positional skillDir arguments");
    }

    const files = await this.resolveFormatTargets(positional, context.cwd, includeAll);
    if (files.length === 0) {
      this.fail("No skill directories found. Usage: skuare format [skillDir...] | skuare format --all");
    }

    const rl = readlinePromises.createInterface({ input: process.stdin, output: process.stdout });
    try {
      const mode = includeAll ? "all" : await this.selectMode(rl);
      const changed: Array<{ file: string; version: string; author: string }> = [];

      if (mode === "all") {
        const defaults = await this.readMetadataDefaults(files[0]);
        const version = await this.askRequired(rl, "Input metadata.version", defaults.version || "1.0.0");
        const author = await this.askRequired(rl, "Input metadata.author", defaults.author || "ProjectHub");

        for (const path of files) {
          const raw = await readFile(path, "utf8");
          const next = this.withMetadata(raw, version, author);
          await writeFile(path, next, "utf8");
          changed.push({ file: path, version, author });
        }
      } else {
        for (const path of files) {
          const defaults = await this.readMetadataDefaults(path);
          const version = await this.askRequired(
            rl,
            `Input metadata.version for ${path}`,
            defaults.version || "1.0.0"
          );
          const author = await this.askRequired(
            rl,
            `Input metadata.author for ${path}`,
            defaults.author || "ProjectHub"
          );
          const raw = await readFile(path, "utf8");
          const next = this.withMetadata(raw, version, author);
          await writeFile(path, next, "utf8");
          changed.push({ file: path, version, author });
        }
      }

      console.log(JSON.stringify({ mode, files: changed, count: changed.length }, null, 2));
    } finally {
      rl.close();
    }
  }

  private getPositionalArgs(args: string[]): string[] {
    const out: string[] = [];
    for (const arg of args) {
      if (arg.startsWith("--")) {
        continue;
      }
      out.push(arg);
    }
    return out;
  }

  private async resolveFormatTargets(inputs: string[], cwd: string, includeAll: boolean): Promise<string[]> {
    const targets = includeAll || inputs.length === 0 ? await this.discoverSkillDirsInCurrentDir(cwd) : inputs;
    const unique = Array.from(new Set(targets.map((v) => v.trim()).filter(Boolean)));
    const resolved: string[] = [];
    for (const input of unique) {
      resolved.push(await this.resolveSkillFilePath(input));
    }
    return resolved;
  }

  private async discoverSkillDirsInCurrentDir(cwd: string): Promise<string[]> {
    const entries = await readdir(cwd, { withFileTypes: true });
    const out: string[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const dirPath = join(cwd, entry.name);
      const skillPath = join(dirPath, "SKILL.md");
      const info = await stat(skillPath).catch(() => undefined);
      if (info?.isFile()) {
        out.push(dirPath);
      }
    }
    out.sort((a, b) => a.localeCompare(b));
    return out;
  }

  private async selectMode(rl: ReadlineInterface): Promise<"all" | "each"> {
    const raw = (await rl.question("Select format mode: All / Each [All]: ")).trim().toLowerCase();
    if (!raw || raw === "all" || raw === "a") {
      return "all";
    }
    if (raw === "each" || raw === "e") {
      return "each";
    }
    this.fail("Invalid mode. Expected All or Each");
  }

  private async askRequired(rl: ReadlineInterface, label: string, defaultValue: string): Promise<string> {
    const raw = (await rl.question(`${label} [${defaultValue}]: `)).trim();
    const val = raw || defaultValue;
    if (!val) {
      this.fail(`${label} is required`);
    }
    return val;
  }

  private async resolveSkillFilePath(input: string): Promise<string> {
    const abs = resolve(input);
    const info = await stat(abs).catch(() => undefined);
    if (!info) {
      this.fail(`Path not found: ${input}`);
    }
    if (!info.isDirectory()) {
      this.fail(`Only skill directory is supported: ${input}`);
    }
    const skill = join(abs, "SKILL.md");
    const skillInfo = await stat(skill).catch(() => undefined);
    if (!skillInfo?.isFile()) {
      this.fail(`SKILL.md not found in directory: ${input}`);
    }
    return skill;
  }

  private async readMetadataDefaults(path: string): Promise<{ version: string; author: string }> {
    const content = await readFile(path, "utf8");
    const lines = content.split(/\r?\n/);
    if (lines[0]?.trim() !== "---") {
      return { version: "", author: "" };
    }
    let fmEnd = -1;
    for (let i = 1; i < lines.length; i += 1) {
      if (lines[i].trim() === "---") {
        fmEnd = i;
        break;
      }
    }
    if (fmEnd < 0) {
      return { version: "", author: "" };
    }

    let metaIndent = -1;
    let version = "";
    let author = "";
    for (const rawLine of lines.slice(1, fmEnd)) {
      const line = rawLine.trim();
      const indent = rawLine.length - rawLine.trimStart().length;
      if (line === "metadata:") {
        metaIndent = indent;
        continue;
      }
      if (metaIndent >= 0) {
        if (line && indent <= metaIndent) {
          metaIndent = -1;
        } else if (line.startsWith("version:") && !version) {
          version = this.unquote(line.slice("version:".length).trim());
          continue;
        } else if (line.startsWith("author:") && !author) {
          author = this.unquote(line.slice("author:".length).trim());
          continue;
        }
      }
    }
    return { version, author };
  }

  private withMetadata(content: string, version: string, author: string): string {
    const versionVal = this.toYamlString(version);
    const authorVal = this.toYamlString(author);
    const lines = content.split(/\r?\n/);
    if (lines[0]?.trim() !== "---") {
      const fm = ["---", "metadata:", `  author: ${authorVal}`, `  version: ${versionVal}`, "---", ""].join("\n");
      return `${fm}${content}`;
    }

    let fmEnd = -1;
    for (let i = 1; i < lines.length; i += 1) {
      if (lines[i].trim() === "---") {
        fmEnd = i;
        break;
      }
    }
    if (fmEnd < 0) {
      this.fail("Invalid frontmatter: missing closing ---");
    }

    const fmLines = lines.slice(1, fmEnd);
    const rest = lines.slice(fmEnd + 1);

    // Normalize top-level `author/version` to `metadata.author/metadata.version`.
    let topLevelAuthorValue = "";
    let topLevelVersionValue = "";
    for (let i = fmLines.length - 1; i >= 0; i -= 1) {
      const raw = fmLines[i];
      const trimmed = raw.trim();
      const indent = raw.length - raw.trimStart().length;
      if (indent === 0 && trimmed.startsWith("author:")) {
        if (!topLevelAuthorValue) {
          topLevelAuthorValue = raw.slice(raw.indexOf("author:") + "author:".length).trim();
        }
        fmLines.splice(i, 1);
        continue;
      }
      if (indent === 0 && trimmed.startsWith("version:")) {
        if (!topLevelVersionValue) {
          topLevelVersionValue = raw.slice(raw.indexOf("version:") + "version:".length).trim();
        }
        fmLines.splice(i, 1);
      }
    }

    let metaStart = -1;
    let metaEnd = -1;
    for (let i = 0; i < fmLines.length; i += 1) {
      const l = fmLines[i];
      if (l.trim() === "metadata:") {
        metaStart = i;
        metaEnd = i;
        for (let j = i + 1; j < fmLines.length; j += 1) {
          const next = fmLines[j];
          const indent = next.length - next.trimStart().length;
          if (next.trim() !== "" && indent === 0) {
            break;
          }
          metaEnd = j;
        }
        break;
      }
    }

    if (metaStart < 0) {
      fmLines.push("metadata:");
      fmLines.push(`  author: ${authorVal || topLevelAuthorValue}`);
      fmLines.push(`  version: ${versionVal || topLevelVersionValue}`);
    } else {
      let hasAuthor = false;
      let hasVersion = false;
      for (let i = metaStart + 1; i <= metaEnd; i += 1) {
        const t = fmLines[i].trim();
        if (t.startsWith("author:")) {
          hasAuthor = true;
        }
        if (t.startsWith("version:")) {
          hasVersion = true;
        }
      }
      if (hasAuthor) {
        for (let i = metaStart + 1; i <= metaEnd; i += 1) {
          const t = fmLines[i].trim();
          if (t.startsWith("author:")) {
            fmLines[i] = `  author: ${authorVal}`;
            break;
          }
        }
      }
      if (!hasAuthor) {
        fmLines.splice(metaEnd + 1, 0, `  author: ${authorVal || topLevelAuthorValue}`);
        metaEnd += 1;
      }

      if (hasVersion) {
        for (let i = metaStart + 1; i <= metaEnd; i += 1) {
          const t = fmLines[i].trim();
          if (t.startsWith("version:")) {
            fmLines[i] = `  version: ${versionVal}`;
            break;
          }
        }
      }
      if (!hasVersion) {
        fmLines.splice(metaEnd + 1, 0, `  version: ${versionVal || topLevelVersionValue}`);
      }
    }

    return ["---", ...fmLines, "---", ...rest].join("\n");
  }

  private toYamlString(input: string): string {
    return `"${input.replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"`;
  }

  private unquote(v: string): string {
    if ((v.startsWith("\"") && v.endsWith("\"")) || (v.startsWith("'") && v.endsWith("'"))) {
      return v.slice(1, -1).trim();
    }
    return v.trim();
  }
}

/**
 * 删除技能命令
 */
export class DeleteCommand extends BaseCommand {
  readonly name = "delete";
  readonly description = "Delete skill version";

  async execute(context: CommandContext): Promise<void> {
    const [skillID, version] = context.args;

    if (!skillID || !version) {
      this.fail("Usage: skuare delete <skillID> <version>");
    }

    await callApi({
      method: "DELETE",
      path: `/api/v1/skills/${encodeURIComponent(skillID)}/${encodeURIComponent(version)}`,
      server: context.server,
      localMode: context.localMode,
      auth: context.auth,
    });
  }
}
