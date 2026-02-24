/**
 * 文件操作工具
 */

import type { JsonValue } from "../types";

/**
 * 读取 JSON 文件
 */
export async function readJsonFile(path: string): Promise<JsonValue> {
  const fs = await import("node:fs/promises");
  const raw = await fs.readFile(path, "utf8");
  return JSON.parse(raw) as JsonValue;
}
