/**
 * 配置合并器 - 负责合并多个配置源
 */

import type { SkuareConfig } from "../types";
import { createDefaultConfig } from "../types";
import { normalizeRemoteSources, normalizeSourceName } from "./sources";

/**
 * 合并多个配置对象，后面的配置会覆盖前面的配置
 * @param items 配置对象列表
 * @returns 合并后的完整配置
 */
export function mergeConfig(...items: Array<Partial<SkuareConfig> | undefined>): SkuareConfig {
  const result = createDefaultConfig();

  for (const item of items) {
    if (!item) {
      continue;
    }

    if (item.remote?.mode === "local" || item.remote?.mode === "remote") {
      result.remote.mode = item.remote.mode;
    }

    if (item.remote?.address) {
      result.remote.address = item.remote.address;
    }

    if (typeof item.remote?.port === "number") {
      result.remote.port = item.remote.port;
    }

    if (Object.prototype.hasOwnProperty.call(item.remote ?? {}, "defaultSource")) {
      const normalized = normalizeSourceName(String(item.remote?.defaultSource ?? ""));
      result.remote.defaultSource = normalized || undefined;
    }

    if (Object.prototype.hasOwnProperty.call(item.remote ?? {}, "sources")) {
      result.remote.sources = {
        ...(result.remote.sources || {}),
        ...normalizeRemoteSources(item.remote?.sources),
      };
    }

    if (typeof item.auth?.keyId === "string") {
      result.auth.keyId = item.auth.keyId;
    }

    if (typeof item.auth?.privateKeyFile === "string") {
      result.auth.privateKeyFile = item.auth.privateKeyFile;
    }

    if (Array.isArray(item.llmTools) && item.llmTools.length > 0) {
      result.llmTools = Array.from(
        new Set(item.llmTools.map((t) => String(t).trim()).filter(Boolean))
      );
    }

    if (Object.prototype.hasOwnProperty.call(item, "toolSkillDirs")) {
      result.toolSkillDirs = {};
      if (item.toolSkillDirs && typeof item.toolSkillDirs === "object" && !Array.isArray(item.toolSkillDirs)) {
        for (const [tool, dir] of Object.entries(item.toolSkillDirs)) {
          const key = String(tool).trim();
          const val = String(dir ?? "").trim();
          if (!key || !val) {
            continue;
          }
          result.toolSkillDirs[key] = val;
        }
      }
    }
  }

  return result;
}
