import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DetailCommand } from "./commands/query";
import type { CommandContext } from "./commands/types";

test("detail prints SKILL.md by default", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "skuare-detail-default-"));
  try {
    const skillContent = ["---", 'name: "demo"', "---", "", "# Demo", ""].join("\n");
    await writeFile(join(workspace, "SKILL.md"), skillContent, "utf8");

    const output = await captureStdout(async () => {
      await new DetailCommand().execute(createContext(workspace, []));
    });

    assert.equal(output, skillContent);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("detail prints multiple files with headers", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "skuare-detail-multi-"));
  try {
    await mkdir(join(workspace, "references"), { recursive: true });
    await writeFile(join(workspace, "references", "details.md"), "# Details\n", "utf8");
    await writeFile(join(workspace, "notes.txt"), "note-body", "utf8");

    const output = await captureStdout(async () => {
      await new DetailCommand().execute(createContext(workspace, ["references/details.md", "notes.txt"]));
    });

    assert.equal(output, "===== references/details.md =====\n# Details\n\n\n===== notes.txt =====\nnote-body");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("detail rejects paths outside current skill directory", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "skuare-detail-path-"));
  try {
    await writeFile(join(workspace, "SKILL.md"), "# Demo\n", "utf8");
    await assert.rejects(
      () => new DetailCommand().execute(createContext(workspace, ["../outside.txt"])),
      /detail path escapes current skill directory/
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
