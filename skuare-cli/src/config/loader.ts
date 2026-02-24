/**
 * 配置加载器 - 负责从文件系统读取和写入配置
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { SkuareConfig } from "../types";

/**
 * 从指定路径加载配置
 * @param path 配置文件路径
 * @returns 配置对象，如果文件不存在则返回 undefined
 */
export async function loadConfig(path: string): Promise<Partial<SkuareConfig> | undefined> {
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw) as Partial<SkuareConfig>;
  } catch (err) {
    if (isNotFoundError(err)) {
      return undefined;
    }
    throw err;
  }
}

/**
 * 将配置写入指定路径
 * @param path 配置文件路径
 * @param config 配置对象
 */
export async function writeConfig(path: string, config: SkuareConfig): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(config, null, 2) + "\n", "utf8");
}

/**
 * 判断错误是否为文件未找到错误
 */
function isNotFoundError(err: unknown): boolean {
  if (!err || typeof err !== "object") {
    return false;
  }
  const e = err as { code?: string };
  return e.code === "ENOENT";
}
