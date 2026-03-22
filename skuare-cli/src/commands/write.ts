/**
 * 技能写操作命令
 */

import type { CommandContext, JsonValue } from "./types";
import { BaseCommand } from "./base";
import { isDomainError } from "../domain/errors";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, posix, relative, resolve } from "node:path";
import * as readlinePromises from "node:readline/promises";
import { collectPositionalArgs } from "../utils/command_args";
import { parseSkillFrontmatter, parseSkillMarkdown, readSkillMetadataDefaults, renderSkillTemplate, withUpdatedSkillMetadata } from "../utils/skill_manifest";
import { discoverSkillDirs } from "../utils/skill_workspace";
import { buildMultipartFormData, buildTarGzBundle } from "../utils/upload_bundle";
import { compareVersions, maxVersion, suggestNextVersion } from "../utils/versioning";
import { DeleteAgentsMDCommand, PublishAgentsMDCommand } from "./agentsmd";
import { SkillCatalogCommand } from "./query";
import { normalizeResourceContext } from "./resource_type";

type ReadlineInterface = Awaited<ReturnType<typeof readlinePromises.createInterface>>;

type CreateSource =
  | { kind: "json"; path: string }
  | { kind: "skill"; path: string }
  | { kind: "dir"; path: string };

type SkillDependency = {
  skill: string;
  version: string;
};

type PreparedPublishRequest = {
  body: JsonValue | Uint8Array;
  contentType?: string;
  skillID: string;
  version: string;
};

/**
 * 发布技能命令
 */
export class PublishCommand extends BaseCommand {
  readonly name: string = "publish";
  readonly description: string = "Publish skill version";

  async execute(context: CommandContext): Promise<void> {
    const normalized = normalizeResourceContext(context);
    if (normalized.resourceType === "agentsmd") {
      await new PublishAgentsMDCommand().execute(normalized.context);
      return;
    }

    const skillContext = normalized.context;
    const forceUpload = this.hasForceFlag(skillContext.args);
    const sources = await this.resolveCreateSources(skillContext.args, skillContext.cwd);
    for (const source of sources) {
      if (source.kind !== "json") {
        await this.uploadDependencies(source, skillContext, forceUpload);
      }
      const prepared = source.kind === "json"
        ? this.prepareJsonPublishRequest(await this.readJsonFile(source.path) as JsonValue, forceUpload)
        : await this.buildRequestFromSkillSource(skillContext.args, source, forceUpload);

      try {
        const created = await (await this.getBackend(skillContext)).publishSkill({
          body: prepared.body,
          contentType: prepared.contentType,
          auth: skillContext.auth,
        });
        this.printCreateResult(created);
      } catch (err) {
        if (!this.isAlreadyExistsError(err)) {
          this.rethrowPublishError(err, prepared);
        }
        if (forceUpload) {
          this.fail(`Force publish failed because the server still reported an existing version: ${prepared.skillID}@${prepared.version}`);
        }
        console.log(`${this.yellow("[WARN]")} skill version already exists: ${prepared.skillID}@${prepared.version}`);
        console.log(`${this.yellow("[TIP]")} Retry with --force or -f to overwrite the existing version.`);
      }
    }
  }

  private async uploadDependencies(
    source: Exclude<CreateSource, { kind: "json" }>,
    context: CommandContext,
    forceUpload: boolean
  ): Promise<void> {
    const sourceDir = source.kind === "skill" ? dirname(resolve(source.path)) : resolve(source.path);
    const skillsRoot = dirname(sourceDir);
    const deps = await this.readDependencies(sourceDir);
    const uploaded = new Set<string>();
    const visiting = new Set<string>();
    for (const dep of deps) {
      await this.uploadOneDependency(dep, skillsRoot, context, uploaded, visiting, forceUpload);
    }
  }

  private async uploadOneDependency(
    dep: SkillDependency,
    skillsRoot: string,
    context: CommandContext,
    uploaded: Set<string>,
    visiting: Set<string>,
    forceUpload: boolean
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
    const depParsed = parseSkillMarkdown(depSkillRaw);
    if (depParsed.metadataVersion !== dep.version) {
      this.fail(`Dependency version mismatch for ${dep.skill}: deps=${dep.version}, SKILL.md=${depParsed.metadataVersion}`);
    }

    const transitive = await this.readDependencies(depDir);
    for (const child of transitive) {
      await this.uploadOneDependency(child, skillsRoot, context, uploaded, visiting, forceUpload);
    }

    const prepared = await this.buildRequestFromSkillSource([], { kind: "dir", path: depDir }, forceUpload);
    try {
      await (await this.getBackend(context)).publishSkill({
        body: prepared.body,
        contentType: prepared.contentType,
        auth: context.auth,
      });
    } catch (err) {
      if (!this.isAlreadyExistsError(err)) {
        this.rethrowPublishError(err, prepared);
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

  private isAlreadyExistsError(err: unknown): boolean {
    if (isDomainError(err)) {
      return err.code === "SKILL_VERSION_ALREADY_EXISTS";
    }
    const message = err instanceof Error ? err.message : String(err);
    return message.includes("HTTP 409") && message.includes("SKILL_VERSION_ALREADY_EXISTS");
  }

  private hasForceFlag(args: string[]): boolean {
    return args.includes("--force") || args.includes("-f");
  }

  private prepareJsonPublishRequest(body: JsonValue, forceUpload: boolean): PreparedPublishRequest {
    const nextBody = this.applyForceFlag(body, forceUpload);
    const info = this.extractSkillVersion(nextBody);
    return {
      body: nextBody,
      skillID: info.skillID,
      version: info.version,
    };
  }

  private applyForceFlag(body: JsonValue, forceUpload: boolean): JsonValue {
    if (!forceUpload) {
      return body;
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      this.fail("--force requires the publish request body to be a JSON object");
    }
    return {
      ...body,
      force: true,
    } satisfies JsonValue;
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

  private rethrowPublishError(err: unknown, request: PreparedPublishRequest): never {
    if (this.isPayloadTooLargeError(err)) {
      this.fail(
        `Publish request too large for ${request.skillID}@${request.version}. The default skuare-svc upload limit is 64MB now; reduce the bundle size or increase --max-request-body-size-bytes / SKUARE_MAX_REQUEST_BODY_SIZE_BYTES on the server.`
      );
    }
    throw err;
  }

  private isPayloadTooLargeError(err: unknown): boolean {
    if (isDomainError(err)) {
      const details = err.details;
      if (details && typeof details === "object" && !Array.isArray(details)) {
        const status = (details as { status?: unknown }).status;
        if (status === 413) {
          return true;
        }
      }
    }
    const message = err instanceof Error ? err.message : String(err);
    return message.includes("HTTP 413");
  }

  private printCreateResult(data: { skill_id: string; version: string; name: string; description: string; author: string }): void {
    if (data && typeof data === "object" && !Array.isArray(data)) {
      const row = data as Record<string, JsonValue>;
      const out: Record<string, JsonValue> = {
        skill_id: row.skill_id,
        version: row.version,
        name: row.name,
        description: row.description,
      };
      if (row.author !== undefined) {
        out.author = row.author;
      }
      console.log(JSON.stringify(out, null, 2));
      return;
    }
  }

  private async buildRequestFromSkillSource(
    args: string[],
    source: Exclude<CreateSource, { kind: "json" }>,
    forceUpload: boolean
  ): Promise<PreparedPublishRequest> {
    const versionFromArg = this.parseOptionValue(args, "--version");
    const skillIdFromArg = this.parseOptionValue(args, "--skill-id");
    const resolvedSkillFile = source.kind === "skill"
      ? resolve(source.path)
      : join(resolve(source.path), "SKILL.md");
    const sourceDir = dirname(resolvedSkillFile);
    const content = await readFile(resolvedSkillFile, "utf8");
    const parsed = parseSkillMarkdown(content);

    const skillID = (skillIdFromArg || parsed.name).trim();
    if (!skillID) {
      this.fail("Cannot infer skill_id. Provide --skill-id <id> or set frontmatter name in SKILL.md");
    }

    const version = parsed.metadataVersion.trim();
    if (!version) {
      this.fail("Frontmatter requires metadata.version; uploading SKILL.md without metadata.version is not allowed");
    }
    if (versionFromArg && versionFromArg.trim() !== version) {
      this.fail(`Version mismatch: --version=${versionFromArg.trim()} but SKILL.md frontmatter version=${version}`);
    }

    const files = await this.collectSideFiles(sourceDir);
    const bundle = buildTarGzBundle(files);
    const metadata = JSON.stringify({
      skill_id: skillID,
      version,
      force: forceUpload,
      skill: {
        description: parsed.description,
        overview: parsed.overview,
        sections: parsed.sections,
      },
    } satisfies JsonValue);
    const multipart = buildMultipartFormData([
      {
        name: "metadata",
        content: metadata,
        contentType: "application/json",
      },
      {
        name: "bundle",
        filename: `${skillID}-${version}.tar.gz`,
        content: bundle,
        contentType: "application/gzip",
      },
    ]);

    return {
      body: multipart.body,
      contentType: multipart.contentType,
      skillID,
      version,
    };
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

    const positional = collectPositionalArgs(
      args,
      ["--file", "--skill", "--dir", "--version", "--skill-id"],
      ["--all", "--force", "-f"]
    );
    const allPositional = includeAll
      ? [...positional, ...(await discoverSkillDirs(cwd))]
      : positional;
    const unique = Array.from(new Set(allPositional.map((v) => v.trim()).filter(Boolean)));
    if (unique.length === 0) {
      this.fail(
        "Usage: skuare remote publish --skill <SKILL.md> | --dir <skillDir> | --file <request.json> | remote publish <path...> [--all]"
      );
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

  private async collectSideFiles(dir: string): Promise<Array<{ path: string; content: Uint8Array }>> {
    const out: Array<{ path: string; content: Uint8Array }> = [];
    const root = resolve(dir);

    const walk = async (current: string): Promise<void> => {
      const entries = await readdir(current, { withFileTypes: true });
      entries.sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name));
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
        const content = await readFile(full);
        out.push({ path: posix.normalize(rel), content });
      }
    };

    await walk(root);
    out.sort((a, b) => a.path.localeCompare(b.path));
    return out;
  }
}

/**
 * 兼容命令：create（已弃用，建议迁移为 remote publish）
 */
export class CreateCommand extends PublishCommand {
  readonly name: string = "create";
  readonly description: string = "Create skill version (deprecated, use remote publish)";

  async execute(context: CommandContext): Promise<void> {
    console.log(`${this.yellow("[WARN]")} command 'create' is deprecated, use 'remote publish' instead`);
    await super.execute(context);
  }
}

export class UpdateCommand extends SkillCatalogCommand {
  readonly name = "update";
  readonly description = "Publish a new version for an existing remote skill";

  async execute(context: CommandContext): Promise<void> {
    const normalized = normalizeResourceContext(context);
    if (normalized.resourceType === "agentsmd") {
      this.fail("update currently only supports skill resources");
    }

    const [targetRef, newSkillDir] = normalized.context.args;
    if (!targetRef || !newSkillDir || normalized.context.args.length !== 2) {
      this.fail("Usage: skuare remote update <skillRef> <newSkillDir>");
    }

    const skillFile = await this.resolveSkillFilePath(newSkillDir);
    const raw = await readFile(skillFile, "utf8");
    const frontmatter = parseSkillFrontmatter(raw);
    const selected = await this.resolveCatalogSkillCandidate(normalized.context, targetRef, undefined, {
      notFoundMessage: (value) => `Remote skill not found for ${value}`,
      selectionTitle: "Multiple skills found, select one (use ↑/↓, Enter to confirm):",
      includeSelectedVersion: false,
    });
    this.assertLocalSkillMatchesRemote(frontmatter, selected.name, selected.author);

    const remote = await this.loadRemoteSkill(normalized.context, selected.skillID, selected.author);
    const suggestedVersion = suggestNextVersion(remote.maxVersion);
    const chosenVersion = await this.resolveUpdatedVersion(remote.skillID, frontmatter.metadataVersion, remote.maxVersion, suggestedVersion);

    if (compareVersions(chosenVersion, remote.maxVersion) <= 0) {
      this.fail(`metadata.version (${chosenVersion}) must be greater than remote maxVersion (${remote.maxVersion})`);
    }

    if (chosenVersion !== frontmatter.metadataVersion) {
      await writeFile(skillFile, withUpdatedSkillMetadata(raw, chosenVersion, frontmatter.metadataAuthor), "utf8");
    }

    await new PublishCommand().execute({
      ...normalized.context,
      args: ["--dir", newSkillDir],
    });
  }

  protected async askForUpdatedVersion(skillID: string, maxRemoteVersion: string, suggestedVersion: string): Promise<string> {
    const rl = readlinePromises.createInterface({ input: process.stdin, output: process.stdout });
    try {
      while (true) {
        const raw = (await rl.question(`metadata.version for ${skillID} [${suggestedVersion}]: `)).trim();
        const chosen = raw || suggestedVersion;
        if (compareVersions(chosen, maxRemoteVersion) > 0) {
          return chosen;
        }
        console.log(`${this.yellow("[WARN]")} version must be greater than remote maxVersion ${maxRemoteVersion}`);
      }
    } finally {
      rl.close();
    }
  }

  protected isInteractiveTerminal(): boolean {
    return !!process.stdin.isTTY && !!process.stdout.isTTY;
  }

  private async resolveUpdatedVersion(
    skillID: string,
    localVersion: string,
    remoteMaxVersion: string,
    suggestedVersion: string
  ): Promise<string> {
    if (this.isInteractiveTerminal()) {
      const preferred = compareVersions(localVersion, remoteMaxVersion) > 0 ? localVersion : suggestedVersion;
      return this.askForUpdatedVersion(skillID, remoteMaxVersion, preferred);
    }
    if (compareVersions(localVersion, remoteMaxVersion) > 0) {
      return localVersion;
    }
    this.fail(`Local metadata.version (${localVersion || "(empty)"}) must be greater than remote maxVersion (${remoteMaxVersion}). Suggested: ${suggestedVersion}`);
  }

  private assertLocalSkillMatchesRemote(
    frontmatter: ReturnType<typeof parseSkillFrontmatter>,
    remoteName: string,
    remoteAuthor: string
  ): void {
    if (frontmatter.name !== remoteName) {
      this.fail(`Local SKILL.md name (${frontmatter.name || "(empty)"}) must match selected remote skill name (${remoteName || "(empty)"})`);
    }

    const localAuthor = this.normalizeAuthor(frontmatter.metadataAuthor);
    const expectedAuthor = this.normalizeAuthor(remoteAuthor);
    if (localAuthor !== expectedAuthor) {
      this.fail(`Local SKILL.md metadata.author (${frontmatter.metadataAuthor || "(empty)"}) must match selected remote author (${remoteAuthor || "(empty)"})`);
    }
  }

  private normalizeAuthor(input: string): string {
    const trimmed = input.trim();
    return trimmed || "undefined";
  }

  private async resolveSkillFilePath(skillDir: string): Promise<string> {
    const abs = resolve(skillDir);
    const info = await stat(abs).catch(() => undefined);
    if (!info?.isDirectory()) {
      this.fail(`Directory not found: ${skillDir}`);
    }
    const skillFile = join(abs, "SKILL.md");
    const skillInfo = await stat(skillFile).catch(() => undefined);
    if (!skillInfo?.isFile()) {
      this.fail(`SKILL.md not found in directory: ${skillDir}`);
    }
    return skillFile;
  }

  private async loadRemoteSkill(
    context: CommandContext,
    skillID: string,
    expectedAuthor: string
  ): Promise<{ skillID: string; maxVersion: string }> {
    const overview = await (await this.getBackend(context)).getSkillOverview(skillID);
    const remoteAuthor = overview.author.trim();
    if (this.normalizeAuthor(remoteAuthor) !== this.normalizeAuthor(expectedAuthor)) {
      this.fail(`Remote skill ${skillID} belongs to author ${remoteAuthor || "(empty)"}, not ${expectedAuthor || "(empty)"}`);
    }
    const versions = overview.versions.map((item) => String(item).trim()).filter(Boolean);
    if (versions.length === 0) {
      this.fail(`No versions found for remote skill: ${skillID}`);
    }
    return {
      skillID: overview.skill_id.trim() || skillID,
      maxVersion: maxVersion(versions),
    };
  }
}

export class FormatCommand extends BaseCommand {
  readonly name = "format";
  readonly description = "Format skill dirs with metadata.version and metadata.author";

  async execute(context: CommandContext): Promise<void> {
    const includeAll = context.args.includes("--all");
    const positional = collectPositionalArgs(context.args, [], ["--all"]);
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
        const author = await this.askRequired(rl, "Input metadata.author", defaults.author || "undefined");

        for (const path of files) {
          const raw = await readFile(path, "utf8");
          const next = withUpdatedSkillMetadata(raw, version, author);
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
            defaults.author || "undefined"
          );
          const raw = await readFile(path, "utf8");
          const next = withUpdatedSkillMetadata(raw, version, author);
          await writeFile(path, next, "utf8");
          changed.push({ file: path, version, author });
        }
      }

      console.log(JSON.stringify({ mode, files: changed, count: changed.length }, null, 2));
    } finally {
      rl.close();
    }
  }

  private async resolveFormatTargets(inputs: string[], cwd: string, includeAll: boolean): Promise<string[]> {
    const targets = includeAll || inputs.length === 0 ? await discoverSkillDirs(cwd) : inputs;
    const unique = Array.from(new Set(targets.map((v) => v.trim()).filter(Boolean)));
    const resolved: string[] = [];
    for (const input of unique) {
      resolved.push(await this.resolveSkillFilePath(input));
    }
    return resolved;
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
    return readSkillMetadataDefaults(content);
  }
}

export class BuildCommand extends BaseCommand {
  readonly name = "build";
  readonly description = "Build or initialize skill dependency files";

  async execute(context: CommandContext): Promise<void> {
    const args = context.args.map((v) => v.trim()).filter(Boolean);
    const includeAll = args.includes("--all");
    const positional = args.filter((v) => v !== "--all");
    const [skillName, ...rawRefs] = positional;
    if (!skillName) {
      this.fail("Usage: skuare build <skillName> [refSkill...] [--all]");
    }
    if (includeAll && rawRefs.length > 0) {
      this.fail("--all cannot be used with explicit refSkill arguments");
    }

    const targetDir = await this.resolveTargetSkillDir(skillName, context.cwd, context.cwd);
    const refs = includeAll
      ? await this.resolveAllRefSkills(context.cwd, targetDir)
      : Array.from(new Set(rawRefs));
    const skillDirRoot = dirname(targetDir);
    const resolvedRefs: Array<{ skill: string; version: string; dir: string; alias?: string }> = [];
    for (const ref of refs) {
      const parsed = this.parseRefArg(ref);
      const refDir = await this.resolveSkillDir(parsed.refSkill, skillDirRoot, context.cwd);
      const refSkill = basename(refDir);
      if (resolve(refDir) === resolve(targetDir)) {
        this.fail(`Self dependency is not allowed: ${refSkill}`);
      }
      const version = await this.readSkillVersion(refDir);
      resolvedRefs.push({ skill: refSkill, version, dir: refDir, alias: parsed.alias });
    }

    const depPath = join(targetDir, "skill-deps.json");
    const lockPath = join(targetDir, "skill-deps.lock.json");

    const existingDeps = await this.readDepsFile(depPath);
    const existingLock = await this.readLockFile(lockPath);

    const merged = new Map<string, BuildDependency>();
    for (const item of existingDeps) {
      merged.set(this.depKey(item), { skill: item.skill, version: item.version, alias: item.alias });
    }
    for (const ref of resolvedRefs) {
      merged.set(this.depKey(ref), { skill: ref.skill, version: ref.version, alias: ref.alias });
    }

    const dependencies = Array.from(merged.values()).sort((a, b) => this.depKey(a).localeCompare(this.depKey(b)));
    const lockBySkill = new Map(existingLock.map((item) => [this.depKey(item), item]));
    const lockDependencies = dependencies.map((dep) => {
      const old = lockBySkill.get(this.depKey(dep));
      const resolved = old && old.version === dep.version && old.skill === dep.skill ? old.resolved : dep.version;
      const out: BuildLockDependency = {
        skill: dep.skill,
        version: dep.version,
        resolved,
      };
      if (dep.alias) {
        out.alias = dep.alias;
      }
      return out;
    });

    await writeFile(depPath, `${JSON.stringify({ dependencies }, null, 2)}\n`, "utf8");
    await writeFile(lockPath, `${JSON.stringify({ lock_version: 1, dependencies: lockDependencies }, null, 2)}\n`, "utf8");

    console.log(JSON.stringify({
      skill: basename(targetDir),
      target_dir: targetDir,
      all: includeAll,
      added: resolvedRefs.map((v) => ({ skill: v.skill, version: v.version, ...(v.alias ? { alias: v.alias } : {}) })),
      dependency_count: dependencies.length,
      files: [depPath, lockPath],
    }, null, 2));
  }

  private parseRefArg(input: string): { refSkill: string; alias?: string } {
    const m = input.match(/^([A-Za-z0-9._-]+)=(.+)$/);
    if (!m) {
      return { refSkill: input };
    }
    return { alias: m[1], refSkill: m[2] };
  }

  private async resolveAllRefSkills(cwd: string, targetDir: string): Promise<string[]> {
    const refs = await discoverSkillDirs(cwd);
    return refs
      .filter((candidate) => resolve(candidate) !== resolve(targetDir))
      .map((candidate) => basename(candidate))
      .sort((a, b) => a.localeCompare(b));
  }

  private async resolveTargetSkillDir(input: string, baseDir: string, fallbackDir: string): Promise<string> {
    const existing = await this.findSkillDir(input, baseDir, fallbackDir);
    if (existing) {
      return existing;
    }

    const direct = resolve(input);
    const inBase = resolve(baseDir, input);
    const targetDir = direct === inBase ? direct : inBase;
    await this.ensureSkillTemplate(targetDir, "default");
    return targetDir;
  }

  private async findSkillDir(input: string, baseDir: string, fallbackDir: string): Promise<string | undefined> {
    const direct = resolve(input);
    const inBase = resolve(baseDir, input);
    const inFallback = resolve(fallbackDir, input);
    const candidates = Array.from(new Set([direct, inBase, inFallback]));
    for (const candidate of candidates) {
      const info = await stat(candidate).catch(() => undefined);
      if (!info?.isDirectory()) {
        continue;
      }
      const skillPath = join(candidate, "SKILL.md");
      const skillInfo = await stat(skillPath).catch(() => undefined);
      if (skillInfo?.isFile()) {
        return candidate;
      }
    }
    return undefined;
  }

  private async ensureSkillTemplate(targetDir: string, templateKind: "default"): Promise<void> {
    const targetInfo = await stat(targetDir).catch(() => undefined);
    if (targetInfo?.isFile()) {
      this.fail(`Target path is a file, cannot initialize skill directory: ${targetDir}`);
    }
    if (!this.isInteractiveTerminal()) {
      this.fail(`Target skill not found and interactive initialization requires a TTY: ${targetDir}`);
    }

    const rl = this.createReadlineInterface();
    try {
      const skillID = basename(targetDir);
      const defaults = {
        description: `Describe when to use ${skillID} and what outcome it should provide.`,
        author: "undefined",
        version: "0.0.1",
      };

      console.log(`${this.yellow("[INFO]")} Skill not found. Initializing template at ${targetDir}`);
      console.log("Provide minimal metadata for the new skill template:");

      const description = await this.askRequired(
        rl,
        `Description for ${skillID}`,
        defaults.description
      );
      const author = await this.askRequired(rl, `metadata.author for ${skillID}`, defaults.author);
      const version = await this.askRequired(rl, `metadata.version for ${skillID}`, defaults.version);

      await mkdir(targetDir, { recursive: true });
      const skillPath = join(targetDir, "SKILL.md");
      await writeFile(skillPath, renderSkillTemplate(skillID, description, author, version), "utf8");
    } finally {
      rl.close();
    }
  }

  private async resolveSkillDir(input: string, baseDir: string, fallbackDir: string): Promise<string> {
    const found = await this.findSkillDir(input, baseDir, fallbackDir);
    if (found) {
      return found;
    }
    this.fail(`Skill directory not found or missing SKILL.md: ${input}`);
  }

  protected createReadlineInterface(): ReadlineInterface {
    return readlinePromises.createInterface({ input: process.stdin, output: process.stdout });
  }

  protected isInteractiveTerminal(): boolean {
    return !!process.stdin.isTTY && !!process.stdout.isTTY;
  }

  private async askRequired(rl: ReadlineInterface, label: string, defaultValue: string): Promise<string> {
    const raw = (await rl.question(`${label} [${defaultValue}]: `)).trim();
    const value = raw || defaultValue;
    if (!value) {
      this.fail(`${label} is required`);
    }
    return value;
  }

  private async readSkillVersion(skillDir: string): Promise<string> {
    const raw = await readFile(join(skillDir, "SKILL.md"), "utf8");
    const version = parseSkillFrontmatter(raw).metadataVersion;
    if (!version) {
      this.fail(`metadata.version is required in ${join(skillDir, "SKILL.md")}`);
    }
    return version;
  }

  private async readDepsFile(depPath: string): Promise<BuildDependency[]> {
    const info = await stat(depPath).catch(() => undefined);
    if (!info?.isFile()) {
      return [];
    }
    const raw = await readFile(depPath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      this.fail(`Invalid dependency file: ${depPath}`);
    }
    const deps = (parsed as { dependencies?: unknown }).dependencies;
    if (!deps) {
      return [];
    }
    if (!Array.isArray(deps)) {
      this.fail(`Invalid dependencies format in ${depPath}: expected array`);
    }
    return deps.map((item) => this.parseDepItem(item, depPath));
  }

  private async readLockFile(lockPath: string): Promise<BuildLockDependency[]> {
    const info = await stat(lockPath).catch(() => undefined);
    if (!info?.isFile()) {
      return [];
    }
    const raw = await readFile(lockPath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      this.fail(`Invalid lock file: ${lockPath}`);
    }
    const deps = (parsed as { dependencies?: unknown }).dependencies;
    if (!deps) {
      return [];
    }
    if (!Array.isArray(deps)) {
      this.fail(`Invalid dependencies format in ${lockPath}: expected array`);
    }
    return deps.map((item) => {
      const dep = this.parseDepItem(item, lockPath);
      const resolved = String((item as { resolved?: unknown }).resolved || dep.version).trim() || dep.version;
      return { ...dep, resolved, alias: dep.alias };
    });
  }

  private parseDepItem(item: unknown, filePath: string): BuildDependency {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      this.fail(`Invalid dependency item in ${filePath}`);
    }
    const skill = String((item as { skill?: unknown }).skill || "").trim();
    const version = String((item as { version?: unknown }).version || "").trim();
    const aliasRaw = (item as { alias?: unknown }).alias;
    const alias = aliasRaw === undefined ? "" : String(aliasRaw).trim();
    if (!skill || !version) {
      this.fail(`Dependency item requires skill/version in ${filePath}`);
    }
    if (aliasRaw !== undefined && !alias) {
      this.fail(`Dependency alias must be non-empty string in ${filePath}`);
    }
    return { skill, version, ...(alias ? { alias } : {}) };
  }

  private depKey(dep: { skill: string; alias?: string }): string {
    return dep.alias?.trim() || dep.skill;
  }
}

type BuildDependency = SkillDependency & {
  alias?: string;
};

type BuildLockDependency = BuildDependency & {
  resolved: string;
};

/**
 * 删除技能命令
 */
export class DeleteCommand extends BaseCommand {
  readonly name = "delete";
  readonly description = "Delete skill version";

  async execute(context: CommandContext): Promise<void> {
    const normalized = normalizeResourceContext(context);
    if (normalized.resourceType === "agentsmd") {
      await new DeleteAgentsMDCommand().execute(normalized.context);
      return;
    }

    const [skillID, version] = normalized.context.args;

    if (!skillID || !version) {
      this.fail("Usage: skuare remote delete <skillID> <version>");
    }

    await (await this.getBackend(normalized.context)).deleteSkill(skillID, version, normalized.context.auth);
  }
}
