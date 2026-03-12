/**
 * 请求签名器 - 负责为写操作生成数字签名
 */

import { readFile } from "node:fs/promises";
import { randomBytes, createHash, createPrivateKey, sign } from "node:crypto";
import type { WriteAuth, HttpMethod } from "../types";
import { DomainError } from "../domain/errors";

/**
 * 签名请求头
 */
export type SignatureHeaders = {
  "x-skuare-key-id": string;
  "x-skuare-timestamp": string;
  "x-skuare-nonce": string;
  "x-skuare-signature": string;
};

/**
 * 为写操作生成签名头
 * @param method HTTP 方法
 * @param path 请求路径
 * @param bodyText 请求体文本
 * @param auth 认证信息
 * @returns 签名头对象
 */
export async function signWriteRequest(
  method: HttpMethod,
  path: string,
  body: string | Uint8Array,
  auth: WriteAuth
): Promise<SignatureHeaders> {
  if (!auth.keyId) {
    throw new DomainError("CLI_SIGNING_CREDENTIALS_MISSING", "Missing --key-id for write operation");
  }
  if (!auth.privateKeyFile) {
    throw new DomainError("CLI_SIGNING_CREDENTIALS_MISSING", "Missing --privkey-file for write operation");
  }

  const privateKeyPem = await readFile(auth.privateKeyFile, "utf8");
  const ts = Math.floor(Date.now() / 1000).toString();
  const nonce = randomBytes(16).toString("hex");
  const bodyBytes = typeof body === "string" ? Buffer.from(body) : Buffer.from(body);
  const bodyHash = createHash("sha256").update(bodyBytes).digest("hex");

  const canonical = `${method}\n${path}\n${bodyHash}\n${ts}\n${nonce}`;
  const key = createPrivateKey(privateKeyPem);
  const sig = sign(null, Buffer.from(canonical), key).toString("base64");

  return {
    "x-skuare-key-id": auth.keyId,
    "x-skuare-timestamp": ts,
    "x-skuare-nonce": nonce,
    "x-skuare-signature": sig,
  };
}
