import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { PublishCommand } from "./commands/write";
import type { CommandContext, JsonValue } from "./commands/types";

test("publish sends force=true when invoked with -f", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "skuare-publish-force-"));
  const skillDir = join(workspace, "demo-skill");
  const requests: Array<{ body: Buffer; contentType: string }> = [];

  await createSkillDir(skillDir, "demo-skill", "1.0.0", "Original description");

  const restore = mockFetch(async (_input, init) => {
    requests.push({
      body: toBuffer(init?.body),
      contentType: String((init?.headers as Record<string, string> | undefined)?.["content-type"] || ""),
    });
    return new Response(JSON.stringify({
      skill_id: "demo-skill",
      version: "1.0.0",
      name: "demo-skill",
      description: "Original description",
    }), {
      status: 201,
      headers: { "content-type": "application/json" },
    });
  });

  try {
    const logs = await captureConsole(async () => {
      await new PublishCommand().execute(createContext(workspace, ["-f", skillDir]));
    });

    assert.equal(requests.length, 1);
    const multipart = parseMultipart(requests[0].body, requests[0].contentType);
    const metadata = JSON.parse(decodeUtf8(multipart.metadata.content)) as Record<string, JsonValue>;
    assert.equal(metadata.force, true);
    assert.match(logs.join("\n"), /"skill_id": "demo-skill"/);
  } finally {
    restore();
    await rm(workspace, { recursive: true, force: true });
  }
});

test("publish suggests --force or -f when version already exists", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "skuare-publish-exists-"));
  const skillDir = join(workspace, "demo-skill");

  await createSkillDir(skillDir, "demo-skill", "1.0.0", "Original description");

  const restore = mockFetch(async () => new Response(JSON.stringify({
    code: "SKILL_VERSION_ALREADY_EXISTS",
    message: "skill version already exists",
  }), {
    status: 409,
    statusText: "Conflict",
    headers: { "content-type": "application/json" },
  }));

  try {
    const logs = await captureConsole(async () => {
      await new PublishCommand().execute(createContext(workspace, ["--dir", skillDir]));
    });

    const text = logs.join("\n");
    assert.match(text, /skill version already exists: demo-skill@1\.0\.0/);
    assert.match(text, /Retry with --force or -f to overwrite the existing version\./);
  } finally {
    restore();
    await rm(workspace, { recursive: true, force: true });
  }
});

test("publish --type skill strips resource type option before resolving positional source", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "skuare-publish-type-skill-"));
  const skillDir = join(workspace, "demo-skill");
  const requests: Array<{ body: Buffer; contentType: string }> = [];

  await createSkillDir(skillDir, "demo-skill", "1.0.0", "Original description");

  const restore = mockFetch(async (_input, init) => {
    requests.push({
      body: toBuffer(init?.body),
      contentType: String((init?.headers as Record<string, string> | undefined)?.["content-type"] || ""),
    });
    return new Response(JSON.stringify({
      skill_id: "demo-skill",
      version: "1.0.0",
      name: "demo-skill",
      description: "Original description",
    }), {
      status: 201,
      headers: { "content-type": "application/json" },
    });
  });

  try {
    const logs = await captureConsole(async () => {
      await new PublishCommand().execute(createContext(workspace, ["--type", "skill", skillDir]));
    });

    assert.equal(requests.length, 1);
    const multipart = parseMultipart(requests[0].body, requests[0].contentType);
    const metadata = JSON.parse(decodeUtf8(multipart.metadata.content)) as Record<string, JsonValue>;
    assert.equal(metadata.skill_id, "demo-skill");
    assert.match(logs.join("\n"), /"skill_id": "demo-skill"/);
  } finally {
    restore();
    await rm(workspace, { recursive: true, force: true });
  }
});

test("publish packages binary files inside multipart bundle", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "skuare-publish-binary-bundle-"));
  const skillDir = join(workspace, "demo-skill");
  const requests: Array<{ body: Buffer; contentType: string }> = [];

  await createSkillDir(skillDir, "demo-skill", "1.0.0", "Original description");
  await mkdir(join(skillDir, "assets"), { recursive: true });
  await writeFile(join(skillDir, "assets", "font.bin"), Buffer.from([0x00, 0x01, 0x02, 0xff]));

  const restore = mockFetch(async (_input, init) => {
    requests.push({
      body: toBuffer(init?.body),
      contentType: String((init?.headers as Record<string, string> | undefined)?.["content-type"] || ""),
    });
    return new Response(JSON.stringify({
      skill_id: "demo-skill",
      version: "1.0.0",
      name: "demo-skill",
      description: "Original description",
    }), {
      status: 201,
      headers: { "content-type": "application/json" },
    });
  });

  try {
    await new PublishCommand().execute(createContext(workspace, ["--dir", skillDir]));

    assert.equal(requests.length, 1);
    const multipart = parseMultipart(requests[0].body, requests[0].contentType);
    assert.equal(multipart.bundle.filename, "demo-skill-1.0.0.tar.gz");
    const entries = parseTarEntries(gunzipSync(multipart.bundle.content));
    assert.deepEqual(new Set(entries.map((entry) => entry.path)), new Set(["SKILL.md", "assets/font.bin"]));
    assert.deepEqual(entries.find((entry) => entry.path === "assets/font.bin")?.content, Buffer.from([0x00, 0x01, 0x02, 0xff]));
  } finally {
    restore();
    await rm(workspace, { recursive: true, force: true });
  }
});

async function createSkillDir(skillDir: string, name: string, version: string, description: string): Promise<void> {
  await mkdir(skillDir, { recursive: true });
  await writeFile(
    join(skillDir, "SKILL.md"),
    [
      "---",
      `name: "${name}"`,
      "metadata:",
      `  version: "${version}"`,
      `description: "${description}"`,
      "---",
      "",
      `# ${name}`,
      "",
      "## Overview",
      "Demo overview",
      "",
    ].join("\n"),
    "utf8"
  );
}

function createContext(cwd: string, args: string[]): CommandContext {
  return {
    server: "http://127.0.0.1:15657",
    localMode: true,
    cwd,
    llmTools: ["codex"],
    toolSkillDirs: {},
    auth: {
      keyId: "",
      privateKeyFile: "",
    },
    args,
  };
}

function mockFetch(
  impl: (input: string | URL | Request, init?: RequestInit) => Promise<Response>
): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = impl as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

async function captureConsole(run: () => Promise<void>): Promise<string[]> {
  const logs: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => {
    logs.push(args.map((arg) => String(arg)).join(" "));
  };
  try {
    await run();
    return logs;
  } finally {
    console.log = original;
  }
}

function toBuffer(body: BodyInit | null | undefined): Buffer {
  if (!body) {
    return Buffer.alloc(0);
  }
  if (typeof body === "string") {
    return Buffer.from(body);
  }
  return Buffer.from(body as Uint8Array);
}

function parseMultipart(body: Buffer, contentType: string): Record<string, { filename: string; contentType: string; content: Buffer }> {
  const match = contentType.match(/boundary=([^;]+)/);
  assert.ok(match, `boundary missing from content-type: ${contentType}`);
  const boundary = `--${match[1]}`;
  const segments = decodeLatin1(body).split(boundary).slice(1, -1);
  const parts: Record<string, { filename: string; contentType: string; content: Buffer }> = {};
  for (const segment of segments) {
    const trimmed = segment.replace(/^\r\n/, "").replace(/\r\n$/, "");
    const headerEnd = trimmed.indexOf("\r\n\r\n");
    assert.notEqual(headerEnd, -1, "multipart part missing header terminator");
    const headerText = trimmed.slice(0, headerEnd);
    const bodyText = trimmed.slice(headerEnd + 4);
    const headerLines = headerText.split("\r\n");
    const disposition = headerLines.find((line) => line.toLowerCase().startsWith("content-disposition:")) || "";
    const nameMatch = disposition.match(/name="([^"]+)"/);
    assert.ok(nameMatch, `multipart part missing name: ${disposition}`);
    const filenameMatch = disposition.match(/filename="([^"]+)"/);
    const contentTypeLine = headerLines.find((line) => line.toLowerCase().startsWith("content-type:")) || "";
    parts[nameMatch[1]] = {
      filename: filenameMatch?.[1] || "",
      contentType: contentTypeLine.replace(/^Content-Type:\s*/i, ""),
      content: Buffer.from(bodyText, "latin1"),
    };
  }
  return parts;
}

function parseTarEntries(archive: Buffer): Array<{ path: string; content: Buffer }> {
  const entries: Array<{ path: string; content: Buffer }> = [];
  let offset = 0;
  while (offset + 512 <= archive.length) {
    const header = archive.subarray(offset, offset + 512);
    if (header.every((value) => value === 0)) {
      break;
    }
    const rawName = decodeUtf8(header.subarray(0, 100)).replace(/\0.*$/, "");
    const rawPrefix = decodeUtf8(header.subarray(345, 500)).replace(/\0.*$/, "");
    const path = rawPrefix ? `${rawPrefix}/${rawName}` : rawName;
    const sizeRaw = decodeUtf8(header.subarray(124, 136)).replace(/\0.*$/, "").trim();
    const size = sizeRaw ? Number.parseInt(sizeRaw, 8) : 0;
    const contentStart = offset + 512;
    const contentEnd = contentStart + size;
    entries.push({ path, content: archive.subarray(contentStart, contentEnd) });
    offset = contentStart + Math.ceil(size / 512) * 512;
  }
  return entries;
}

function decodeUtf8(input: Uint8Array): string {
  return new TextDecoder("utf-8").decode(input);
}

function decodeLatin1(input: Uint8Array): string {
  return new TextDecoder("latin1").decode(input);
}
