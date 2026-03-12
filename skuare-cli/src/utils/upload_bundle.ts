import { randomBytes } from "node:crypto";
import { gzipSync } from "node:zlib";

export type UploadBundleFile = {
  path: string;
  content: Uint8Array;
};

export type MultipartPart = {
  name: string;
  content: Uint8Array | string;
  filename?: string;
  contentType?: string;
};

export function buildTarGzBundle(files: UploadBundleFile[]): Buffer {
  const chunks: Buffer[] = [];
  for (const file of files) {
    const path = normalizeBundlePath(file.path);
    const content = Buffer.from(file.content);
    chunks.push(buildTarHeader(path, content.length));
    chunks.push(content);
    const remainder = content.length % 512;
    if (remainder !== 0) {
      chunks.push(Buffer.alloc(512 - remainder, 0));
    }
  }
  chunks.push(Buffer.alloc(1024, 0));
  return gzipSync(Buffer.concat(chunks));
}

export function buildMultipartFormData(parts: MultipartPart[]): { body: Buffer; contentType: string } {
  const boundary = `----skuare-${randomBytes(12).toString("hex")}`;
  const chunks: Buffer[] = [];
  for (const part of parts) {
    chunks.push(Buffer.from(`--${boundary}\r\n`));
    const disposition = [`form-data; name="${escapeHeaderValue(part.name)}"`];
    if (part.filename) {
      disposition.push(`filename="${escapeHeaderValue(part.filename)}"`);
    }
    chunks.push(Buffer.from(`Content-Disposition: ${disposition.join("; ")}\r\n`));
    if (part.contentType) {
      chunks.push(Buffer.from(`Content-Type: ${part.contentType}\r\n`));
    }
    chunks.push(Buffer.from("\r\n"));
    chunks.push(typeof part.content === "string" ? Buffer.from(part.content) : Buffer.from(part.content));
    chunks.push(Buffer.from("\r\n"));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    body: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

function normalizeBundlePath(input: string): string {
  const normalized = input.replace(/\\/g, "/").replace(/^\.\/+/, "").trim();
  if (!normalized) {
    throw new Error("bundle file path cannot be empty");
  }
  if (normalized.startsWith("/") || normalized.includes("..")) {
    throw new Error(`bundle file path must stay within the skill directory: ${input}`);
  }
  return normalized;
}

function buildTarHeader(path: string, size: number): Buffer {
  const { name, prefix } = splitTarPath(path);
  const header = Buffer.alloc(512, 0);
  writeStringField(header, 0, 100, name);
  writeOctalField(header, 100, 8, 0o644);
  writeOctalField(header, 108, 8, 0);
  writeOctalField(header, 116, 8, 0);
  writeOctalField(header, 124, 12, size);
  writeOctalField(header, 136, 12, Math.floor(Date.now() / 1000));
  header.fill(0x20, 148, 156);
  header[156] = "0".charCodeAt(0);
  writeStringField(header, 257, 6, "ustar");
  writeStringField(header, 263, 2, "00");
  writeStringField(header, 345, 155, prefix);
  let sum = 0;
  for (const value of header.values()) {
    sum += value;
  }
  const checksum = sum.toString(8).padStart(6, "0");
  writeStringField(header, 148, 6, checksum);
  header[154] = 0;
  header[155] = 0x20;
  return header;
}

function splitTarPath(path: string): { name: string; prefix: string } {
  const encoded = Buffer.byteLength(path);
  if (encoded <= 100) {
    return { name: path, prefix: "" };
  }
  const slash = path.lastIndexOf("/");
  if (slash <= 0) {
    throw new Error(`bundle path is too long for tar header: ${path}`);
  }
  const prefix = path.slice(0, slash);
  const name = path.slice(slash + 1);
  if (Buffer.byteLength(name) > 100 || Buffer.byteLength(prefix) > 155 || Buffer.byteLength(prefix) + Buffer.byteLength(name) + 1 > 256) {
    throw new Error(`bundle path is too long for tar header: ${path}`);
  }
  return { name, prefix };
}

function writeStringField(buffer: Buffer, offset: number, size: number, value: string): void {
  const input = Buffer.from(value);
  input.copy(buffer, offset, 0, Math.min(input.length, size));
}

function writeOctalField(buffer: Buffer, offset: number, size: number, value: number): void {
  const octal = value.toString(8).padStart(size - 1, "0");
  writeStringField(buffer, offset, size - 1, octal);
  buffer[offset + size - 1] = 0;
}

function escapeHeaderValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}
