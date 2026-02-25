/**
 * 技能查询命令（读操作）
 */

import type { CommandContext } from "./types";
import { BaseCommand } from "./base";
import { callApi } from "../http/client";
import type { JsonValue } from "./types";
import { mkdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

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
    const installed = await this.collectInstallSet(context, skillID, versionArg);

    for (const id of installed) {
      await mkdir(join(targetRoot, id), { recursive: true });
    }
    console.log(JSON.stringify({ llm_tool: tool, target: targetRoot, skills: installed }, null, 2));
  }

  private resolveTargetTool(llmTools: string[]): string {
    const first = (llmTools || []).map((v) => v.trim()).find(Boolean);
    if (!first) {
      this.fail("No llmTools configured. Run `skr init` and select at least one tool");
    }
    return first;
  }

  private async collectInstallSet(context: CommandContext, rootSkill: string, versionArg?: string): Promise<string[]> {
    const queue: string[] = [rootSkill];
    const seen = new Set<string>();

    while (queue.length > 0) {
      const current = queue.shift() as string;
      if (seen.has(current)) {
        continue;
      }
      seen.add(current);

      const version = await this.resolveVersion(context, current, current === rootSkill ? versionArg : undefined);
      const depSkills = await this.readDependenciesFromRemoteFiles(context, current, version);
      for (const dep of depSkills) {
        if (!seen.has(dep)) {
          queue.push(dep);
        }
      }
    }

    return Array.from(seen).sort((a, b) => a.localeCompare(b));
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

  private async readDependenciesFromRemoteFiles(context: CommandContext, skillID: string, version: string): Promise<string[]> {
    const resp = await callApi({
      method: "GET",
      path: `/api/v1/skills/${encodeURIComponent(skillID)}/${encodeURIComponent(version)}`,
      server: context.server,
      silent: true,
    });
    const data = (resp.data && typeof resp.data === "object" && !Array.isArray(resp.data))
      ? (resp.data as { files?: JsonValue }).files
      : undefined;
    const files = Array.isArray(data) ? data.map((v) => String(v).trim()).filter(Boolean) : [];
    const depName = files.includes("skill-deps.lock.json") ? "skill-deps.lock.json" : (files.includes("skill-deps.json") ? "skill-deps.json" : "");
    if (!depName) {
      return [];
    }

    // 服务端 detail 当前仅返回文件名，内容缺失时回退到本地同名 skill 目录依赖文件解析。
    const localCandidates = [
      join(context.cwd, skillID, depName),
      join(context.cwd, "examples", skillID, depName),
    ];
    for (const p of localCandidates) {
      const info = await stat(p).catch(() => undefined);
      if (!info?.isFile()) {
        continue;
      }
      const raw = await readFile(p, "utf8");
      const parsed = JSON.parse(raw) as unknown;
      const deps = (parsed && typeof parsed === "object" && !Array.isArray(parsed))
        ? (parsed as { dependencies?: unknown }).dependencies
        : undefined;
      if (!Array.isArray(deps)) {
        return [];
      }
      return deps
        .map((row) => (row && typeof row === "object" ? String((row as { skill?: unknown }).skill || "").trim() : ""))
        .filter(Boolean);
    }
    return [];
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
