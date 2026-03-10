import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BuildCommand } from "./commands/write";
import type { CommandContext } from "./commands/types";

test("build initializes a missing target skill and writes dependency files", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "skuare-build-init-"));
  try {
    await createSkill(workspace, "github-deep-research", "1.2.3");
    const command = new MockBuildCommand([
      "Help users coordinate research workflows.",
      "ShuangShu",
      "0.1.0",
    ]);
    command.tty = true;
    await command.execute(createContext(workspace, ["work-helper", "github-deep-research"]));

    const skillMD = await readFile(join(workspace, "work-helper", "SKILL.md"), "utf8");
    const deps = JSON.parse(await readFile(join(workspace, "work-helper", "skill-deps.json"), "utf8")) as {
      dependencies: Array<{ skill: string; version: string }>;
    };
    const lock = JSON.parse(await readFile(join(workspace, "work-helper", "skill-deps.lock.json"), "utf8")) as {
      lock_version: number;
      dependencies: Array<{ skill: string; version: string; resolved: string }>;
    };

    assert.match(skillMD, /name: "work-helper"/);
    assert.match(skillMD, /description: "Help users coordinate research workflows\."/);
    assert.match(skillMD, /author: "ShuangShu"/);
    assert.match(skillMD, /version: "0\.1\.0"/);
    assert.deepEqual(deps.dependencies, [{ skill: "github-deep-research", version: "1.2.3" }]);
    assert.deepEqual(lock, {
      lock_version: 1,
      dependencies: [{ skill: "github-deep-research", version: "1.2.3", resolved: "1.2.3" }],
    });
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("build preserves existing dependencies when appending a new ref", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "skuare-build-merge-"));
  try {
    await createSkill(workspace, "work-helper", "0.1.0");
    await createSkill(workspace, "github-deep-research", "1.2.3");
    await createSkill(workspace, "ppt-generation", "2.0.0");
    await writeFile(
      join(workspace, "work-helper", "skill-deps.json"),
      `${JSON.stringify({ dependencies: [{ skill: "github-deep-research", version: "1.2.3" }] }, null, 2)}\n`,
      "utf8"
    );
    await writeFile(
      join(workspace, "work-helper", "skill-deps.lock.json"),
      `${JSON.stringify({
        lock_version: 1,
        dependencies: [{ skill: "github-deep-research", version: "1.2.3", resolved: "1.2.3" }],
      }, null, 2)}\n`,
      "utf8"
    );

    const command = new MockBuildCommand([]);
    command.tty = true;
    await command.execute(createContext(workspace, ["work-helper", "ppt-generation"]));

    const deps = JSON.parse(await readFile(join(workspace, "work-helper", "skill-deps.json"), "utf8")) as {
      dependencies: Array<{ skill: string; version: string }>;
    };
    assert.deepEqual(deps.dependencies, [
      { skill: "github-deep-research", version: "1.2.3" },
      { skill: "ppt-generation", version: "2.0.0" },
    ]);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("build initializes a missing target skill and scans sibling skills with --all", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "skuare-build-all-init-"));
  try {
    await createSkill(workspace, "ref-a", "1.0.0");
    await createSkill(workspace, "ref-b", "2.0.0");
    const command = new MockBuildCommand([
      "Aggregate science skills into one entrypoint.",
      "ShuangShu",
      "0.0.1",
    ]);
    command.tty = true;
    await command.execute(createContext(workspace, ["sci-skills", "--all"]));

    const deps = JSON.parse(await readFile(join(workspace, "sci-skills", "skill-deps.json"), "utf8")) as {
      dependencies: Array<{ skill: string; version: string }>;
    };
    assert.deepEqual(deps.dependencies, [
      { skill: "ref-a", version: "1.0.0" },
      { skill: "ref-b", version: "2.0.0" },
    ]);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("build fails clearly when target skill is missing in non-tty mode", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "skuare-build-no-tty-"));
  try {
    await createSkill(workspace, "ref-a", "1.0.0");
    const command = new MockBuildCommand([]);
    command.tty = false;
    await assert.rejects(
      () => command.execute(createContext(workspace, ["sci-skills", "--all"])),
      /interactive initialization requires a TTY/
    );
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("build --skr-skill initializes cwd as a skill-builder-style skill and writes dependency files", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "skuare-build-skr-skill-"));
  try {
    await createSkill(workspace, "github-deep-research", "1.2.3");
    const skillRoot = join(workspace, "workspace-agent");
    await mkdir(skillRoot, { recursive: true });

    const command = new MockBuildCommand([
      "Use when the user asks to maintain the workspace-agent package and deliver its workflow output.",
      "ShuangShu",
      "0.1.0",
    ]);
    command.tty = true;
    await command.execute(createContext(skillRoot, ["--skr-skill", "github-deep-research"]));

    const skillMD = await readFile(join(skillRoot, "SKILL.md"), "utf8");
    const workflowRef = await readFile(join(skillRoot, "references", "skuare-workflow.md"), "utf8");
    const deps = JSON.parse(await readFile(join(skillRoot, "skill-deps.json"), "utf8")) as {
      dependencies: Array<{ skill: string; version: string }>;
    };

    assert.match(skillMD, /name: "workspace-agent"/);
    assert.match(skillMD, /description: "Use when the user asks to maintain the workspace-agent package and deliver its workflow output\."/);
    assert.match(skillMD, /Read `references\/skuare-workflow\.md` before editing/);
    assert.match(workflowRef, /skr build --skr-skill \[refSkill...\] \[--all\]/);
    assert.deepEqual(deps.dependencies, [{ skill: "github-deep-research", version: "1.2.3" }]);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("build --skr-skill --all scans child skill dirs under cwd", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "skuare-build-skr-skill-all-"));
  try {
    await createSkill(workspace, "ref-a", "1.0.0");
    await createSkill(workspace, "ref-b", "2.0.0");

    const command = new MockBuildCommand([
      "Use when the user asks to orchestrate the whole workspace package.",
      "ShuangShu",
      "0.0.1",
    ]);
    command.tty = true;
    await command.execute(createContext(workspace, ["--skr-skill", "--all"]));

    const deps = JSON.parse(await readFile(join(workspace, "skill-deps.json"), "utf8")) as {
      dependencies: Array<{ skill: string; version: string }>;
    };
    assert.deepEqual(deps.dependencies, [
      { skill: "ref-a", version: "1.0.0" },
      { skill: "ref-b", version: "2.0.0" },
    ]);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

async function createSkill(root: string, skillID: string, version: string): Promise<void> {
  const dir = join(root, skillID);
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, "SKILL.md"),
    [
      "---",
      `name: "${skillID}"`,
      "metadata:",
      `  version: "${version}"`,
      '  author: "tester"',
      `description: "Skill ${skillID}"`,
      "---",
      "",
      `# ${skillID}`,
      "",
      "## Overview",
      `Use this skill for ${skillID}.`,
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

class MockBuildCommand extends BuildCommand {
  tty = true;

  constructor(private readonly answers: string[]) {
    super();
  }

  protected override isInteractiveTerminal(): boolean {
    return this.tty;
  }

  protected override createReadlineInterface(): {
    question: (query: string) => Promise<string>;
    close: () => void;
  } {
    const queue = this.answers;
    return {
      async question() {
        return queue.shift() ?? "";
      },
      close() {
        return undefined;
      },
    };
  }
}
