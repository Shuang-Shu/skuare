/**
 * Skuare CLI 类型定义
 */

import { DEFAULT_REMOTE_ADDRESS, DEFAULT_REMOTE_PORT, DEFAULT_REMOTE_STORAGE_DIR } from "../defaults";

// ============================================================================
// 配置相关类型
// ============================================================================

export type ConfigScope = "global" | "workspace";
export type WorkspaceInitMode = "reuse-global" | "modify" | "new";
export type RemoteMode = "local" | "remote";
export type ModifyField = "mode" | "address" | "port" | "storageDir" | "keyId" | "privateKeyFile" | "llmTools";

export type RemoteConfig = {
  mode: RemoteMode;
  address: string;
  port: number;
  storageDir: string;
};

export type WriteAuth = {
  keyId: string;
  privateKeyFile: string;
};

export type SkuareConfig = {
  remote: RemoteConfig;
  auth: WriteAuth;
  llmTools: string[];
};

// ============================================================================
// CLI 参数类型
// ============================================================================

export type CliArgs = {
  serverOverride?: string;
  keyIdOverride?: string;
  privateKeyFileOverride?: string;
  rest: string[];
};

export type ParsedGlobalFlags = CliArgs;

// ============================================================================
// HTTP 请求类型
// ============================================================================

export type HttpMethod = "GET" | "POST" | "DELETE";

export type JsonValue = null | boolean | number | string | JsonValue[] | { [k: string]: JsonValue };

export type ApiRequestOptions = {
  method: HttpMethod;
  path: string;
  body?: JsonValue;
  auth?: WriteAuth;
  server: string;
};

// ============================================================================
// TUI 相关类型
// ============================================================================

export type LlmToolRow = { kind: "tool"; value: string } | { kind: "add-custom" };

export type SelectOption<T> = {
  label: string;
  value: T;
};

// ============================================================================
// 常量
// ============================================================================

export const DEFAULT_CONFIG_DIR_NAME = ".skuare";
export const DEFAULT_CONFIG_FILE_NAME = "config.json";

// ============================================================================
// 默认配置工厂
// ============================================================================

export function createDefaultConfig(): SkuareConfig {
  return {
    remote: {
      mode: "remote",
      address: DEFAULT_REMOTE_ADDRESS,
      port: DEFAULT_REMOTE_PORT,
      storageDir: DEFAULT_REMOTE_STORAGE_DIR,
    },
    auth: {
      keyId: "",
      privateKeyFile: "",
    },
    llmTools: ["codex"],
  };
}
