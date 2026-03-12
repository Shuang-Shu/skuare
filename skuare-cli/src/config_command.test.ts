import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConfigCommand } from "./commands/config";
import type { CommandContext } from "./commands/types";
import { findNearestWorkspaceConfig, getWorkspaceConfigLookupPaths } from "./config/resolver";
import type { JsonValue } from "./types";

test("workspace config lookup walks upward from cwd until the filesystem root", async () => {
  const base = await mkdtemp(join(tmpdir(), "skuare-config-lookup-"));
  const outer = join(base, "outer");
  const inner = join(outer, "repo");
  const leaf = join(inner, "apps", "web");
  await mkdir(join(outer, ".skuare"), { recursive: true });
  await mkdir(join(inner, ".skuare"), { recursive: true });
  await mkdir(leaf, { recursive: true });
  await writeConfig(join(outer, ".skuare", "config.json"), {
    remote: { mode: "local", address: "outer.example", port: 15657 },
    auth: { keyId: "", privateKeyFile: "" },
    llmTools: ["codex"],
    toolSkillDirs: {},
  });
  await writeConfig(join(inner, ".skuare", "config.json"), {
    remote: { mode: "local", address: "inner.example", port: 16666 },
    auth: { keyId: "", privateKeyFile: "" },
    llmTools: ["qwen"],
    toolSkillDirs: {},
  });

  try {
    const lookupPaths = getWorkspaceConfigLookupPaths(leaf);
    assert.equal(lookupPaths[0], join(leaf, ".skuare", "config.json"));
    assert.equal(lookupPaths[1], join(inner, "apps", ".skuare", "config.json"));
    assert.equal(lookupPaths[2], join(inner, ".skuare", "config.json"));

    const found = await findNearestWorkspaceConfig(leaf);
    assert.equal(found?.path, join(inner, ".skuare", "config.json"));
    assert.equal(found?.config.remote?.address, "inner.example");
    assert.deepEqual(found?.config.llmTools, ["qwen"]);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test("config command prints the nearest workspace config path and content", async () => {
  const base = await mkdtemp(join(tmpdir(), "skuare-config-command-"));
  const workspace = join(base, "workspace");
  const nested = join(workspace, "src", "feature");
  await mkdir(join(workspace, ".skuare"), { recursive: true });
  await mkdir(nested, { recursive: true });
  await writeConfig(join(workspace, ".skuare", "config.json"), {
    remote: { mode: "local", address: "127.0.0.1", port: 15657 },
    auth: { keyId: "kid", privateKeyFile: "/tmp/key.pem" },
    llmTools: ["codex", "qwen"],
    toolSkillDirs: { codex: "./.codex/skills" },
  });

  try {
    const logs = await captureConsole(async () => {
      await new ConfigCommand().execute(createContext(nested, []));
    });
    const output = JSON.parse(logs.join("\n")) as {
      scope: string;
      path: string;
      config: { llmTools: string[]; auth: { keyId: string } };
    };
    assert.equal(output.scope, "workspace");
    assert.equal(output.path, join(workspace, ".skuare", "config.json"));
    assert.deepEqual(output.config.llmTools, ["codex", "qwen"]);
    assert.equal(output.config.auth.keyId, "kid");
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test("config command reads the global config when --global is provided", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "skuare-config-global-workspace-"));
  const home = await mkdtemp(join(tmpdir(), "skuare-config-global-home-"));
  const originalHome = process.env.HOME;
  process.env.HOME = home;
  await mkdir(join(home, ".skuare"), { recursive: true });
  await writeConfig(join(home, ".skuare", "config.json"), {
    remote: { mode: "remote", address: "global.example", port: 25657 },
    auth: { keyId: "", privateKeyFile: "" },
    llmTools: ["claudecode"],
    toolSkillDirs: {},
  });

  try {
    const logs = await captureConsole(async () => {
      await new ConfigCommand().execute(createContext(workspace, ["--global"]));
    });
    const output = JSON.parse(logs.join("\n")) as {
      scope: string;
      path: string;
      config: { remote: { address: string } };
    };
    assert.equal(output.scope, "global");
    assert.equal(output.path, join(home, ".skuare", "config.json"));
    assert.equal(output.config.remote.address, "global.example");
  } finally {
    process.env.HOME = originalHome;
    await rm(workspace, { recursive: true, force: true });
    await rm(home, { recursive: true, force: true });
  }
});

test("config command fails clearly when no workspace config exists up to the filesystem root", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "skuare-config-missing-"));

  try {
    await assert.rejects(
      () => new ConfigCommand().execute(createContext(workspace, [])),
      /Workspace config not found from .* up to \//
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

function writeConfig(path: string, config: JsonValue): Promise<void> {
  return writeFile(path, `${JSON.stringify(config, null, 2)}\n`, "utf8");
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
