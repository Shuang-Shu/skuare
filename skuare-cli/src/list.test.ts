import test from "node:test";
import assert from "node:assert/strict";
import { ListCommand } from "./commands/query";
import type { CommandContext } from "./commands/types";

test("list rejects bare positional skill search text", async () => {
  await assert.rejects(
    () => new ListCommand().execute(createContext(process.cwd(), ["aaa"])),
    /Bare positional arguments are not allowed; use --q or --rgx/
  );
});

test("list rejects bare positional agentsmd search text", async () => {
  await assert.rejects(
    () => new ListCommand().execute(createContext(process.cwd(), ["--type", "agmd", "aaa"])),
    /Bare positional arguments are not allowed; use --q or --rgx/
  );
});

test("list still accepts --q searches", async () => {
  const requests: string[] = [];
  const restore = mockFetch(async (input) => {
    const url = new URL(String(input));
    requests.push(`${url.pathname}${url.search}`);
    return jsonResponse({
      items: [{ skill_id: "demo/tool-root", version: "1.0.0", name: "root-skill", author: "demo", description: "Root" }],
    });
  });

  try {
    const logs = await captureConsole(async () => {
      await new ListCommand().execute(createContext(process.cwd(), ["--q", "root-skill"]));
    });
    const output = JSON.parse(logs.join("\n")) as { items: Array<{ skill_id: string }> };
    assert.deepEqual(output.items, [{
      id: "demo/root-skill@1.0.0",
      name: "root-skill",
      author: "demo",
      skill_id: "demo/tool-root",
      version: "1.0.0",
      description: "Root",
    }]);
    assert.deepEqual(requests, ["/api/v1/skills?q=root-skill"]);
  } finally {
    restore();
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

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function mockFetch(handler: (input: RequestInfo | URL, init?: RequestInit) => Response | Promise<Response>): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input, init) => handler(input, init)) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

async function captureConsole(fn: () => Promise<void>): Promise<string[]> {
  const lines: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => {
    lines.push(args.map((item) => String(item)).join(" "));
  };
  try {
    await fn();
  } finally {
    console.log = original;
  }
  return lines;
}
