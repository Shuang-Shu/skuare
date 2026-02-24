#!/usr/bin/env node
"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");

const ENV = {
  repo: process.env.SKUARE_RELEASE_REPO || "",
  version: process.env.SKUARE_SVC_VERSION || "latest",
  token: process.env.GITHUB_TOKEN || "",
  outDir: process.env.SKUARE_SVC_BIN_DIR || path.join(os.homedir(), ".skuare", "bin"),
  enabled: process.env.SKUARE_AUTO_INSTALL_BACKEND || "0",
};

const GO_OS_MAP = {
  linux: "linux",
  darwin: "darwin",
  win32: "windows",
};

const GO_ARCH_MAP = {
  x64: "amd64",
  arm64: "arm64",
};

function log(msg) {
  process.stdout.write(`[skuare-cli] ${msg}\n`);
}

function warn(msg) {
  process.stderr.write(`[skuare-cli][warn] ${msg}\n`);
}

function fail(msg) {
  throw new Error(msg);
}

async function fetchJson(url, token) {
  const headers = { "user-agent": "skuare-cli-installer" };
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }
  const resp = await fetch(url, { headers });
  if (!resp.ok) {
    const text = await resp.text();
    fail(`GitHub API failed: ${resp.status} ${resp.statusText} ${text}`);
  }
  return resp.json();
}

async function fetchBuffer(url, token) {
  const headers = { "user-agent": "skuare-cli-installer" };
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }
  const resp = await fetch(url, { headers, redirect: "follow" });
  if (!resp.ok) {
    const text = await resp.text();
    fail(`Download failed: ${resp.status} ${resp.statusText} ${text}`);
  }
  const ab = await resp.arrayBuffer();
  return Buffer.from(ab);
}

function normalizeVersion(raw) {
  if (!raw || raw === "latest") {
    return "latest";
  }
  return raw.startsWith("v") ? raw : `v${raw}`;
}

function findAsset(assets, goos, goarch) {
  const needle = `_${goos}_${goarch}`;
  return assets.find((a) => a.name.startsWith("skuare-svc_") && a.name.includes(needle) && !a.name.endsWith("checksums.txt"));
}

function findChecksumAsset(assets) {
  return assets.find((a) => a.name.startsWith("skuare-svc_") && a.name.endsWith("checksums.txt"));
}

function parseChecksums(text) {
  const map = new Map();
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    const m = trimmed.match(/^([a-fA-F0-9]{64})\s+\*?(.+)$/);
    if (!m) {
      continue;
    }
    map.set(m[2], m[1].toLowerCase());
  }
  return map;
}

function sha256Hex(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

async function installBinary(opts) {
  const goos = GO_OS_MAP[process.platform];
  const goarch = GO_ARCH_MAP[process.arch];
  if (!goos || !goarch) {
    fail(`Unsupported platform: ${process.platform}/${process.arch}`);
  }

  const version = normalizeVersion(opts.version);
  const api = version === "latest"
    ? `https://api.github.com/repos/${opts.repo}/releases/latest`
    : `https://api.github.com/repos/${opts.repo}/releases/tags/${encodeURIComponent(version)}`;

  const release = await fetchJson(api, opts.token);
  if (!release || !Array.isArray(release.assets)) {
    fail("Invalid release payload from GitHub");
  }

  const asset = findAsset(release.assets, goos, goarch);
  if (!asset) {
    fail(`No binary asset found for ${goos}/${goarch} in release ${release.tag_name}`);
  }

  const checksumAsset = findChecksumAsset(release.assets);
  if (!checksumAsset) {
    fail(`No checksum asset found in release ${release.tag_name}`);
  }

  log(`Downloading ${asset.name} from ${opts.repo}@${release.tag_name}`);
  const [binBuf, sumBuf] = await Promise.all([
    fetchBuffer(asset.browser_download_url, opts.token),
    fetchBuffer(checksumAsset.browser_download_url, opts.token),
  ]);

  const checksums = parseChecksums(sumBuf.toString("utf8"));
  const expected = checksums.get(asset.name);
  if (!expected) {
    fail(`Checksum not found for ${asset.name} in ${checksumAsset.name}`);
  }

  const actual = sha256Hex(binBuf);
  if (actual !== expected) {
    fail(`Checksum mismatch for ${asset.name}: expected ${expected}, got ${actual}`);
  }

  const ext = goos === "windows" ? ".exe" : "";
  const target = path.join(opts.outDir, `skuare-svc${ext}`);
  await fs.mkdir(opts.outDir, { recursive: true });
  await fs.writeFile(target, binBuf);
  if (goos !== "windows") {
    await fs.chmod(target, 0o755);
  }
  log(`Installed backend binary: ${target}`);
}

async function main() {
  try {
    if (ENV.enabled !== "1") {
      log("Skip backend install (set SKUARE_AUTO_INSTALL_BACKEND=1 to enable)");
      return;
    }
    if (!ENV.repo) {
      warn("SKUARE_RELEASE_REPO is empty, skip backend install");
      return;
    }
    await installBinary(ENV);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    warn(msg);
    process.exitCode = 1;
  }
}

void main();
