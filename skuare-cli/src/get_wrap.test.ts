import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DepsCommand, GetCommand } from "./commands/query";
import type { CommandContext } from "./commands/types";

class InteractiveGetCommand extends GetCommand {
  constructor(private readonly decision: boolean) {
    super();
  }

  protected override isInteractiveInstallSession(): boolean {
    return true;
  }

  protected override async confirmInstallTargetPreview(): Promise<boolean> {
    return this.decision;
  }
}

class InteractiveDepsCommand extends DepsCommand {
  constructor(private readonly decision: boolean) {
    super();
  }

  protected override isInteractiveInstallSession(): boolean {
    return true;
  }

  protected override async confirmInstallTargetPreview(): Promise<boolean> {
    return this.decision;
  }
}

test("get --wrap installs only the root skill and writes wrap metadata", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "skuare-get-wrap-"));
  const restore = mockFetch({
    "GET /api/v1/skills": new Response(JSON.stringify({
      items: [{ skill_id: "demo/root", version: "1.0.0", name: "root", author: "demo", description: "Root description" }],
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
    "GET /api/v1/skills/demo%2Froot/1.0.0": skillDetail("demo/root", "1.0.0", "Root description", [
      { skill: "demo/child", version: "2.0.0", resolved: "2.0.0" },
    ]),
    "GET /api/v1/skills/demo%2Fchild/2.0.0": skillDetail("demo/child", "2.0.0", "Child description"),
  });

  try {
    const logs = await captureConsole(async () => {
      await new GetCommand().execute(createContext(workspace, ["demo/root@1.0.0", "--wrap"]));
    });

    const output = JSON.parse(logs.join("\n")) as { wrap: boolean; skills: string[] };
    assert.equal(output.wrap, true);
    assert.deepEqual(output.skills, ["demo/root"]);

    const rootSkillPath = join(workspace, ".codex", "skills", "demo", "root", "SKILL.md");
    const childSkillPath = join(workspace, ".codex", "skills", "demo", "child", "SKILL.md");
    const markerPath = join(workspace, ".codex", "skills", "demo", "root", ".skuare-wrap.json");

    assert.equal((await stat(rootSkillPath)).isFile(), true);
    await assert.rejects(stat(childSkillPath), /ENOENT/);
    const marker = JSON.parse(await readFile(markerPath, "utf8")) as { root_skill_id: string; root_version: string };
    assert.equal(marker.root_skill_id, "demo/root");
    assert.equal(marker.root_version, "1.0.0");
  } finally {
    restore();
    await rm(workspace, { recursive: true, force: true });
  }
});

test("get reports circular dependencies instead of silently skipping them", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "skuare-get-cycle-"));
  const restore = mockFetch({
    "GET /api/v1/skills": new Response(JSON.stringify({
      items: [{ skill_id: "demo/root", version: "1.0.0", name: "root", author: "demo", description: "Root description" }],
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
    "GET /api/v1/skills/demo%2Froot/1.0.0": skillDetail("demo/root", "1.0.0", "Root description", [
      { skill: "demo/child", version: "2.0.0", resolved: "2.0.0" },
    ]),
    "GET /api/v1/skills/demo%2Fchild/2.0.0": skillDetail("demo/child", "2.0.0", "Child description", [
      { skill: "demo/root", version: "1.0.0", resolved: "1.0.0" },
    ]),
  });

  try {
    await assert.rejects(
      () => new GetCommand().execute(createContext(workspace, ["demo/root@1.0.0"])),
      /Detected circular dependency: demo\/root@1\.0\.0 -> demo\/child@2\.0\.0 -> demo\/root@1\.0\.0/
    );
  } finally {
    restore();
    await rm(workspace, { recursive: true, force: true });
  }
});

test("get --global installs the same skill into all configured tools' global skill directories", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "skuare-get-global-multi-"));
  const home = await mkdtemp(join(tmpdir(), "skuare-home-"));
  const originalHome = process.env.HOME;
  process.env.HOME = home;
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
    const logs = await captureConsole(async () => {
      await new GetCommand().execute(createContext(workspace, ["demo/root@1.0.0", "--global"], {
        llmTools: ["codex", "qwen", "trae", "cursor-cli", "kiro", "claudecode"],
      }));
    });

    const output = JSON.parse(logs.join("\n")) as {
      global: boolean;
      llm_tools: string[];
      targets: Array<{ target: string; tools: string[] }>;
      skills: string[];
    };

    assert.equal(output.global, true);
    assert.deepEqual(output.llm_tools, ["codex", "qwen", "trae", "cursor-cli", "kiro", "claudecode"]);
    assert.equal(output.targets.length, 6);
    assert.deepEqual(output.skills, ["demo/root"]);

    for (const tool of output.llm_tools) {
      assert.equal((await stat(join(home, `.${tool}`, "skills", "demo", "root", "SKILL.md"))).isFile(), true);
    }
  } finally {
    restore();
    process.env.HOME = originalHome;
    await rm(workspace, { recursive: true, force: true });
    await rm(home, { recursive: true, force: true });
  }
});

test("get installs the same skill into all configured workspace tool directories when --global is omitted", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "skuare-get-workspace-multi-"));
  const customWorkspaceDir = join(workspace, "custom-jojo-skills");
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
    const logs = await captureConsole(async () => {
      await new GetCommand().execute(createContext(workspace, ["demo/root@1.0.0"], {
        llmTools: ["codex", "claudecode", "jojo"],
        toolSkillDirs: {
          jojo: customWorkspaceDir,
        },
      }));
    });

    const output = JSON.parse(logs.join("\n")) as {
      global: boolean;
      llm_tool: string;
      llm_tools: string[];
      targets: Array<{ target: string; tools: string[] }>;
      skills: string[];
    };

    assert.equal(output.global, false);
    assert.equal(output.llm_tool, "codex");
    assert.deepEqual(output.llm_tools, ["codex", "claudecode", "jojo"]);
    assert.equal(output.targets.length, 3);
    assert.deepEqual(output.skills, ["demo/root"]);
    assert.equal((await stat(join(workspace, ".codex", "skills", "demo", "root", "SKILL.md"))).isFile(), true);
    assert.equal((await stat(join(workspace, ".claudecode", "skills", "demo", "root", "SKILL.md"))).isFile(), true);
    assert.equal((await stat(join(customWorkspaceDir, "demo", "root", "SKILL.md"))).isFile(), true);
  } finally {
    restore();
    await rm(workspace, { recursive: true, force: true });
  }
});

test("get --global respects explicit global toolSkillDirs and ignores workspace-relative ones", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "skuare-get-global-custom-"));
  const home = await mkdtemp(join(tmpdir(), "skuare-home-"));
  const explicitGlobalDir = join(home, "custom-cursor-skills");
  const originalHome = process.env.HOME;
  process.env.HOME = home;
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
    await captureConsole(async () => {
      await new GetCommand().execute(createContext(workspace, ["demo/root@1.0.0", "--global"], {
        llmTools: ["codex", "cursor-cli"],
        toolSkillDirs: {
          codex: "workspace-codex-skills",
          "cursor-cli": explicitGlobalDir,
        },
      }));
    });

    assert.equal((await stat(join(home, ".codex", "skills", "demo", "root", "SKILL.md"))).isFile(), true);
    assert.equal((await stat(join(explicitGlobalDir, "demo", "root", "SKILL.md"))).isFile(), true);
    await assert.rejects(stat(join(workspace, "workspace-codex-skills", "demo", "root", "SKILL.md")), /ENOENT/);
  } finally {
    restore();
    process.env.HOME = originalHome;
    await rm(workspace, { recursive: true, force: true });
    await rm(home, { recursive: true, force: true });
  }
});

test("deps can inspect and install wrapped dependency subtrees with get-like skill selectors", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "skuare-deps-"));
  const installRoot = join(workspace, ".codex", "skills");
  const rootDir = join(installRoot, "demo", "root");
  await createWrappedRoot(rootDir, installRoot, "demo/root", "1.0.0", [
    { skill: "demo/child", version: "2.0.0", resolved: "2.0.0" },
  ]);

  const restore = mockFetch({
    "GET /api/v1/skills/demo%2Fchild/2.0.0": skillDetail(
      "demo/child",
      "2.0.0",
      "Child description",
      [{ skill: "demo/grand", version: "3.0.0", resolved: "3.0.0" }],
      [{ path: "references/guide.md", content: "child guide" }]
    ),
    "GET /api/v1/skills/demo%2Fgrand/3.0.0": skillDetail("demo/grand", "3.0.0", "Grand description"),
  });

  try {
    const briefLogs = await captureConsole(async () => {
      await new DepsCommand().execute(createContext(workspace, ["--brief", rootDir]));
    });
    const brief = JSON.parse(briefLogs.join("\n")) as {
      dependencies: Array<{ skill_id: string; description: string }>;
    };
    assert.deepEqual(
      brief.dependencies.map((item) => item.skill_id),
      ["demo/child", "demo/grand"]
    );
    assert.equal(brief.dependencies[0].description, "Child description");

    const content = await captureStdout(async () => {
      await new DepsCommand().execute(createContext(workspace, ["--content", rootDir, "child"]));
    });
    assert.match(content, /# demo\/child/);

    const treeLogs = await captureConsole(async () => {
      await new DepsCommand().execute(createContext(workspace, ["--tree", rootDir, "demo/child@2.0.0"]));
    });
    const tree = JSON.parse(treeLogs.join("\n")) as { files: string[] };
    assert.deepEqual(new Set(tree.files), new Set(["SKILL.md", "references/guide.md", "skill-deps.lock.json"]));

    const installLogs = await captureConsole(async () => {
      await new DepsCommand().execute(createContext(workspace, ["--install", rootDir, "demo/child"]));
    });
    const installOutput = JSON.parse(installLogs.join("\n")) as { skills: string[] };
    assert.deepEqual(installOutput.skills, ["demo/child", "demo/grand"]);
    assert.equal((await stat(join(installRoot, "demo", "child", "SKILL.md"))).isFile(), true);
    assert.equal((await stat(join(installRoot, "demo", "grand", "SKILL.md"))).isFile(), true);
  } finally {
    restore();
    await rm(workspace, { recursive: true, force: true });
  }
});

test("get reuses an already installed shared child when multiple roots depend on the same version", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "skuare-get-shared-child-reuse-"));
  const installRoot = join(workspace, ".codex", "skills");
  await createWrappedRoot(join(installRoot, "demo", "root-a"), installRoot, "demo/root-a", "1.0.0", [
    { skill: "demo/shared-child", version: "1.0.0", resolved: "1.0.0" },
  ]);
  await writeInstalledSkill(join(installRoot, "demo", "shared-child"), "demo/shared-child", "1.0.0", "Shared child v1");

  const restore = mockFetch({
    "GET /api/v1/skills": new Response(JSON.stringify({
      items: [{ skill_id: "demo/root-b", version: "1.0.0", name: "root-b", author: "demo", description: "Root B description" }],
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
    "GET /api/v1/skills/demo%2Froot-b/1.0.0": skillDetail("demo/root-b", "1.0.0", "Root B description", [
      { skill: "demo/shared-child", version: "1.0.0", resolved: "1.0.0" },
    ]),
    "GET /api/v1/skills/demo%2Fshared-child/1.0.0": skillDetail("demo/shared-child", "1.0.0", "Shared child v1"),
  });

  try {
    const logs = await captureConsole(async () => {
      await new GetCommand().execute(createContext(workspace, ["demo/root-b@1.0.0"]));
    });
    const output = JSON.parse(logs.join("\n")) as {
      confirmation_required: boolean;
      overwrite_targets: Array<unknown>;
      skills: string[];
    };

    assert.equal(output.confirmation_required, false);
    assert.deepEqual(output.overwrite_targets, []);
    assert.deepEqual(output.skills, ["demo/root-b", "demo/shared-child"]);
    assert.equal((await stat(join(installRoot, "demo", "root-b", "SKILL.md"))).isFile(), true);
    assert.match(await readFile(join(installRoot, "demo", "shared-child", "SKILL.md"), "utf8"), /Shared child v1/);
  } finally {
    restore();
    await rm(workspace, { recursive: true, force: true });
  }
});

test("get blocks non-interactive overwrite when shared child version would change", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "skuare-get-shared-child-overwrite-"));
  const installRoot = join(workspace, ".codex", "skills");
  await createWrappedRoot(join(installRoot, "demo", "root-a"), installRoot, "demo/root-a", "1.0.0", [
    { skill: "demo/shared-child", version: "1.0.0", resolved: "1.0.0" },
  ]);
  await writeInstalledSkill(join(installRoot, "demo", "shared-child"), "demo/shared-child", "1.0.0", "Shared child v1");

  const restore = mockFetch({
    "GET /api/v1/skills": new Response(JSON.stringify({
      items: [{ skill_id: "demo/root-b", version: "1.0.0", name: "root-b", author: "demo", description: "Root B description" }],
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
    "GET /api/v1/skills/demo%2Froot-b/1.0.0": skillDetail("demo/root-b", "1.0.0", "Root B description", [
      { skill: "demo/shared-child", version: "2.0.0", resolved: "2.0.0" },
    ]),
    "GET /api/v1/skills/demo%2Fshared-child/2.0.0": skillDetail("demo/shared-child", "2.0.0", "Shared child v2"),
  });

  try {
    await assert.rejects(
      () => new GetCommand().execute(createContext(workspace, ["demo/root-b@1.0.0"])),
      /Overwrite confirmation required, but current session is not interactive\.[\s\S]*demo\/shared-child:1\.0\.0->2\.0\.0 \(shared with demo\/root-a\)/
    );
    await assert.rejects(stat(join(installRoot, "demo", "root-b", "SKILL.md")), /ENOENT/);
    assert.match(await readFile(join(installRoot, "demo", "shared-child", "SKILL.md"), "utf8"), /Shared child v1/);
  } finally {
    restore();
    await rm(workspace, { recursive: true, force: true });
  }
});

test("get cancels the whole install target when overwrite confirmation is rejected", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "skuare-get-shared-child-cancel-"));
  const installRoot = join(workspace, ".codex", "skills");
  await createWrappedRoot(join(installRoot, "demo", "root-a"), installRoot, "demo/root-a", "1.0.0", [
    { skill: "demo/shared-child", version: "1.0.0", resolved: "1.0.0" },
  ]);
  await writeInstalledSkill(join(installRoot, "demo", "shared-child"), "demo/shared-child", "1.0.0", "Shared child v1");

  const restore = mockFetch({
    "GET /api/v1/skills": new Response(JSON.stringify({
      items: [{ skill_id: "demo/root-b", version: "1.0.0", name: "root-b", author: "demo", description: "Root B description" }],
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
    "GET /api/v1/skills/demo%2Froot-b/1.0.0": skillDetail("demo/root-b", "1.0.0", "Root B description", [
      { skill: "demo/shared-child", version: "2.0.0", resolved: "2.0.0" },
    ]),
    "GET /api/v1/skills/demo%2Fshared-child/2.0.0": skillDetail("demo/shared-child", "2.0.0", "Shared child v2"),
  });

  try {
    await assert.rejects(
      () => new InteractiveGetCommand(false).execute(createContext(workspace, ["demo/root-b@1.0.0"])),
      /Install cancelled/
    );
    await assert.rejects(stat(join(installRoot, "demo", "root-b", "SKILL.md")), /ENOENT/);
    assert.match(await readFile(join(installRoot, "demo", "shared-child", "SKILL.md"), "utf8"), /Shared child v1/);
  } finally {
    restore();
    await rm(workspace, { recursive: true, force: true });
  }
});

test("deps --install follows the same overwrite confirmation rule for shared installed children", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "skuare-deps-shared-child-overwrite-"));
  const installRoot = join(workspace, ".codex", "skills");
  const rootDir = join(installRoot, "demo", "root-b");
  await createWrappedRoot(rootDir, installRoot, "demo/root-b", "1.0.0", [
    { skill: "demo/shared-child", version: "2.0.0", resolved: "2.0.0" },
  ]);
  await createWrappedRoot(join(installRoot, "demo", "root-a"), installRoot, "demo/root-a", "1.0.0", [
    { skill: "demo/shared-child", version: "1.0.0", resolved: "1.0.0" },
  ]);
  await writeInstalledSkill(join(installRoot, "demo", "shared-child"), "demo/shared-child", "1.0.0", "Shared child v1");

  const restore = mockFetch({
    "GET /api/v1/skills/demo%2Fshared-child/2.0.0": skillDetail("demo/shared-child", "2.0.0", "Shared child v2"),
  });

  try {
    await assert.rejects(
      () => new DepsCommand().execute(createContext(workspace, ["--install", rootDir, "demo/shared-child"])),
      /Overwrite confirmation required, but current session is not interactive\.[\s\S]*demo\/shared-child:1\.0\.0->2\.0\.0 \(shared with demo\/root-a\)/
    );

    const approvedLogs = await captureConsole(async () => {
      await new InteractiveDepsCommand(true).execute(createContext(workspace, ["--install", rootDir, "demo/shared-child"]));
    });
    const approved = JSON.parse(approvedLogs.join("\n")) as {
      confirmation_required: boolean;
      overwrite_targets: Array<{ skills: Array<{ skill_id: string; shared_with: string[] }> }>;
    };
    assert.equal(approved.confirmation_required, true);
    assert.equal(approved.overwrite_targets[0]?.skills[0]?.skill_id, "demo/shared-child");
    assert.deepEqual(approved.overwrite_targets[0]?.skills[0]?.shared_with, ["demo/root-a"]);
    assert.match(await readFile(join(installRoot, "demo", "shared-child", "SKILL.md"), "utf8"), /Shared child v2/);
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
  await writeFile(join(rootDir, "SKILL.md"), renderSkill(skillID, version, `${skillID} description`), "utf8");
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

async function writeInstalledSkill(
  skillDir: string,
  skillID: string,
  version: string,
  description: string,
  deps: Array<{ skill: string; version: string; resolved: string }> = []
): Promise<void> {
  await mkdir(skillDir, { recursive: true });
  await writeFile(join(skillDir, "SKILL.md"), renderSkill(skillID, version, description), "utf8");
  if (deps.length > 0) {
    await writeFile(
      join(skillDir, "skill-deps.lock.json"),
      `${JSON.stringify({ lock_version: 1, dependencies: deps }, null, 2)}\n`,
      "utf8"
    );
  }
}

function skillDetail(
  skillID: string,
  version: string,
  description: string,
  deps: Array<{ skill: string; version: string; resolved: string }> = [],
  extraFiles: Array<{ path: string; content: string }> = []
): Response {
  const files = [{ path: "SKILL.md", content: renderSkill(skillID, version, description) }];
  if (deps.length > 0) {
    files.push({
      path: "skill-deps.lock.json",
      content: `${JSON.stringify({ lock_version: 1, dependencies: deps }, null, 2)}\n`,
    });
  }
  for (const extra of extraFiles) {
    files.push(extra);
  }
  return new Response(JSON.stringify({
    skill_id: skillID,
    version,
    description,
    files,
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
    "## Overview",
    description,
    "",
  ].join("\n");
}

function createContext(
  cwd: string,
  args: string[],
  overrides?: Partial<Pick<CommandContext, "llmTools" | "toolSkillDirs">>
): CommandContext {
  return {
    server: "http://127.0.0.1:15657",
    localMode: true,
    cwd,
    llmTools: overrides?.llmTools || ["codex"],
    toolSkillDirs: overrides?.toolSkillDirs || {},
    auth: {
      keyId: "",
      privateKeyFile: "",
    },
    args,
  };
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

async function captureStdout(run: () => Promise<void>): Promise<string> {
  const chunks: string[] = [];
  const original = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: string | Uint8Array) => {
    chunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
    return true;
  }) as typeof process.stdout.write;
  try {
    await run();
    return chunks.join("");
  } finally {
    process.stdout.write = original;
  }
}
