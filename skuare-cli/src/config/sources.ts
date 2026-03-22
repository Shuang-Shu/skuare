import { DomainError } from "../domain/errors";
import type { RemoteSourceConfig, RemoteSourceKind } from "../types";

export function normalizeRemoteSources(
  input: unknown
): Record<string, RemoteSourceConfig> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }

  const out: Record<string, RemoteSourceConfig> = {};
  for (const [name, value] of Object.entries(input as Record<string, unknown>)) {
    const normalizedName = normalizeSourceName(name);
    if (!normalizedName || !value || typeof value !== "object" || Array.isArray(value)) {
      continue;
    }
    const row = value as { kind?: unknown; url?: unknown };
    const kind = row.kind === "git" ? "git" : row.kind === "svc" ? "svc" : undefined;
    const url = typeof row.url === "string" ? row.url.trim() : "";
    if (!kind || !url) {
      continue;
    }
    out[normalizedName] = { kind, url };
  }
  return out;
}

export function normalizeSourceName(name: string): string {
  return String(name || "").trim();
}

export function normalizeRemoteSourceUrl(kind: RemoteSourceKind, rawUrl: string): string {
  const url = String(rawUrl || "").trim();
  if (!url) {
    throw new DomainError("CLI_INVALID_ARGUMENT", "Remote source URL cannot be empty");
  }

  if (kind === "svc") {
    if (!/^https?:\/\//i.test(url)) {
      throw new DomainError("CLI_INVALID_ARGUMENT", `Service source must use http:// or https://: ${url}`);
    }
    return url.replace(/\/+$/, "");
  }

  const normalized = normalizeGitSshUrl(url);
  if (!normalized) {
    throw new DomainError(
      "CLI_INVALID_ARGUMENT",
      `Git source only supports SSH URLs: ${url}. Use git+ssh://<user>@<host>/<repo>.git or <user>@<host>:<repo>.git`
    );
  }
  return normalized;
}

export function normalizeGitSshUrl(rawUrl: string): string | undefined {
  const url = String(rawUrl || "").trim();
  if (!url) {
    return undefined;
  }

  if (/^git\+ssh:\/\//i.test(url)) {
    return url;
  }

  if (/^ssh:\/\//i.test(url)) {
    return `git+${url}`;
  }

  const scpLike = url.match(/^([^@/\s]+@[^:/\s]+):(.+)$/);
  if (scpLike) {
    const [, userHost, repoPath] = scpLike;
    return `git+ssh://${userHost}/${repoPath}`;
  }

  return undefined;
}
