import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RemoteCommand } from "./commands/remote";
import type { CommandContext } from "./commands/types";

test("remote source add/list/select/remove manages workspace sources", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "skuare-remote-source-"));

  try {
    const addOutput = await captureConsole(async () => {
      await new RemoteCommand().execute(createContext(workspace, [
        "source",
        "add",
        "origin",
        "--svc",
        "https://registry.example.com/",
      ]));
    });
    const added = JSON.parse(addOutput.join("\n")) as { source: { url: string }; default_source: string };
    assert.equal(added.source.url, "https://registry.example.com");
    assert.equal(added.default_source, "origin");

    const listOutput = await captureConsole(async () => {
      await new RemoteCommand().execute(createContext(workspace, ["source", "list"]));
    });
    const listed = JSON.parse(listOutput.join("\n")) as { sources: Array<{ name: string; current: boolean }> };
    assert.deepEqual(listed.sources, [{ name: "origin", current: true, kind: "svc", url: "https://registry.example.com" }]);

    await captureConsole(async () => {
      await new RemoteCommand().execute(createContext(workspace, [
        "source",
        "add",
        "backup",
        "--git",
        "git@github.com:team/skills.git",
      ]));
    });

    const selectOutput = await captureConsole(async () => {
      await new RemoteCommand().execute(createContext(workspace, ["source", "select", "backup"]));
    });
    const selected = JSON.parse(selectOutput.join("\n")) as { action: string; default_source: string; source: { url: string } };
    assert.equal(selected.action, "select");
    assert.equal(selected.default_source, "backup");
    assert.equal(selected.source.url, "git+ssh://git@github.com/team/skills.git");

    const removeOutput = await captureConsole(async () => {
      await new RemoteCommand().execute(createContext(workspace, ["source", "remove", "origin"]));
    });
    const removed = JSON.parse(removeOutput.join("\n")) as { removed: string; default_source: string };
    assert.equal(removed.removed, "origin");
    assert.equal(removed.default_source, "backup");

    const config = JSON.parse(await readFile(join(workspace, ".skuare", "config.json"), "utf8")) as {
      remote: {
        defaultSource: string;
        sources: Record<string, { kind: string; url: string }>;
      };
    };
    assert.equal(config.remote.defaultSource, "backup");
    assert.deepEqual(config.remote.sources, {
      backup: {
        kind: "git",
        url: "git+ssh://git@github.com/team/skills.git",
      },
    });
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("remote source add rejects non-ssh git URLs", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "skuare-remote-source-git-"));

  try {
    await assert.rejects(
      () => new RemoteCommand().execute(createContext(workspace, [
        "source",
        "add",
        "origin",
        "--git",
        "git+https://github.com/team/skills.git",
      ])),
      /Git source only supports SSH URLs/
    );
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("remote source select can point workspace default to a global source", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "skuare-remote-source-select-"));
  const home = await mkdtemp(join(tmpdir(), "skuare-remote-source-home-"));
  const originalHome = process.env.HOME;
  process.env.HOME = home;

  try {
    await mkdir(join(home, ".skuare"), { recursive: true });
    await writeFile(join(home, ".skuare", "config.json"), JSON.stringify({
      remote: {
        mode: "remote",
        address: "127.0.0.1",
        port: 15657,
        defaultSource: "prod",
        sources: {
          prod: {
            kind: "svc",
            url: "https://registry.example.com",
          },
        },
      },
      auth: { keyId: "", privateKeyFile: "" },
      llmTools: ["codex"],
      toolSkillDirs: {},
    }, null, 2), "utf8");

    const selectOutput = await captureConsole(async () => {
      await new RemoteCommand().execute(createContext(workspace, ["source", "select", "prod"]));
    });
    const selected = JSON.parse(selectOutput.join("\n")) as { default_source: string };
    assert.equal(selected.default_source, "prod");

    const workspaceConfig = JSON.parse(await readFile(join(workspace, ".skuare", "config.json"), "utf8")) as {
      remote: { defaultSource: string };
    };
    assert.equal(workspaceConfig.remote.defaultSource, "prod");
  } finally {
    process.env.HOME = originalHome;
    await rm(workspace, { recursive: true, force: true });
    await rm(home, { recursive: true, force: true });
  }
});

test("remote source use remains a compatibility alias for select", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "skuare-remote-source-use-alias-"));

  try {
    await captureConsole(async () => {
      await new RemoteCommand().execute(createContext(workspace, [
        "source",
        "add",
        "origin",
        "--svc",
        "https://registry.example.com/",
      ]));
    });

    const aliasOutput = await captureConsole(async () => {
      await new RemoteCommand().execute(createContext(workspace, ["source", "use", "origin"]));
    });
    const selected = JSON.parse(aliasOutput.join("\n")) as { action: string; default_source: string };
    assert.equal(selected.action, "select");
    assert.equal(selected.default_source, "origin");
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
