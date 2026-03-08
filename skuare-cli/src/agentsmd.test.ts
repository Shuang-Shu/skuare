import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  GetAgentsMDShortCommand,
  ListAgentsMDShortCommand,
  PeekAgentsMDCommand,
} from "./commands/agentsmd";
import type { CommandContext } from "./commands/types";

test("list-agmd applies regex filtering through alias command", async () => {
  const restore = mockFetch({
    "GET /api/v1/agentsmd": jsonResponse({
      items: [
        { id: "team/agents@1.0.0", agentsmd_id: "team/agents", version: "1.0.0" },
        { id: "platform/root@1.0.0", agentsmd_id: "platform/root", version: "1.0.0" },
      ],
    }),
  });

  try {
    const logs = await captureConsole(async () => {
      await new ListAgentsMDShortCommand().execute(createContext(process.cwd(), ["--rgx", "^team/"]));
    });
    const output = JSON.parse(logs.join("\n")) as { items: Array<{ id: string }> };
    assert.deepEqual(output.items, [{ id: "team/agents@1.0.0", agentsmd_id: "team/agents", version: "1.0.0" }]);
  } finally {
    restore();
  }
});

test("peek-agentsmd prints response once without duplicated callApi output", async () => {
  const restore = mockFetch({
    "GET /api/v1/agentsmd/team%2Fagents/1.0.0": jsonResponse({
      id: "team/agents@1.0.0",
      agentsmd_id: "team/agents",
      version: "1.0.0",
      content: "# AGENTS",
    }),
  });

  try {
    const logs = await captureConsole(async () => {
      await new PeekAgentsMDCommand().execute(createContext(process.cwd(), ["team/agents", "1.0.0"]));
    });
    assert.equal(logs.length, 1);
    assert.match(logs[0], /team\/agents@1\.0\.0/);
  } finally {
    restore();
  }
});

test("get-agmd installs AGENTS.md into workspace tool root", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "skuare-agmd-"));
  const restore = mockFetch({
    "GET /api/v1/agentsmd/team%2Fagents": jsonResponse({ versions: ["1.0.0"] }),
    "GET /api/v1/agentsmd/team%2Fagents/1.0.0": jsonResponse({ content: "# Team Agents\n" }),
  });

  try {
    await mkdir(join(workspace, ".codex"), { recursive: true });
    await new GetAgentsMDShortCommand().execute(createContext(workspace, ["team/agents"]));
    const installed = await readFile(join(workspace, ".codex", "AGENTS.md"), "utf8");
    assert.equal(installed, "# Team Agents\n");
  } finally {
    restore();
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

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
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
