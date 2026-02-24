/**
 * 配置解析器 - 负责解析配置路径和构建最终配置
 */

import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { CliArgs, SkuareConfig } from "../types";
import { DEFAULT_CONFIG_DIR_NAME, DEFAULT_CONFIG_FILE_NAME, createDefaultConfig } from "../types";
import { loadConfig } from "./loader";
import { mergeConfig } from "./merger";

/**
 * 配置解析结果
 */
export type ResolvedConfig = {
  server: string;
  localMode: boolean;
  auth: {
    keyId: string;
    privateKeyFile: string;
  };
  merged: SkuareConfig;
};

/**
 * 获取全局配置目录路径
 */
export function getGlobalConfigDirPath(): string {
  return join(homedir(), DEFAULT_CONFIG_DIR_NAME);
}

/**
 * 获取全局配置文件路径
 */
export function getGlobalConfigPath(): string {
  return join(getGlobalConfigDirPath(), DEFAULT_CONFIG_FILE_NAME);
}

/**
 * 获取工作区配置文件路径
 */
export function getWorkspaceConfigPath(cwd: string): string {
  return join(cwd, DEFAULT_CONFIG_DIR_NAME, DEFAULT_CONFIG_FILE_NAME);
}

/**
 * 判断目标路径是否在基础路径内
 */
export function isInsidePath(targetPath: string, basePath: string): boolean {
  const target = resolve(targetPath);
  const base = resolve(basePath);
  const rel = resolveRelative(base, target);
  return rel === "" || (!rel.startsWith("..") && rel !== ".");
}

/**
 * 构建服务器 URL
 */
export function buildServerURL(address: string, port: number): string {
  const host = normalizeAddress(address);
  return `http://${host}:${port}`;
}

/**
 * 规范化地址（移除协议前缀和尾部斜杠）
 */
export function normalizeAddress(address: string): string {
  return address.trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
}

/**
 * 解析最终配置
 * @param cwd 当前工作目录
 * @param cli CLI 参数
 * @returns 解析后的配置
 */
export async function resolveConfig(cwd: string, cli: CliArgs): Promise<ResolvedConfig> {
  const globalPath = getGlobalConfigPath();
  const workspacePath = getWorkspaceConfigPath(cwd);

  const globalCfg = await loadConfig(globalPath);
  const workspaceCfg = await loadConfig(workspacePath);
  const merged = mergeConfig(createDefaultConfig(), globalCfg, workspaceCfg);

  const envServer = process.env.SKUARE_SVC_URL;
  const envKeyID = process.env.SKUARE_KEY_ID;
  const envPrivKeyFile = process.env.SKUARE_PRIVKEY_FILE;

  const server =
    cli.serverOverride || envServer || buildServerURL(merged.remote.address, merged.remote.port);

  const auth = {
    keyId: cli.keyIdOverride || envKeyID || merged.auth.keyId,
    privateKeyFile: cli.privateKeyFileOverride || envPrivKeyFile || merged.auth.privateKeyFile,
  };

  return { server, localMode: merged.remote.mode === "local", auth, merged };
}

/**
 * 计算相对路径（封装 node:path.relative）
 */
function resolveRelative(from: string, to: string): string {
  const path = require("node:path") as { relative(from: string, to: string): string };
  return path.relative(from, to);
}
