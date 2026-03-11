import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GetCommand } from "./commands/query";
import { resolveToolSkillsDirPromptDefault } from "./commands/init";
import type { CommandContext } from "./commands/types";
import { resolveConfig, resolveToolSkillsDir } from "./config/resolver";
import type { JsonValue } from "./types";

test("workspace prompt default ignores inherited global toolSkillDirs and recommends workspace local path", () => {
  const cwd = "/tmp/skuare-project";
  assert.equal(
    resolveToolSkillsDirPromptDefault({
      cwd,
      tool: "acme",
      scope: "workspace",
      inheritedDir: "/tmp/global-acme-skills",
    }),
    join(cwd, ".acme", "skills")
  );
  assert.equal(
    resolveToolSkillsDirPromptDefault({
      cwd,
      tool: "acme",
      scope: "workspace",
      inheritedDir: "/tmp/global-acme-skills",
      scopedDir: "./workspace-acme-skills",
    }),
    join(cwd, "workspace-acme-skills")
  );
});

test("local tool skills resolution defaults to workspace tool home for built-in and custom tools", () => {
  const cwd = "/tmp/skuare-project";
  assert.equal(resolveToolSkillsDir(cwd, "codex"), join(cwd, ".codex", "skills"));
  assert.equal(resolveToolSkillsDir(cwd, "claudecode"), join(cwd, ".claudecode", "skills"));
  assert.equal(resolveToolSkillsDir(cwd, "cursor-cli"), join(cwd, ".cursor-cli", "skills"));
  assert.equal(resolveToolSkillsDir(cwd, "acme"), join(cwd, ".acme", "skills"));
});

test("workspace config clears inherited global toolSkillDirs so get installs into workspace by default", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "skuare-path-workspace-"));
  const home = await mkdtemp(join(tmpdir(), "skuare-path-home-"));
  const originalHome = process.env.HOME;
  process.env.HOME = home;
  const globalToolDir = join(home, "shared-acme-skills");
  const restore = mockFetch({
    "GET /api/v1/skills": new Response(JSON.stringify({
      items: [{ skill_id: "demo/root", version: "1.0.0", name: "root", author: "demo", description: "Root description" }],
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
    "GET /api/v1/skills/demo%2Froot/1.0.0": skillDetail("demo/root", "1.0.0", "Root description"),
  });

  try {
    await mkdir(join(home, ".skuare"), { recursive: true });
    await writeConfig(join(home, ".skuare", "config.json"), {
      remote: {
        mode: "local",
        address: "127.0.0.1",
        port: 15657,
      },
      auth: {
        keyId: "",
        privateKeyFile: "",
      },
      llmTools: ["acme"],
      toolSkillDirs: {
        acme: globalToolDir,
      },
    });
    await mkdir(join(workspace, ".skuare"), { recursive: true });
    await writeConfig(join(workspace, ".skuare", "config.json"), {
      remote: {
        mode: "local",
        address: "127.0.0.1",
        port: 15657,
      },
      auth: {
        keyId: "",
        privateKeyFile: "",
      },
      llmTools: ["acme"],
      toolSkillDirs: {},
    });

    const resolved = await resolveConfig(workspace, { rest: [] });
    assert.deepEqual(resolved.merged.toolSkillDirs, {});

    const logs = await captureConsole(async () => {
      await new GetCommand().execute(createContext(workspace, ["demo/root@1.0.0"], resolved));
    });
    const output = JSON.parse(logs.join("\n")) as { global: boolean; target: string };

    assert.equal(output.global, false);
    assert.equal(output.target, join(workspace, ".acme", "skills"));
    assert.equal((await stat(join(workspace, ".acme", "skills", "demo", "root", "SKILL.md"))).isFile(), true);
    await assert.rejects(stat(join(globalToolDir, "demo", "root", "SKILL.md")), /ENOENT/);
  } finally {
    restore();
    process.env.HOME = originalHome;
    await rm(workspace, { recursive: true, force: true });
    await rm(home, { recursive: true, force: true });
  }
});

function createContext(
  cwd: string,
  args: string[],
  resolved: Awaited<ReturnType<typeof resolveConfig>>
): CommandContext {
  return {
    server: resolved.server,
    localMode: resolved.localMode,
    cwd,
    llmTools: resolved.merged.llmTools,
    toolSkillDirs: resolved.merged.toolSkillDirs,
    auth: resolved.auth,
    args,
  };
}

function skillDetail(skillID: string, version: string, description: string): Response {
  return new Response(JSON.stringify({
    skill_id: skillID,
    version,
    description,
    files: [{
      path: "SKILL.md",
      content: renderSkill(skillID, version, description),
    }],
  }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function renderSkill(skillID: string, version: string, description: string): string {
  return [
    "---",
    `name: "${skillID}"`,
    "metadata:",
    `  version: "${version}"`,
    '  author: "demo"',
    `description: "${description}"`,
    "---",
    "",
    `# ${skillID}`,
    "",
    description,
    "",
  ].join("\n");
}

function writeConfig(path: string, config: JsonValue): Promise<void> {
  return writeFile(path, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

function mockFetch(routes: Record<string, Response>): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input) => {
    const url = new URL(String(input));
    const key = `GET ${url.pathname}`;
    const response = routes[key];
    if (!response) {
      throw new Error(`Unexpected request: ${key}`);
    }
    return response.clone();
  }) as typeof fetch;
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
