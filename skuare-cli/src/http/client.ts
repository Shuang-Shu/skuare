/**
 * HTTP 客户端 - 负责发送 API 请求
 */

import type { HttpMethod, JsonValue } from "../types";
import { signWriteRequest, type SignatureHeaders } from "./signer";
import { DomainError } from "../domain/errors";

/**
 * API 请求选项
 */
export type ApiRequestOptions = {
  method: HttpMethod;
  path: string;
  body?: JsonValue | Uint8Array;
  contentType?: string;
  auth?: { keyId: string; privateKeyFile: string };
  server: string;
  silent?: boolean;
};

export type ApiResponse = {
  status: number;
  data: JsonValue | string | null;
};

/**
 * 检查服务器连通性
 * @param address 服务器地址
 * @param port 服务器端口
 * @param timeoutMs 超时时间（毫秒）
 * @returns 连通性检查结果
 */
export async function checkServerConnectivity(
  address: string,
  port: number,
  timeoutMs: number
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const path = require("node:path") as { join(...parts: string[]): string };
  const target = `${buildServerURL(address, port)}/healthz`;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);

  try {
    const resp = await fetch(target, { method: "GET", signal: ctl.signal });
    if (resp.ok) {
      return { ok: true };
    }
    return { ok: false, reason: `HTTP ${resp.status}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: msg };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 调用 API
 * @param options 请求选项
 */
export async function callApi(options: ApiRequestOptions): Promise<ApiResponse> {
  const { method, path, body, contentType, auth, server, silent } = options;
  const url = buildUrl(path, server);
  const headers: Record<string, string> = {};
  let bodyValue: string | Uint8Array | undefined;

  if (body !== undefined) {
    if (body instanceof Uint8Array) {
      bodyValue = body;
      if (contentType) {
        headers["content-type"] = contentType;
      }
    } else {
      bodyValue = JSON.stringify(body);
      headers["content-type"] = contentType || "application/json";
    }
  }

  if (needsSignature(method, path) && hasSigningCredentials(auth)) {
    const signed = await signWriteRequest(method, path, bodyValue || "", auth);
    Object.assign(headers, signed);
  }

  let resp: Response;
  const fetchBody = bodyValue === undefined
    ? undefined
    : (typeof bodyValue === "string" ? bodyValue : Buffer.from(bodyValue));
  try {
    resp = await fetch(url, {
      method,
      headers: Object.keys(headers).length > 0 ? headers : undefined,
      body: fetchBody,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new DomainError("CLI_NETWORK_ERROR", message, { cause: err, details: { method, path, server } });
  }

  const text = await resp.text();
  const data = text ? tryParseJson(text) : null;

  if (!resp.ok) {
    throw toHttpDomainError(resp.status, resp.statusText, data);
  }

  if (!silent) {
    console.log(JSON.stringify(data, null, 2));
  }
  return {
    status: resp.status,
    data,
  };
}

function toHttpDomainError(status: number, statusText: string, data: JsonValue | string | null): DomainError {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const row = data as Record<string, JsonValue>;
    const code = String(row.code || "").trim();
    const message = String(row.message || "").trim();
    if (code && message) {
      return new DomainError(code, message, { details: { status } });
    }
  }
  const message = typeof data === "string" ? data : JSON.stringify(data);
  return new DomainError("CLI_HTTP_ERROR", `HTTP ${status} ${statusText}: ${message}`, { details: { status } });
}

/**
 * 判断请求是否需要签名
 */
function needsSignature(method: HttpMethod, path: string): boolean {
  return (
    method === "DELETE" ||
    (method === "POST" && path === "/api/v1/skills")
  );
}

function hasSigningCredentials(
  auth?: { keyId: string; privateKeyFile: string }
): auth is { keyId: string; privateKeyFile: string } {
  return Boolean(auth?.keyId && auth?.privateKeyFile);
}

/**
 * 构建完整的 URL
 */
function buildUrl(path: string, server: string): string {
  const url = new URL(path, ensureTrailingSlash(server)).toString();
  return url;
}

/**
 * 确保服务器 URL 以斜杠结尾
 */
function ensureTrailingSlash(server: string): string {
  return server.endsWith("/") ? server : `${server}/`;
}

/**
 * 尝试解析 JSON，失败则返回原文本
 */
function tryParseJson(text: string): JsonValue | string {
  try {
    return JSON.parse(text) as JsonValue;
  } catch {
    return text;
  }
}

/**
 * 构建服务器 URL
 */
function buildServerURL(address: string, port: number): string {
  const host = normalizeAddress(address);
  return `http://${host}:${port}`;
}

/**
 * 规范化地址
 */
function normalizeAddress(v: string): string {
  return v.trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
}
