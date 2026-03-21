import { mkdtemp, readFile, readdir, rm, stat, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { gunzipSync } from "node:zlib";
import { DomainError } from "../domain/errors";
import type { JsonValue, WriteAuth } from "../types";
import { parseSkillFrontmatter, parseSkillMarkdown, toYamlString } from "../utils/skill_manifest";
import type { RegistryBackend } from "./backend";
import type {
  PublishAgentsMDRequest,
  PublishSkillRequest,
  RegistryAgentsMDDetail,
  RegistryAgentsMDEntry,
  RegistryAgentsMDOverview,
  RegistryHealth,
  RegistrySkillDetail,
  RegistrySkillEntry,
  RegistrySkillOverview,
} from "./types";

const execFileAsync = promisify(execFile);
const anonymousSkillAuthorDir = "_anonymous";

export function isGitRegistryServer(server: string): boolean {
  const trimmed = server.trim();
  return trimmed.startsWith("git+") || trimmed.endsWith(".git") || trimmed.startsWith("/") || /^[A-Za-z]:[\\/]/.test(trimmed);
}

export class GitRegistryBackend implements RegistryBackend {
  private constructor(
    private readonly repoUrl: string,
    private readonly checkoutDir: string
  ) {}

  static async create(server: string): Promise<GitRegistryBackend> {
    const checkoutDir = await mkdtemp(join(tmpdir(), "skuare-git-registry-"));
    const repoUrl = normalizeGitServer(server);
    try {
      await git(["clone", "--quiet", repoUrl, checkoutDir], process.cwd());
    } catch (err) {
      await rm(checkoutDir, { recursive: true, force: true }).catch(() => undefined);
      throw new DomainError("CLI_NETWORK_ERROR", `Failed to clone git registry: ${repoUrl}`, { cause: err });
    }

    const cleanup = async (): Promise<void> => {
      await rm(checkoutDir, { recursive: true, force: true }).catch(() => undefined);
    };
    process.once("exit", () => {
      void cleanup();
    });
    process.once("SIGINT", () => {
      void cleanup();
    });
    process.once("SIGTERM", () => {
      void cleanup();
    });

    return new GitRegistryBackend(repoUrl, checkoutDir);
  }

  async health(): Promise<RegistryHealth> {
    await this.refresh();
    return { status: "ok", name: "skuare-git" };
  }

  private async refresh(): Promise<void> {
    await git(["pull", "--ff-only", "--quiet"], this.checkoutDir).catch(async () => {
      await git(["fetch", "--all", "--quiet"], this.checkoutDir);
    });
  }

  async listSkills(query = ""): Promise<RegistrySkillEntry[]> {
    await this.refresh();
    const items = await this.scanSkills();
    const q = query.trim().toLowerCase();
    return items
      .filter((item) => !q || [item.skill_id, item.name, item.description].some((value) => value.toLowerCase().includes(q)))
      .sort((left, right) => left.skill_id.localeCompare(right.skill_id) || left.version.localeCompare(right.version));
  }

  private async scanSkills(): Promise<RegistrySkillEntry[]> {
    const entries = await readdir(this.checkoutDir, { withFileTypes: true });
    const out: RegistrySkillEntry[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".") || entry.name === "agentsmd") {
        continue;
      }
      const authorRoot = join(this.checkoutDir, entry.name);
      const files = await walkFiles(authorRoot);
      for (const file of files) {
        if (basename(file) !== "SKILL.md") {
          continue;
        }
        const versionDir = dirname(file);
        const skillRoot = dirname(versionDir);
        const skillID = normalizePath(relative(authorRoot, skillRoot));
        if (!skillID) {
          continue;
        }
        const content = await readFile(file, "utf8");
        const parsed = parseSkillFrontmatter(content);
        const info = await stat(file);
        out.push({
          skill_id: skillID,
          version: basename(versionDir),
          name: parsed.name || basename(skillRoot),
          author: parsed.metadataAuthor || "",
          description: parsed.description || "",
          path: versionDir,
          updated_at: info.mtime.toISOString(),
        });
      }
    }
    return out;
  }

  async getSkillOverview(skillID: string): Promise<RegistrySkillOverview> {
    await this.refresh();
    const entries = (await this.scanSkills()).filter((item) => item.skill_id === skillID);
    if (entries.length === 0) {
      throw notFoundError();
    }
    return {
      skill_id: skillID,
      author: entries.find((item) => item.author)?.author || "",
      versions: entries.map((item) => item.version).sort((a, b) => a.localeCompare(b)),
    };
  }

  async getSkillVersion(skillID: string, version: string): Promise<RegistrySkillDetail> {
    await this.refresh();
    const versionDir = await this.findSkillVersionDir(skillID, version);
    const skillFile = join(versionDir, "SKILL.md");
    const parsed = parseSkillFrontmatter(await readFile(skillFile, "utf8"));
    const files = await walkFiles(versionDir);
    const fileSpecs = [];
    for (const file of files) {
      const content = await readFile(file);
      const rel = normalizePath(relative(versionDir, file));
      if (isUtf8Text(content)) {
        fileSpecs.push({ path: rel, content: content.toString("utf8"), size: content.length });
      } else {
        fileSpecs.push({ path: rel, content: content.toString("base64"), encoding: "base64", size: content.length });
      }
    }
    const info = await stat(skillFile);
    return {
      skill_id: skillID,
      version,
      name: parsed.name || basename(dirname(versionDir)),
      author: parsed.metadataAuthor || "",
      description: parsed.description || "",
      path: versionDir,
      updated_at: info.mtime.toISOString(),
      files: fileSpecs.sort((left, right) => left.path.localeCompare(right.path)),
    };
  }

  async validateSkill(skillID: string, version: string): Promise<RegistrySkillEntry> {
    const detail = await this.getSkillVersion(skillID, version);
    const skillFile = detail.files.find((item) => item.path === "SKILL.md");
    if (!skillFile) {
      throw invalidArgumentError("missing SKILL.md");
    }
    parseSkillMarkdown(String(skillFile.content));
    return {
      skill_id: detail.skill_id,
      version: detail.version,
      name: detail.name,
      author: detail.author,
      description: detail.description,
      path: detail.path,
      updated_at: detail.updated_at,
    };
  }

  async publishSkill(request: PublishSkillRequest): Promise<RegistrySkillEntry> {
    await this.refresh();
    const { body, contentType } = request;
    if (body === undefined) {
      throw invalidArgumentError("missing request body");
    }
    const payload = body instanceof Uint8Array ? parseMultipartSkillUpload(body, contentType) : parseJsonSkillUpload(body);
    const created = await this.writeSkillPayload(payload);
    await this.commitAndPush(`feat: publish skill ${created.skill_id}@${created.version}`);
    return created;
  }

  private async writeSkillPayload(payload: ParsedSkillUpload): Promise<RegistrySkillEntry> {
    const authorDir = resolveAuthorDir(payload.author);
    const targetDir = join(this.checkoutDir, authorDir, ...payload.skill_id.split("/"), payload.version);
    const existingDir = await this.tryFindSkillVersionDir(payload.skill_id, payload.version);
    if (existingDir && !payload.force) {
      throw alreadyExistsError();
    }
    if (existingDir) {
      await rm(existingDir, { recursive: true, force: true });
      await cleanupEmptyParents(dirname(existingDir), this.checkoutDir);
    }
    await mkdir(targetDir, { recursive: true });
    for (const file of payload.files) {
      const targetPath = join(targetDir, ...file.path.split("/"));
      await mkdir(dirname(targetPath), { recursive: true });
      await writeFile(targetPath, file.content);
    }
    const skillFile = join(targetDir, "SKILL.md");
    const parsed = parseSkillFrontmatter(await readFile(skillFile, "utf8"));
    const info = await stat(skillFile);
    return {
      skill_id: payload.skill_id,
      version: payload.version,
      name: parsed.name || payload.skill_id.split("/").at(-1) || payload.skill_id,
      author: parsed.metadataAuthor || "",
      description: parsed.description || "",
      path: targetDir,
      updated_at: info.mtime.toISOString(),
    };
  }

  async deleteSkill(skillID: string, version: string, _auth?: WriteAuth): Promise<void> {
    await this.refresh();
    const versionDir = await this.findSkillVersionDir(skillID, version);
    await rm(versionDir, { recursive: true, force: true });
    await cleanupEmptyParents(dirname(versionDir), this.checkoutDir);
    await this.commitAndPush(`feat: delete skill ${skillID}@${version}`);
  }

  async listAgentsMD(query = ""): Promise<RegistryAgentsMDEntry[]> {
    await this.refresh();
    const items = await this.scanAgentsMD();
    const q = query.trim().toLowerCase();
    return items
      .filter((item) => !q || item.agentsmd_id.toLowerCase().includes(q))
      .sort((left, right) => left.agentsmd_id.localeCompare(right.agentsmd_id) || left.version.localeCompare(right.version));
  }

  private async scanAgentsMD(): Promise<RegistryAgentsMDEntry[]> {
    const root = join(this.checkoutDir, "agentsmd");
    const info = await stat(root).catch(() => undefined);
    if (!info?.isDirectory()) {
      return [];
    }
    const files = await walkFiles(root);
    const out: RegistryAgentsMDEntry[] = [];
    for (const file of files) {
      if (basename(file) !== "AGENTS.md") {
        continue;
      }
      const versionDir = dirname(file);
      const agentsmdRoot = dirname(versionDir);
      const agentsmdID = normalizePath(relative(root, agentsmdRoot));
      if (!agentsmdID) {
        continue;
      }
      const version = basename(versionDir);
      out.push({
        agentsmd_id: agentsmdID,
        version,
        id: `${agentsmdID}@${version}`,
        name: agentsmdID,
        author: "undefined",
        description: "",
      });
    }
    return out;
  }

  async getAgentsMDOverview(agentsmdID: string): Promise<RegistryAgentsMDOverview> {
    await this.refresh();
    const items = (await this.scanAgentsMD()).filter((item) => item.agentsmd_id === agentsmdID);
    if (items.length === 0) {
      throw notFoundError();
    }
    return {
      agentsmd_id: agentsmdID,
      versions: items.map((item) => item.version).sort((a, b) => a.localeCompare(b)),
      ids: items.map((item) => item.id),
    };
  }

  async getAgentsMDVersion(agentsmdID: string, version: string): Promise<RegistryAgentsMDDetail> {
    await this.refresh();
    const versionDir = await this.findAgentsMDVersionDir(agentsmdID, version);
    const content = await readFile(join(versionDir, "AGENTS.md"), "utf8");
    return {
      agentsmd_id: agentsmdID,
      version,
      id: `${agentsmdID}@${version}`,
      content,
    };
  }

  async publishAgentsMD(request: PublishAgentsMDRequest): Promise<RegistryAgentsMDEntry> {
    await this.refresh();
    const created = await this.writeAgentsMD({
      agentsmd_id: request.agentsmdID,
      version: request.version,
      content: request.content,
    });
    await this.commitAndPush(`feat: publish agentsmd ${created.agentsmd_id}@${created.version}`);
    return created;
  }

  private async writeAgentsMD(body: JsonValue | Uint8Array | undefined): Promise<RegistryAgentsMDEntry> {
    if (!body || body instanceof Uint8Array || typeof body !== "object" || Array.isArray(body)) {
      throw invalidArgumentError("invalid agentsmd body");
    }
    const row = body as Record<string, JsonValue>;
    const agentsmdID = String(row.agentsmd_id || "").trim();
    const version = String(row.version || "").trim();
    const content = String(row.content || "");
    if (!agentsmdID || !version) {
      throw invalidArgumentError("missing agentsmd_id or version");
    }
    const targetDir = join(this.checkoutDir, "agentsmd", ...agentsmdID.split("/"), version);
    const exists = await stat(targetDir).then(() => true).catch(() => false);
    if (exists) {
      throw alreadyExistsError();
    }
    await mkdir(targetDir, { recursive: true });
    await writeFile(join(targetDir, "AGENTS.md"), content, "utf8");
    await writeFile(
      join(targetDir, "meta.json"),
      JSON.stringify({ agentsmd_id: agentsmdID, version }, null, 2),
      "utf8"
    );
    return {
      agentsmd_id: agentsmdID,
      version,
      id: `${agentsmdID}@${version}`,
      name: agentsmdID,
      author: "undefined",
      description: "",
    };
  }

  async deleteAgentsMD(agentsmdID: string, version: string, _auth?: WriteAuth): Promise<void> {
    await this.refresh();
    const versionDir = await this.findAgentsMDVersionDir(agentsmdID, version);
    await rm(versionDir, { recursive: true, force: true });
    await cleanupEmptyParents(dirname(versionDir), join(this.checkoutDir, "agentsmd"));
    await this.commitAndPush(`feat: delete agentsmd ${agentsmdID}@${version}`);
  }

  private async findSkillVersionDir(skillID: string, version: string): Promise<string> {
    const found = await this.tryFindSkillVersionDir(skillID, version);
    if (!found) {
      throw notFoundError();
    }
    return found;
  }

  private async tryFindSkillVersionDir(skillID: string, version: string): Promise<string | undefined> {
    const entries = await readdir(this.checkoutDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".") || entry.name === "agentsmd") {
        continue;
      }
      const candidate = join(this.checkoutDir, entry.name, ...skillID.split("/"), version);
      const info = await stat(candidate).catch(() => undefined);
      if (info?.isDirectory()) {
        return candidate;
      }
    }
    return undefined;
  }

  private async findAgentsMDVersionDir(agentsmdID: string, version: string): Promise<string> {
    const target = join(this.checkoutDir, "agentsmd", ...agentsmdID.split("/"), version);
    const info = await stat(target).catch(() => undefined);
    if (!info?.isDirectory()) {
      throw notFoundError();
    }
    return target;
  }

  private async commitAndPush(message: string): Promise<void> {
    const status = await git(["status", "--porcelain"], this.checkoutDir);
    if (!status.stdout.trim()) {
      return;
    }
    await git(["add", "-A"], this.checkoutDir);
    await git(
      ["-c", "user.name=skuare", "-c", "user.email=skuare@example.local", "commit", "-m", message, "--quiet"],
      this.checkoutDir
    );
    await git(["push", "origin", "HEAD"], this.checkoutDir);
  }
}

async function git(args: string[], cwd: string): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync("git", args, { cwd, encoding: "utf8" });
}

function normalizeGitServer(server: string): string {
  const trimmed = server.trim();
  if (trimmed.startsWith("git+")) {
    return trimmed.slice(4);
  }
  return trimmed;
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\/+/, "").replace(/^\/+|\/+$/g, "");
}

async function walkFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const fullPath = join(root, entry.name);
    if (entry.isDirectory()) {
      out.push(...await walkFiles(fullPath));
      continue;
    }
    if (entry.isFile()) {
      out.push(fullPath);
    }
  }
  return out;
}

function isUtf8Text(content: Buffer): boolean {
  try {
    new TextDecoder("utf8", { fatal: true }).decode(content);
    return true;
  } catch {
    return false;
  }
}

function resolveAuthorDir(author: string): string {
  const trimmed = author.trim();
  return trimmed ? trimmed : anonymousSkillAuthorDir;
}

type ParsedSkillUpload = {
  skill_id: string;
  version: string;
  force: boolean;
  author: string;
  files: Array<{ path: string; content: Buffer }>;
};

function parseJsonSkillUpload(body: JsonValue): ParsedSkillUpload {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw invalidArgumentError("invalid skill body");
  }
  const row = body as Record<string, JsonValue>;
  const skillID = String(row.skill_id || "").trim();
  const version = String(row.version || "").trim();
  const force = row.force === true;
  if (!skillID || !version) {
    throw invalidArgumentError("missing skill_id or version");
  }

  const fileRows = Array.isArray(row.files) ? row.files : [];
  const files: Array<{ path: string; content: Buffer }> = [];
  for (const file of fileRows) {
    if (!file || typeof file !== "object" || Array.isArray(file)) {
      continue;
    }
    const item = file as Record<string, JsonValue>;
    const filePath = normalizeBundleFilePath(String(item.path || ""));
    const encoding = String(item.encoding || "").trim().toLowerCase();
    const rawContent = String(item.content || "");
    files.push({
      path: filePath,
      content: encoding === "base64" ? Buffer.from(rawContent, "base64") : Buffer.from(rawContent, "utf8"),
    });
  }
  if (!files.some((file) => file.path === "SKILL.md")) {
    const skill = row.skill;
    if (!skill || typeof skill !== "object" || Array.isArray(skill)) {
      throw invalidArgumentError("missing skill definition");
    }
    const parsedSkill = skill as Record<string, JsonValue>;
    const description = String(parsedSkill.description || "").trim();
    const overview = String(parsedSkill.overview || "").trim();
    const sections = Array.isArray(parsedSkill.sections) ? parsedSkill.sections : [];
    files.unshift({
      path: "SKILL.md",
      content: Buffer.from(renderSkillMarkdown(skillID, version, description, overview, sections), "utf8"),
    });
  }
  const parsed = parseSkillFrontmatter(Buffer.from(files.find((file) => file.path === "SKILL.md")!.content).toString("utf8"));
  return {
    skill_id: skillID,
    version,
    force,
    author: parsed.metadataAuthor || "",
    files,
  };
}

function parseMultipartSkillUpload(
  body: Uint8Array,
  contentType?: string
): ParsedSkillUpload {
  const boundaryMatch = String(contentType || "").match(/boundary=([^;]+)/);
  if (!boundaryMatch) {
    throw invalidArgumentError("multipart boundary missing");
  }
  const parts = parseMultipartBody(Buffer.from(body), boundaryMatch[1]);
  const metadataRaw = parts.get("metadata");
  const bundleRaw = parts.get("bundle");
  if (!metadataRaw || !bundleRaw) {
    throw invalidArgumentError("multipart request requires metadata and bundle");
  }
  const metadata = JSON.parse(Buffer.from(metadataRaw.content).toString("utf8")) as Record<string, JsonValue>;
  const bundleFiles = parseTarEntries(gunzipSync(bundleRaw.content)).map((file) => ({
    path: normalizeBundleFilePath(file.path),
    content: file.content,
  }));
  if (!bundleFiles.some((file) => file.path === "SKILL.md")) {
    throw invalidArgumentError("bundle must include SKILL.md");
  }
  const parsed = parseSkillFrontmatter(Buffer.from(bundleFiles.find((file) => file.path === "SKILL.md")!.content).toString("utf8"));
  return {
    skill_id: String(metadata.skill_id || "").trim(),
    version: String(metadata.version || "").trim(),
    force: metadata.force === true,
    author: parsed.metadataAuthor || "",
    files: bundleFiles,
  };
}

function parseMultipartBody(body: Buffer, boundary: string): Map<string, { content: Buffer }> {
  const marker = `--${boundary}`;
  const segments = Buffer.from(body).toString("latin1").split(marker).slice(1, -1);
  const out = new Map<string, { content: Buffer }>();
  for (const segment of segments) {
    const trimmed = segment.replace(/^\r\n/, "").replace(/\r\n$/, "");
    const headerEnd = trimmed.indexOf("\r\n\r\n");
    if (headerEnd < 0) {
      continue;
    }
    const headerText = trimmed.slice(0, headerEnd);
    const bodyText = trimmed.slice(headerEnd + 4);
    const nameMatch = headerText.match(/name="([^"]+)"/);
    if (!nameMatch) {
      continue;
    }
    out.set(nameMatch[1], { content: Buffer.from(bodyText, "latin1") });
  }
  return out;
}

function parseTarEntries(input: Buffer): Array<{ path: string; content: Buffer }> {
  const entries: Array<{ path: string; content: Buffer }> = [];
  let offset = 0;
  while (offset + 512 <= input.length) {
    const header = input.subarray(offset, offset + 512);
    offset += 512;
    if (header.every((value) => value === 0)) {
      break;
    }
    const name = readTarString(header, 0, 100);
    const prefix = readTarString(header, 345, 155);
    const sizeRaw = readTarString(header, 124, 12).replace(/\0.*$/, "").trim();
    const size = parseInt(sizeRaw || "0", 8);
    const fullPath = normalizePath(prefix ? `${prefix}/${name}` : name);
    const content = Buffer.from(input.subarray(offset, offset + size));
    entries.push({ path: fullPath, content });
    offset += Math.ceil(size / 512) * 512;
  }
  return entries;
}

function readTarString(buffer: Buffer, offset: number, size: number): string {
  return Buffer.from(buffer.subarray(offset, offset + size)).toString("utf8").replace(/\0.*$/, "");
}

function normalizeBundleFilePath(value: string): string {
  const normalized = normalizePath(value);
  if (!normalized || normalized.includes("..")) {
    throw invalidArgumentError(`invalid bundle path: ${value}`);
  }
  return normalized;
}

function renderSkillMarkdown(
  skillID: string,
  version: string,
  description: string,
  overview: string,
  sections: JsonValue[]
): string {
  const lines = [
    "---",
    `name: ${toYamlString(skillID.split("/").at(-1) || skillID)}`,
    "metadata:",
    `  version: ${toYamlString(version)}`,
    "description: " + toYamlString(description),
    "---",
    "",
    `# ${skillID}`,
    "",
    "## Overview",
    overview,
  ];
  for (const section of sections) {
    if (!section || typeof section !== "object" || Array.isArray(section)) {
      continue;
    }
    const row = section as Record<string, JsonValue>;
    const title = String(row.title || "").trim();
    const content = String(row.content || "").trim();
    if (!title || !content) {
      continue;
    }
    lines.push("", `## ${title}`, content);
  }
  lines.push("");
  return lines.join("\n");
}

async function cleanupEmptyParents(startDir: string, stopDir: string): Promise<void> {
  let current = resolve(startDir);
  const stop = resolve(stopDir);
  while (current.startsWith(stop) && current !== stop) {
    const children = await readdir(current).catch(() => []);
    if (children.length > 0) {
      return;
    }
    await rm(current, { recursive: true, force: true });
    current = dirname(current);
  }
}

function alreadyExistsError(): DomainError {
  return new DomainError("SKILL_VERSION_ALREADY_EXISTS", "skill version already exists", { details: { status: 409 } });
}

function notFoundError(): DomainError {
  return new DomainError("SKILL_VERSION_NOT_FOUND", "skill/version not found", { details: { status: 404 } });
}

function invalidArgumentError(message: string): DomainError {
  return new DomainError("INVALID_ARGUMENT", message, { details: { status: 400 } });
}
