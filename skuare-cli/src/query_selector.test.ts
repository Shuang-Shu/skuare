import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DepsCommand, GetCommand, PeekCommand } from "./commands/query";
import type { CommandContext } from "./commands/types";

test("peek reuses shared selector logic for name and author/name inputs", async () => {
  const requests: string[] = [];
  const restore = mockFetch((input) => {
    const url = new URL(String(input));
    const key = `GET ${url.pathname}`;
    requests.push(key);
    const routes: Record<string, Response> = {
      "GET /api/v1/skills": jsonResponse({
        items: [{ skill_id: "demo/tool-root", version: "2.0.0", name: "root-skill", author: "demo", description: "Root description" }],
      }),
      "GET /api/v1/skills/demo%2Ftool-root": jsonResponse({
        skill_id: "demo/tool-root",
        author: "demo",
        versions: ["1.0.0", "2.0.0"],
      }),
      "GET /api/v1/skills/demo%2Ftool-root/1.0.0": jsonResponse({
        skill_id: "demo/tool-root",
        version: "1.0.0",
        name: "root-skill",
        author: "demo",
        description: "Root description",
        overview: "detail overview",
      }),
    };
    const response = routes[key];
    if (!response) {
      throw new Error(`Unexpected request: ${key}`);
    }
    return response.clone();
  });

  try {
    const overviewLogs = await captureConsole(async () => {
      await new PeekCommand().execute(createContext(process.cwd(), ["root-skill"]));
    });
    const overview = JSON.parse(overviewLogs.join("\n")) as { skill_id: string; latest_version: string; name: string };
    assert.equal(overview.skill_id, "demo/tool-root");
    assert.equal(overview.latest_version, "2.0.0");
    assert.equal(overview.name, "tool-root");

    const detailLogs = await captureConsole(async () => {
      await new PeekCommand().execute(createContext(process.cwd(), ["demo/root-skill", "1.0.0"]));
    });
    const detail = JSON.parse(detailLogs.join("\n")) as { skill_id: string; version: string; name: string; author: string };
    assert.equal(detail.skill_id, "demo/tool-root");
    assert.equal(detail.version, "1.0.0");
    assert.equal(detail.name, "root-skill");
    assert.equal(detail.author, "demo");

    assert.deepEqual(requests, [
      "GET /api/v1/skills",
      "GET /api/v1/skills/demo%2Ftool-root",
      "GET /api/v1/skills",
      "GET /api/v1/skills/demo%2Ftool-root/1.0.0",
    ]);
  } finally {
    restore();
  }
});

test("peek collapses multi-version matches to one skill when version is omitted", async () => {
  const requests: string[] = [];
  const restore = mockFetch((input) => {
    const url = new URL(String(input));
    const key = `GET ${url.pathname}`;
    requests.push(key);
    const routes: Record<string, Response> = {
      "GET /api/v1/skills": jsonResponse({
        items: [
          { skill_id: "demo/tool-root", version: "1.0.0", name: "root-skill", author: "demo", description: "Root description v1" },
          { skill_id: "demo/tool-root", version: "2.0.0", name: "root-skill", author: "demo", description: "Root description v2" },
        ],
      }),
      "GET /api/v1/skills/demo%2Ftool-root": jsonResponse({
        skill_id: "demo/tool-root",
        author: "demo",
        versions: ["1.0.0", "2.0.0"],
      }),
    };
    const response = routes[key];
    if (!response) {
      throw new Error(`Unexpected request: ${key}`);
    }
    return response.clone();
  });

  try {
    const logs = await captureConsole(async () => {
      await new PeekCommand().execute(createContext(process.cwd(), ["root-skill"]));
    });
    const overview = JSON.parse(logs.join("\n")) as { skill_id: string; latest_version: string; versions: string[] };
    assert.equal(overview.skill_id, "demo/tool-root");
    assert.equal(overview.latest_version, "2.0.0");
    assert.deepEqual(overview.versions, ["1.0.0", "2.0.0"]);
    assert.deepEqual(requests, [
      "GET /api/v1/skills",
      "GET /api/v1/skills/demo%2Ftool-root",
    ]);
  } finally {
    restore();
  }
});

test("get resolves name selector with explicit version via shared catalog selector", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "skuare-get-selector-"));
  const requests: string[] = [];
  const restore = mockFetch((input) => {
    const url = new URL(String(input));
    const key = `GET ${url.pathname}`;
    requests.push(key);
    const routes: Record<string, Response> = {
      "GET /api/v1/skills": jsonResponse({
        items: [{ skill_id: "demo/tool-root", version: "2.0.0", name: "root-skill", author: "demo", description: "Root description" }],
      }),
      "GET /api/v1/skills/demo%2Ftool-root/1.0.0": skillDetail("demo/tool-root", "1.0.0", "Root description", {
        name: "root-skill",
        author: "demo",
      }),
    };
    const response = routes[key];
    if (!response) {
      throw new Error(`Unexpected request: ${key}`);
    }
    return response.clone();
  });

  try {
    await mkdir(join(workspace, ".skuare"), { recursive: true });
    const logs = await captureConsole(async () => {
      await new GetCommand().execute(createContext(workspace, ["root-skill", "1.0.0", "--wrap"]));
    });

    const output = JSON.parse(logs.join("\n")) as { wrap: boolean; skills: string[] };
    assert.equal(output.wrap, true);
    assert.deepEqual(output.skills, ["demo/tool-root"]);
    assert.equal((await stat(join(workspace, ".codex", "skills", "demo", "tool-root", "SKILL.md"))).isFile(), true);
    assert.deepEqual(requests, [
      "GET /api/v1/skills",
      "GET /api/v1/skills/demo%2Ftool-root/1.0.0",
    ]);
  } finally {
    restore();
    await rm(workspace, { recursive: true, force: true });
  }
});

test("deps reuses shared selector logic for id, name, and author/name inputs", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "skuare-deps-selector-"));
  const installRoot = join(workspace, ".codex", "skills");
  const rootDir = join(installRoot, "demo", "root");
  await createWrappedRoot(rootDir, installRoot, "demo/root", "1.0.0", [
    { skill: "team/child-id", version: "2.0.0", resolved: "2.0.0" },
  ]);

  const restore = mockFetch((input) => {
    const url = new URL(String(input));
    const key = `GET ${url.pathname}`;
    const routes: Record<string, Response> = {
      "GET /api/v1/skills/team%2Fchild-id/2.0.0": skillDetail("team/child-id", "2.0.0", "Child description", {
        name: "child-name",
        author: "demo",
        deps: [{ skill: "team/grand-id", version: "3.0.0", resolved: "3.0.0" }],
        extraFiles: [{ path: "references/guide.md", content: "child guide" }],
      }),
      "GET /api/v1/skills/team%2Fgrand-id/3.0.0": skillDetail("team/grand-id", "3.0.0", "Grand description", {
        name: "grand-name",
        author: "demo",
      }),
    };
    const response = routes[key];
    if (!response) {
      throw new Error(`Unexpected request: ${key}`);
    }
    return response.clone();
  });

  try {
    const content = await captureStdout(async () => {
      await new DepsCommand().execute(createContext(workspace, ["--content", rootDir, "team/child-id"]));
    });
    assert.match(content, /# team\/child-id/);

    const treeLogs = await captureConsole(async () => {
      await new DepsCommand().execute(createContext(workspace, ["--tree", rootDir, "demo/child-name@2.0.0"]));
    });
    const tree = JSON.parse(treeLogs.join("\n")) as { skill_id: string; files: string[] };
    assert.equal(tree.skill_id, "team/child-id");
    assert.deepEqual(new Set(tree.files), new Set(["SKILL.md", "references/guide.md", "skill-deps.lock.json"]));

    const installLogs = await captureConsole(async () => {
      await new DepsCommand().execute(createContext(workspace, ["--install", rootDir, "child-name"]));
    });
    const installOutput = JSON.parse(installLogs.join("\n")) as { skills: string[] };
    assert.deepEqual(installOutput.skills, ["team/child-id", "team/grand-id"]);
    assert.equal((await stat(join(installRoot, "team", "child-id", "SKILL.md"))).isFile(), true);
    assert.equal((await stat(join(installRoot, "team", "grand-id", "SKILL.md"))).isFile(), true);
  } finally {
    restore();
    await rm(workspace, { recursive: true, force: true });
  }
});

async function createWrappedRoot(
  rootDir: string,
  installRoot: string,
  skillID: string,
  version: string,
  deps: Array<{ skill: string; version: string; resolved: string }>
): Promise<void> {
  await mkdir(rootDir, { recursive: true });
  await writeFile(join(rootDir, "SKILL.md"), renderSkill(skillID, version, `${skillID} description`, { author: "demo" }), "utf8");
  await writeFile(
    join(rootDir, "skill-deps.lock.json"),
    `${JSON.stringify({ lock_version: 1, dependencies: deps }, null, 2)}\n`,
    "utf8"
  );
  await writeFile(
    join(rootDir, ".skuare-wrap.json"),
    `${JSON.stringify({
      version: 1,
      mode: "wrap",
      tool: "codex",
      root_skill_id: skillID,
      root_version: version,
      install_root: installRoot,
      global: false,
    }, null, 2)}\n`,
    "utf8"
  );
}

function skillDetail(
  skillID: string,
  version: string,
  description: string,
  options: {
    name?: string;
    author?: string;
    deps?: Array<{ skill: string; version: string; resolved: string }>;
    extraFiles?: Array<{ path: string; content: string }>;
  } = {}
): Response {
  const files = [{
    path: "SKILL.md",
    content: renderSkill(skillID, version, description, { name: options.name, author: options.author }),
  }];
  if (options.deps && options.deps.length > 0) {
    files.push({
      path: "skill-deps.lock.json",
      content: `${JSON.stringify({ lock_version: 1, dependencies: options.deps }, null, 2)}\n`,
    });
  }
  for (const extra of options.extraFiles || []) {
    files.push(extra);
  }
  return jsonResponse({
    skill_id: skillID,
    version,
    name: options.name,
    author: options.author,
    description,
    files,
  });
}

function renderSkill(
  skillID: string,
  version: string,
  description: string,
  options: { name?: string; author?: string } = {}
): string {
  return [
    "---",
    `name: "${options.name || skillID}"`,
    "metadata:",
    `  version: "${version}"`,
    `  author: "${options.author || "demo"}"`,
    `description: "${description}"`,
    "---",
    "",
    `# ${skillID}`,
    "",
    "## Overview",
    description,
    "",
  ].join("\n");
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

function mockFetch(handler: (input: RequestInfo | URL, init?: RequestInit) => Response | Promise<Response>): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input, init) => handler(input, init)) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

async function captureConsole(fn: () => Promise<void>): Promise<string[]> {
  const lines: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => {
    lines.push(args.map((item) => String(item)).join(" "));
  };
  try {
    await fn();
  } finally {
    console.log = original;
  }
  return lines;
}

async function captureStdout(fn: () => Promise<void>): Promise<string> {
  let output = "";
  const original = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: string | Uint8Array) => {
    output += String(chunk);
    return true;
  }) as typeof process.stdout.write;
  try {
    await fn();
  } finally {
    process.stdout.write = original;
  }
  return output;
}
