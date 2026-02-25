/**
 * 技能查询命令（读操作）
 */

import type { CommandContext } from "./types";
import { BaseCommand } from "./base";
import { callApi } from "../http/client";
import type { JsonValue } from "./types";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

type RemoteFile = { path: string; content: string };

function normalizePath(input: string): string {
  return input.replace(/\\/g, "/").replace(/^\.\/+/, "");
}

/**
 * 列出技能命令
 */
export class ListCommand extends BaseCommand {
  readonly name = "list";
  readonly description = "List skills (GET /api/v1/skills)";

  async execute(context: CommandContext): Promise<void> {
    const q = this.parseOptionValue(context.args, "--q");
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
    const normalized = items
      .filter((x): x is Record<string, JsonValue> => !!x && typeof x === "object" && !Array.isArray(x))
      .map((x) => ({
        skill_id: x.skill_id,
        version: x.version,
        name: x.name,
        description: x.description,
      }));

    console.log(JSON.stringify({ items: normalized }, null, 2));
  }
}

/**
 * 获取技能详情命令
 */
export class PeekCommand extends BaseCommand {
  readonly name = "peek";
  readonly description = "Peek skill overview/detail";

  async execute(context: CommandContext): Promise<void> {
    const [skillID, version] = context.args;

    if (!skillID) {
      this.fail("Missing <skillID>. Usage: skuare peek <skillID> [version]");
    }

    const path = version
      ? `/api/v1/skills/${encodeURIComponent(skillID)}/${encodeURIComponent(version)}`
      : `/api/v1/skills/${encodeURIComponent(skillID)}`;

    await callApi({
      method: "GET",
      path,
      server: context.server,
    });
  }
}

export class GetCommand extends BaseCommand {
  readonly name = "get";
  readonly description = "Install skill to local llm tool directory";

  async execute(context: CommandContext): Promise<void> {
    const [skillID, versionArg] = context.args;
    if (!skillID) {
      this.fail("Missing <skillID>. Usage: skuare get <skillID> [version]");
    }
    const tool = this.resolveTargetTool(context.llmTools);
    const targetRoot = join(context.cwd, `.${tool}`, "skills");
    const installed = await this.installWithDependencies(context, targetRoot, skillID, versionArg);
    console.log(JSON.stringify({ llm_tool: tool, target: targetRoot, skills: installed.sort((a, b) => a.localeCompare(b)) }, null, 2));
  }

  private resolveTargetTool(llmTools: string[]): string {
    const first = (llmTools || []).map((v) => v.trim()).find(Boolean);
    if (!first) {
      this.fail("No llmTools configured. Run `skr init` and select at least one tool");
    }
    return first;
  }

  private async installWithDependencies(
    context: CommandContext,
    targetRoot: string,
    rootSkill: string,
    versionArg?: string
  ): Promise<string[]> {
    const queue: string[] = [rootSkill];
    const installed = new Set<string>();
    const visiting = new Set<string>();

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

      await this.writeSkillFiles(targetRoot, skill, files);
      installed.add(skill);
      visiting.delete(skill);

      for (const dep of deps) {
        if (!installed.has(dep)) {
          queue.push(dep);
        }
      }
    }

    return Array.from(installed);
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

  private async writeSkillFiles(targetRoot: string, skillID: string, files: RemoteFile[]): Promise<void> {
    const skillDir = join(targetRoot, skillID);
    await mkdir(skillDir, { recursive: true });
    for (const file of files) {
      const rel = normalizePath(file.path).replace(/^(\.\.\/)+/, "");
      const dest = join(skillDir, rel);
      await mkdir(dirname(dest), { recursive: true });
      await writeFile(dest, file.content, "utf8");
    }
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
