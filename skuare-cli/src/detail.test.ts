import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DetailCommand } from "./commands/query";
import type { CommandContext } from "./commands/types";

test("detail prints target skill SKILL.md by skillName when relativePath is omitted", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "skuare-detail-default-"));
  try {
    await createSkill(workspace, "demo");

    const output = await captureStdout(async () => {
      await new DetailCommand().execute(createContext(workspace, ["demo"]));
    });

    assert.equal(output, ['---', 'name: "demo"', "---", "", "# demo", ""].join("\n"));
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("detail resolves skillID exactly and prints multiple files with headers", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "skuare-detail-skillid-"));
  try {
    await createSkill(workspace, "skuare/demo", {
      files: {
        "references/details.md": "# Details\n",
        "notes.txt": "note-body",
      },
    });

    const output = await captureStdout(async () => {
      await new DetailCommand().execute(createContext(workspace, ["skuare/demo", "references/details.md", "notes.txt"]));
    });

    assert.equal(output, "===== references/details.md =====\n# Details\n\n\n===== notes.txt =====\nnote-body");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("detail rejects paths outside target skill directory", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "skuare-detail-path-"));
  try {
    await createSkill(workspace, "demo");

    await assert.rejects(
      () => new DetailCommand().execute(createContext(workspace, ["demo", "../outside.txt"])),
      /detail path escapes current skill directory/
    );
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("detail fails when skillName matches multiple skillIDs", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "skuare-detail-ambiguous-"));
  try {
    await createSkill(workspace, "alpha/demo");
    await createSkill(workspace, "beta/demo");

    await assert.rejects(
      () => new DetailCommand().execute(createContext(workspace, ["demo"])),
      /detail skillName matched multiple skills: alpha\/demo, beta\/demo/
    );
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

async function createSkill(
  workspace: string,
  skillID: string,
  options?: { files?: Record<string, string> }
): Promise<void> {
  const dir = join(workspace, ".codex", "skills", ...skillID.split("/"));
  await mkdir(dir, { recursive: true });
  const parts = skillID.split("/");
  const basename = parts[parts.length - 1] || skillID;
  await writeFile(
    join(dir, "SKILL.md"),
    ['---', `name: "${basename}"`, "---", "", `# ${basename}`, ""].join("\n"),
    "utf8"
  );
  for (const [relativePath, content] of Object.entries(options?.files || {})) {
    const pathParts = relativePath.split("/");
    const filePath = join(dir, ...pathParts);
    if (pathParts.length > 1) {
      await mkdir(join(dir, ...pathParts.slice(0, -1)), { recursive: true });
    }
    await writeFile(filePath, content, "utf8");
  }
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

async function captureStdout(run: () => Promise<void>): Promise<string> {
  let output = "";
  const originalWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: string | Uint8Array) => {
    output += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
    return true;
  }) as typeof process.stdout.write;
  try {
    await run();
    return output;
  } finally {
    process.stdout.write = originalWrite;
  }
}
