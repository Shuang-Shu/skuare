import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PublishCommand } from "./commands/write";
import type { CommandContext, JsonValue } from "./commands/types";

test("publish sends force=true when invoked with -f", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "skuare-publish-force-"));
  const skillDir = join(workspace, "demo-skill");
  const requestBodies: JsonValue[] = [];

  await createSkillDir(skillDir, "demo-skill", "1.0.0", "Original description");

  const restore = mockFetch(async (_input, init) => {
    requestBodies.push(JSON.parse(String(init?.body ?? "{}")) as JsonValue);
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

    assert.equal(requestBodies.length, 1);
    assert.equal((requestBodies[0] as Record<string, JsonValue>).force, true);
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
  const requestBodies: JsonValue[] = [];

  await createSkillDir(skillDir, "demo-skill", "1.0.0", "Original description");

  const restore = mockFetch(async (_input, init) => {
    requestBodies.push(JSON.parse(String(init?.body ?? "{}")) as JsonValue);
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

    assert.equal(requestBodies.length, 1);
    assert.match(logs.join("\n"), /"skill_id": "demo-skill"/);
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
