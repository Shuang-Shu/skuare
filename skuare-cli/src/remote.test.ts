import test from "node:test";
import assert from "node:assert/strict";
import type { Command, CommandContext } from "./commands/types";
import { RemoteCommand } from "./commands/remote";

test("RemoteCommand forwards subcommand args to the delegated command", async () => {
  let receivedArgs: string[] | undefined;
  const delegated: Command = {
    name: "publish",
    description: "publish",
    async execute(context: CommandContext): Promise<void> {
      receivedArgs = context.args;
    },
  };

  await new RemoteCommand(new Map([["publish", () => delegated]])).execute(createContext(["publish", "--skill", "demo.md"]));

  assert.deepEqual(receivedArgs, ["--skill", "demo.md"]);
});

test("RemoteCommand prints help when no subcommand is provided", async () => {
  const logs = await captureConsole(async () => {
    await new RemoteCommand().execute(createContext([]));
  });

  assert.equal(logs.length, 1);
  assert.match(logs[0], /^remote\n\nRun remote registry operations\n\nUsage:/);
  assert.match(logs[0], /skuare remote update <skillRef> <newSkillDir>/);
  assert.match(logs[0], /skuare remote source add \[--global] <originName> \[--git\|--svc] <remoteUrl>/);
  assert.match(logs[0], /skuare remote migrate <src> <dst> \[--type <all\|skill\|agentsmd\|agmd>] \[--dry-run] \[--skip-existing]/);
});

test("RemoteCommand rejects unknown subcommands", async () => {
  await assert.rejects(
    () => new RemoteCommand().execute(createContext(["push"])),
    /Unknown remote subcommand: push\. Supported: publish, update, create, delete, source, migrate/,
  );
});

function createContext(args: string[]): CommandContext {
  return {
    server: "http://127.0.0.1:15657",
    localMode: true,
    cwd: process.cwd(),
    llmTools: [],
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
    logs.push(args.join(" "));
  };
  try {
    await run();
    return logs;
  } finally {
    console.log = original;
  }
}
