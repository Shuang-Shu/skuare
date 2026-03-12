import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RemoveCommand } from "./commands/query";
import type { CommandContext } from "./commands/types";

test("remove deletes an exact local skillID and leaves siblings untouched", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "skuare-remove-local-"));
  const installRoot = join(workspace, ".codex", "skills");
  try {
    await createInstalledSkill(installRoot, "demo/root", "1.0.0");
    await createInstalledSkill(installRoot, "demo/keep", "1.0.0");

    const logs = await captureConsole(async () => {
      await new RemoveCommand().execute(createContext(workspace, ["demo/root"]));
    });
    const output = JSON.parse(logs.join("\n")) as { removed: string[] };

    assert.deepEqual(output.removed, ["demo/root"]);
    await assert.rejects(stat(join(installRoot, "demo", "root", "SKILL.md")), /ENOENT/);
    assert.equal((await stat(join(installRoot, "demo", "keep", "SKILL.md"))).isFile(), true);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("remove deletes installed skills from all configured workspace tool roots", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "skuare-remove-multi-tool-"));
  const codexRoot = join(workspace, ".codex", "skills");
  const qwenRoot = join(workspace, ".qwen", "skills");
  try {
    await createInstalledSkill(codexRoot, "demo/root", "1.0.0");
    await createInstalledSkill(qwenRoot, "demo/root", "1.0.0");

    const logs = await captureConsole(async () => {
      await new RemoveCommand().execute(createContext(workspace, ["demo/root"], {
        llmTools: ["codex", "qwen"],
      }));
    });
    const output = JSON.parse(logs.join("\n")) as {
      removed: string[];
      targets: Array<{ target: string; removed: string[]; missing: boolean }>;
    };

    assert.deepEqual(output.removed, ["demo/root"]);
    assert.equal(output.targets.length, 2);
    assert.deepEqual(
      output.targets.map((entry) => entry.target).sort((a, b) => a.localeCompare(b)),
      [codexRoot, qwenRoot].sort((a, b) => a.localeCompare(b))
    );
    assert.deepEqual(output.targets.map((entry) => entry.removed), [["demo/root"], ["demo/root"]]);
    assert.deepEqual(output.targets.map((entry) => entry.missing), [false, false]);
    await assert.rejects(stat(join(codexRoot, "demo", "root", "SKILL.md")), /ENOENT/);
    await assert.rejects(stat(join(qwenRoot, "demo", "root", "SKILL.md")), /ENOENT/);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("remove respects custom workspace tool skill dirs for every configured tool", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "skuare-remove-custom-tool-dir-"));
  const codexRoot = join(workspace, ".codex", "skills");
  const qwenRoot = join(workspace, "custom-tools", "qwen-skills");
  try {
    await createInstalledSkill(codexRoot, "demo/root", "1.0.0");
    await createInstalledSkill(qwenRoot, "demo/root", "1.0.0");

    const logs = await captureConsole(async () => {
      await new RemoveCommand().execute(createContext(workspace, ["demo/root"], {
        llmTools: ["codex", "qwen"],
        toolSkillDirs: { qwen: "custom-tools/qwen-skills" },
      }));
    });
    const output = JSON.parse(logs.join("\n")) as {
      removed: string[];
      targets: Array<{ target: string; removed: string[]; missing: boolean }>;
    };

    assert.deepEqual(output.removed, ["demo/root"]);
    assert.equal(output.targets.length, 2);
    assert.deepEqual(
      output.targets.map((entry) => entry.target).sort((a, b) => a.localeCompare(b)),
      [codexRoot, qwenRoot].sort((a, b) => a.localeCompare(b))
    );
    await assert.rejects(stat(join(codexRoot, "demo", "root", "SKILL.md")), /ENOENT/);
    await assert.rejects(stat(join(qwenRoot, "demo", "root", "SKILL.md")), /ENOENT/);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("remove reports missing targets without throwing", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "skuare-remove-missing-"));
  try {
    const logs = await captureConsole(async () => {
      await new RemoveCommand().execute(createContext(workspace, ["demo/missing"]));
    });
    const output = JSON.parse(logs.join("\n")) as {
      removed: string[];
      targets: Array<{ missing: boolean }>;
    };

    assert.deepEqual(output.removed, []);
    assert.equal(output.targets.length, 1);
    assert.equal(output.targets[0].missing, true);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("remove --deps keeps shared dependencies still referenced by other installed skills", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "skuare-remove-shared-"));
  const installRoot = join(workspace, ".codex", "skills");
  try {
    await createInstalledSkill(installRoot, "demo/root-a", "1.0.0", [
      { skill: "demo/shared", version: "1.0.0", resolved: "1.0.0" },
      { skill: "demo/child-a", version: "1.0.0", resolved: "1.0.0" },
    ]);
    await createInstalledSkill(installRoot, "demo/root-b", "1.0.0", [
      { skill: "demo/shared", version: "1.0.0", resolved: "1.0.0" },
    ]);
    await createInstalledSkill(installRoot, "demo/shared", "1.0.0");
    await createInstalledSkill(installRoot, "demo/child-a", "1.0.0");

    const logs = await captureConsole(async () => {
      await new RemoveCommand().execute(createContext(workspace, ["demo/root-a", "--deps"]));
    });
    const output = JSON.parse(logs.join("\n")) as {
      removed: string[];
      kept_shared_dependencies: string[];
    };

    assert.deepEqual(output.removed, ["demo/child-a", "demo/root-a"]);
    assert.deepEqual(output.kept_shared_dependencies, ["demo/shared"]);
    await assert.rejects(stat(join(installRoot, "demo", "root-a", "SKILL.md")), /ENOENT/);
    await assert.rejects(stat(join(installRoot, "demo", "child-a", "SKILL.md")), /ENOENT/);
    assert.equal((await stat(join(installRoot, "demo", "shared", "SKILL.md"))).isFile(), true);
    assert.equal((await stat(join(installRoot, "demo", "root-b", "SKILL.md"))).isFile(), true);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("remove defaults to deleting only the wrap root skill and keeps installed dependencies", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "skuare-remove-wrap-"));
  const installRoot = join(workspace, ".codex", "skills");
  try {
    await createInstalledSkill(
      installRoot,
      "demo/root",
      "1.0.0",
      [{ skill: "demo/child", version: "2.0.0", resolved: "2.0.0" }],
      { wrap: true, tool: "codex", global: false }
    );
    await createInstalledSkill(installRoot, "demo/child", "2.0.0");

    const logs = await captureConsole(async () => {
      await new RemoveCommand().execute(createContext(workspace, ["demo/root"]));
    });
    const output = JSON.parse(logs.join("\n")) as { removed: string[] };

    assert.deepEqual(output.removed, ["demo/root"]);
    await assert.rejects(stat(join(installRoot, "demo", "root", "SKILL.md")), /ENOENT/);
    assert.equal((await stat(join(installRoot, "demo", "child", "SKILL.md"))).isFile(), true);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("remove --global deletes installed skills from all configured global tool roots", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "skuare-remove-global-"));
  const home = await mkdtemp(join(tmpdir(), "skuare-remove-home-"));
  const originalHome = process.env.HOME;
  process.env.HOME = home;
  try {
    await createInstalledSkill(join(home, ".codex", "skills"), "demo/root", "1.0.0");
    await createInstalledSkill(join(home, ".qwen", "skills"), "demo/root", "1.0.0");

    const logs = await captureConsole(async () => {
      await new RemoveCommand().execute(createContext(workspace, ["demo/root", "--global"], {
        llmTools: ["codex", "qwen"],
      }));
    });
    const output = JSON.parse(logs.join("\n")) as {
      global: boolean;
      removed: string[];
      targets: Array<{ target: string; removed: string[] }>;
    };

    assert.equal(output.global, true);
    assert.deepEqual(output.removed, ["demo/root"]);
    assert.equal(output.targets.length, 2);
    await assert.rejects(stat(join(home, ".codex", "skills", "demo", "root", "SKILL.md")), /ENOENT/);
    await assert.rejects(stat(join(home, ".qwen", "skills", "demo", "root", "SKILL.md")), /ENOENT/);
  } finally {
    process.env.HOME = originalHome;
    await rm(workspace, { recursive: true, force: true });
    await rm(home, { recursive: true, force: true });
  }
});

test("remove requires a TTY for ambiguous non-skillID selections", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "skuare-remove-ambiguous-"));
  const installRoot = join(workspace, ".codex", "skills");
  try {
    await createInstalledSkill(installRoot, "alpha/demo", "1.0.0");
    await createInstalledSkill(installRoot, "beta/demo", "2.0.0");

    await assert.rejects(
      () => new RemoveCommand().execute(createContext(workspace, ["demo"])),
      /interactive removal requires a TTY/
    );
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

async function createInstalledSkill(
  installRoot: string,
  skillID: string,
  version: string,
  deps: Array<{ skill: string; version: string; resolved: string }> = [],
  options?: { wrap?: boolean; tool?: string; global?: boolean }
): Promise<void> {
  const skillDir = join(installRoot, ...skillID.split("/"));
  await mkdir(skillDir, { recursive: true });
  await writeFile(
    join(skillDir, "SKILL.md"),
    renderSkill(skillID, version, `${skillID} description`),
    "utf8"
  );
  if (deps.length > 0) {
    await writeFile(
      join(skillDir, "skill-deps.lock.json"),
      `${JSON.stringify({ lock_version: 1, dependencies: deps }, null, 2)}\n`,
      "utf8"
    );
  }
  if (options?.wrap) {
    await writeFile(
      join(skillDir, ".skuare-wrap.json"),
      `${JSON.stringify({
        version: 1,
        mode: "wrap",
        tool: options.tool || "codex",
        root_skill_id: skillID,
        root_version: version,
        install_root: installRoot,
        global: options.global === true,
      }, null, 2)}\n`,
      "utf8"
    );
  }
}

function renderSkill(skillID: string, version: string, description: string): string {
  const parts = skillID.split("/");
  const name = parts[parts.length - 1] || skillID;
  const author = parts.length > 1 ? parts[0] : "demo";
  return [
    "---",
    `name: "${name}"`,
    `description: "${description}"`,
    "metadata:",
    `  version: "${version}"`,
    `  author: "${author}"`,
    "---",
    "",
    `# ${skillID}`,
    "",
  ].join("\n");
}

function createContext(cwd: string, args: string[], overrides?: Partial<CommandContext>): CommandContext {
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
    ...overrides,
  };
}

async function captureConsole(run: () => Promise<void>): Promise<string[]> {
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => {
    logs.push(args.join(" "));
  };
  try {
    await run();
    return logs;
  } finally {
    console.log = originalLog;
  }
}
