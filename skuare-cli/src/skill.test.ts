import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SkillCommand } from "./commands/skill";
import type { CommandContext } from "./commands/types";
import { APP_VERSION } from "./app_meta";

test("skill installs the default skuare skill template into cwd", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "skuare-skill-install-"));
  const skillRoot = join(workspace, "workspace-agent");
  await mkdir(skillRoot, { recursive: true });

  try {
    const logs = await captureConsole(async () => {
      await new SkillCommand().execute(createContext(skillRoot, []));
    });

    const output = JSON.parse(logs.join("\n")) as {
      skill: string;
      author: string;
      version: string;
      installed: string[];
    };
    const skillMD = await readFile(join(skillRoot, "SKILL.md"), "utf8");
    const workflow = await readFile(join(skillRoot, "references", "skuare-workflow.md"), "utf8");
    const commandMap = await readFile(join(skillRoot, "references", "command-map.md"), "utf8");

    assert.equal(output.skill, "workspace-agent");
    assert.equal(output.author, "skuare");
    assert.equal(output.version, APP_VERSION);
    assert.match(skillMD, /name: "workspace-agent"/);
    assert.match(skillMD, /author: "skuare"/);
    assert.match(skillMD, new RegExp(`version: "${escapeRegex(APP_VERSION)}"`));
    assert.match(skillMD, /Operate Skuare CLI workflows in the current workspace/);
    assert.match(skillMD, /Read `references\/skuare-workflow\.md` before editing local skill files/);
    assert.match(workflow, /Work from the current workspace/);
    assert.match(commandMap, /skr get <skillRef> \[version] \[--global] \[--wrap] \[--slink]/);
    assert.equal(output.installed.length, 3);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("skill is idempotent when embedded files already match", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "skuare-skill-idempotent-"));
  try {
    await captureConsole(async () => {
      await new SkillCommand().execute(createContext(workspace, []));
    });
    const logs = await captureConsole(async () => {
      await new SkillCommand().execute(createContext(workspace, []));
    });
    const output = JSON.parse(logs.join("\n")) as { installed: string[]; unchanged: string[] };
    assert.deepEqual(output.installed, []);
    assert.equal(output.unchanged.length, 3);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("skill fails when cwd already contains conflicting files", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "skuare-skill-conflict-"));
  try {
    await writeFile(join(workspace, "SKILL.md"), "conflict\n", "utf8");
    await assert.rejects(
      () => new SkillCommand().execute(createContext(workspace, [])),
      /Default skuare skill template conflicts with existing file/
    );
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

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

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
