import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const CLI_PATH = resolve(__dirname, "index.js");

test("removed agentsmd suffix commands show migration hint", async () => {
  try {
    await execFile(process.execPath, [CLI_PATH, "list-agmd", "--rgx", "^team/"]);
    assert.fail("Expected removed command to exit with error");
  } catch (error) {
    const result = error as Error & { code?: number | string; stdout?: string; stderr?: string };
    assert.equal(result.code, 1);
    assert.equal(result.stdout || "", "");
    assert.match(
      result.stderr || "",
      /\[CLI_INVALID_ARGUMENT\] Command 'list-agmd' was removed\. Use: list --type agmd --rgx \^team\//
    );
  }
});
