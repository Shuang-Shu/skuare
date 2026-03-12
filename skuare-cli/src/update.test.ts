import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { UpdateCommand } from "./commands/write";
import type { CommandContext } from "./commands/types";

test("update accepts name-only skillRef, prompts with a version greater than remote maxVersion, and reuses publish flow", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "skuare-update-"));
  const skillDir = join(workspace, "demo-skill");
  await createSkillDir(skillDir, {
    name: "demo-skill",
    author: "demo",
    version: "1.0.0",
    description: "Demo description",
  });

  const requests: string[] = [];
  const requestBodies: string[] = [];
  let prompted: { skillID: string; maxVersion: string; suggestedVersion: string } | undefined;
  const restore = mockFetch(async (input, init) => {
    const url = new URL(String(input));
    const key = `${String(init?.method || "GET").toUpperCase()} ${url.pathname}`;
    requests.push(key);
    if (key === "GET /api/v1/skills") {
      return jsonResponse({
        items: [
          { skill_id: "demo-skill", version: "1.2.0", name: "demo-skill", author: "demo", description: "old" },
          { skill_id: "demo-skill", version: "1.10.0", name: "demo-skill", author: "demo", description: "new" },
        ],
      });
    }
    if (key === "GET /api/v1/skills/demo-skill") {
      return jsonResponse({
        skill_id: "demo-skill",
        author: "demo",
        versions: ["1.2.0", "1.10.0"],
      });
    }
    if (key === "POST /api/v1/skills") {
      requestBodies.push(decodeLatin1(toBuffer(init?.body)));
      return jsonResponse({
        skill_id: "demo-skill",
        version: "1.10.1",
        name: "demo-skill",
        author: "demo",
        description: "Demo description",
      }, 201);
    }
    throw new Error(`Unexpected request: ${key}`);
  });

  class TestUpdateCommand extends UpdateCommand {
    protected override isInteractiveTerminal(): boolean {
      return true;
    }

    protected override async askForUpdatedVersion(
      skillID: string,
      maxVersion: string,
      suggestedVersion: string
    ): Promise<string> {
      prompted = { skillID, maxVersion, suggestedVersion };
      return suggestedVersion;
    }
  }

  try {
    const logs = await captureConsole(async () => {
      await new TestUpdateCommand().execute(createContext(workspace, ["demo-skill", skillDir]));
    });

    assert.deepEqual(prompted, {
      skillID: "demo-skill",
      maxVersion: "1.10.0",
      suggestedVersion: "1.10.1",
    });
    assert.deepEqual(requests, [
      "GET /api/v1/skills",
      "GET /api/v1/skills/demo-skill",
      "POST /api/v1/skills",
    ]);
    assert.match(requestBodies[0], /"version":"1\.10\.1"/);
    assert.match(logs.join("\n"), /"version": "1.10.1"/);
    const updatedSkill = await readFile(join(skillDir, "SKILL.md"), "utf8");
    assert.match(updatedSkill, /version: "1.10.1"/);
  } finally {
    restore();
    await rm(workspace, { recursive: true, force: true });
  }
});

test("update accepts exact skillID when it differs from local skill name", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "skuare-update-skillid-"));
  const skillDir = join(workspace, "demo-skill");
  await createSkillDir(skillDir, {
    name: "demo-skill",
    author: "demo",
    version: "2.0.0",
    description: "Demo description",
  });

  const requests: string[] = [];
  const requestBodies: string[] = [];
  const restore = mockFetch(async (input, init) => {
    const url = new URL(String(input));
    const key = `${String(init?.method || "GET").toUpperCase()} ${url.pathname}`;
    requests.push(key);
    if (key === "GET /api/v1/skills") {
      return jsonResponse({
        items: [
          { skill_id: "demo-skill-id", version: "1.9.0", name: "demo-skill", author: "demo", description: "latest" },
        ],
      });
    }
    if (key === "GET /api/v1/skills/demo-skill-id") {
      return jsonResponse({
        skill_id: "demo-skill-id",
        author: "demo",
        versions: ["1.9.0"],
      });
    }
    if (key === "POST /api/v1/skills") {
      requestBodies.push(decodeLatin1(toBuffer(init?.body)));
      return jsonResponse({
        skill_id: "demo-skill-id",
        version: "2.0.0",
        name: "demo-skill",
        author: "demo",
        description: "Demo description",
      }, 201);
    }
    throw new Error(`Unexpected request: ${key}`);
  });

  class TestUpdateCommand extends UpdateCommand {
    protected override isInteractiveTerminal(): boolean {
      return false;
    }
  }

  try {
    const logs = await captureConsole(async () => {
      await new TestUpdateCommand().execute(createContext(workspace, ["demo-skill-id", skillDir]));
    });

    assert.deepEqual(requests, [
      "GET /api/v1/skills",
      "GET /api/v1/skills/demo-skill-id",
      "POST /api/v1/skills",
    ]);
    assert.match(requestBodies[0], /"version":"2\.0\.0"/);
    assert.match(logs.join("\n"), /"skill_id": "demo-skill-id"/);
  } finally {
    restore();
    await rm(workspace, { recursive: true, force: true });
  }
});

test("update reuses shared selector flow when name-only skillRef matches multiple remote skills", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "skuare-update-selector-"));
  const skillDir = join(workspace, "demo-skill");
  await createSkillDir(skillDir, {
    name: "demo-skill",
    author: "team-b",
    version: "2.0.0",
    description: "Demo description",
  });

  let selectionTitle = "";
  let seenCandidates: string[] = [];
  const requests: string[] = [];
  const restore = mockFetch(async (input, init) => {
    const url = new URL(String(input));
    const key = `${String(init?.method || "GET").toUpperCase()} ${url.pathname}`;
    requests.push(key);
    if (key === "GET /api/v1/skills") {
      return jsonResponse({
        items: [
          { skill_id: "skill-a", version: "1.1.0", name: "demo-skill", author: "team-a", description: "A" },
          { skill_id: "skill-b", version: "1.2.0", name: "demo-skill", author: "team-b", description: "B" },
        ],
      });
    }
    if (key === "GET /api/v1/skills/skill-b") {
      return jsonResponse({
        skill_id: "skill-b",
        author: "team-b",
        versions: ["1.2.0"],
      });
    }
    if (key === "POST /api/v1/skills") {
      return jsonResponse({
        skill_id: "skill-b",
        version: "2.0.0",
        name: "demo-skill",
        author: "team-b",
        description: "Demo description",
      }, 201);
    }
    throw new Error(`Unexpected request: ${key}`);
  });

  class TestUpdateCommand extends UpdateCommand {
    protected override isInteractiveTerminal(): boolean {
      return false;
    }

    protected override async selectCatalogSkillCandidate(candidates: any[], title: string): Promise<any> {
      selectionTitle = title;
      seenCandidates = candidates.map((candidate) => `${candidate.skillID}@${candidate.version}`);
      return candidates.find((candidate) => candidate.skillID === "skill-b");
    }
  }

  try {
    await new TestUpdateCommand().execute(createContext(workspace, ["demo-skill", skillDir]));

    assert.equal(selectionTitle, "Multiple skills found, select one (use ↑/↓, Enter to confirm):");
    assert.deepEqual(seenCandidates, ["skill-a@1.1.0", "skill-b@1.2.0"]);
    assert.deepEqual(requests, [
      "GET /api/v1/skills",
      "GET /api/v1/skills/skill-b",
      "POST /api/v1/skills",
    ]);
  } finally {
    restore();
    await rm(workspace, { recursive: true, force: true });
  }
});

test("update fails in non-interactive mode when local version is not greater than remote maxVersion", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "skuare-update-non-tty-"));
  const skillDir = join(workspace, "demo-skill");
  await createSkillDir(skillDir, {
    name: "demo-skill",
    author: "demo",
    version: "1.0.0",
    description: "Demo description",
  });

  const restore = mockFetch(async (input, init) => {
    const url = new URL(String(input));
    const key = `${String(init?.method || "GET").toUpperCase()} ${url.pathname}`;
    if (key === "GET /api/v1/skills") {
      return jsonResponse({
        items: [{ skill_id: "demo-skill", version: "1.10.0", name: "demo-skill", author: "demo", description: "new" }],
      });
    }
    if (key === "GET /api/v1/skills/demo-skill") {
      return jsonResponse({
        skill_id: "demo-skill",
        author: "demo",
        versions: ["1.10.0"],
      });
    }
    throw new Error(`Unexpected request: ${key}`);
  });

  class TestUpdateCommand extends UpdateCommand {
    protected override isInteractiveTerminal(): boolean {
      return false;
    }
  }

  try {
    await assert.rejects(
      () => new TestUpdateCommand().execute(createContext(workspace, ["demo/demo-skill", skillDir])),
      /Local metadata\.version \(1\.0\.0\) must be greater than remote maxVersion \(1\.10\.0\)\. Suggested: 1\.10\.1/
    );
  } finally {
    restore();
    await rm(workspace, { recursive: true, force: true });
  }
});

test("update rejects mismatched local author or name", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "skuare-update-mismatch-"));
  const skillDir = join(workspace, "demo-skill");
  await createSkillDir(skillDir, {
    name: "another-skill",
    author: "demo",
    version: "1.0.0",
    description: "Demo description",
  });

  const restore = mockFetch(async (input, init) => {
    const url = new URL(String(input));
    const key = `${String(init?.method || "GET").toUpperCase()} ${url.pathname}`;
    if (key === "GET /api/v1/skills") {
      return jsonResponse({
        items: [{ skill_id: "demo-skill", version: "1.10.0", name: "demo-skill", author: "demo", description: "new" }],
      });
    }
    throw new Error(`Unexpected request: ${key}`);
  });

  try {
    await assert.rejects(
      () => new UpdateCommand().execute(createContext(workspace, ["demo/demo-skill", skillDir])),
      /Local SKILL\.md name \(another-skill\) must match selected remote skill name \(demo-skill\)/
    );
  } finally {
    restore();
    await rm(workspace, { recursive: true, force: true });
  }
});

async function createSkillDir(
  skillDir: string,
  input: { name: string; author: string; version: string; description: string }
): Promise<void> {
  await mkdir(skillDir, { recursive: true });
  await writeFile(
    join(skillDir, "SKILL.md"),
    [
      "---",
      `name: "${input.name}"`,
      "metadata:",
      `  version: "${input.version}"`,
      `  author: "${input.author}"`,
      `description: "${input.description}"`,
      "---",
      "",
      `# ${input.name}`,
      "",
      "## Overview",
      input.description,
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

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function mockFetch(handler: (input: string | URL | Request, init?: RequestInit) => Promise<Response>): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = handler as typeof fetch;
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

function decodeLatin1(input: Uint8Array): string {
  return new TextDecoder("latin1").decode(input);
}
