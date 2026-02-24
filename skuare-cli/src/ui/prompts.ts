/**
 * TUI 提示组件 - 问答交互
 */

import * as readlinePromises from "node:readline/promises";

type ReadlineInterface = Awaited<ReturnType<typeof readlinePromises.createInterface>>;

/**
 * 带默认值的问答
 */
export async function askWithDefault(
  rl: ReadlineInterface,
  label: string,
  defaultValue: string
): Promise<string> {
  const answer = (await rl.question(`${label} [${defaultValue}]: `)).trim();
  return answer || defaultValue;
}

/**
 * 是/否确认问答
 */
export async function askYesNo(
  rl: ReadlineInterface,
  label: string,
  defaultYes: boolean
): Promise<boolean> {
  const tip = defaultYes ? "Y/n" : "y/N";
  const d = defaultYes ? "Y" : "N";
  const raw = (await rl.question(`${label} (${tip}) [${d}]: `)).trim();

  if (!raw) {
    return defaultYes;
  }

  return /^y(es)?$/i.test(raw);
}

/**
 * 解析端口号
 */
export function parsePort(portRaw: string): number {
  const port = Number.parseInt(portRaw, 10);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid port: ${portRaw}`);
  }
  return port;
}

/**
 * 提示输入自定义工具名称
 */
export async function promptCustomToolName(): Promise<string> {
  const rl = readlinePromises.createInterface({ input: process.stdin, output: process.stdout });

  try {
    const raw = (await rl.question("Input custom tool name (empty to cancel): ")).trim();
    return raw;
  } finally {
    rl.close();
  }
}

/**
 * 选择 LLM 工具（支持自定义添加）
 */
export async function selectLLMTools(defaultTools: string[]): Promise<string[]> {
  const baseTools = ["codex", "claudecode"];
  const stdin = process.stdin as {
    isTTY?: boolean;
    isRaw?: boolean;
    setRawMode?: (mode: boolean) => void;
    resume?: () => void;
    pause?: () => void;
    on: (event: string, cb: (str: string, key: { name?: string; ctrl?: boolean }) => void) => void;
    off: (event: string, cb: (str: string, key: { name?: string; ctrl?: boolean }) => void) => void;
  };
  const stdout = process.stdout as { isTTY?: boolean; write: (msg: string) => void };

  const selected = new Set<string>(defaultTools.filter(Boolean));
  const customDefaults = defaultTools.filter((t) => !baseTools.includes(t));

  type Row = { kind: "tool"; value: string } | { kind: "add-custom" };
  const rows: Row[] = [
    { kind: "tool", value: "codex" },
    { kind: "tool", value: "claudecode" },
    ...customDefaults.map((v) => ({ kind: "tool", value: v }) as Row),
    { kind: "add-custom" },
  ];

  if (!stdin.isTTY || !stdout.isTTY) {
    const fallback = Array.from(new Set(defaultTools.filter(Boolean)));
    return fallback.length > 0 ? fallback : ["codex"];
  }

  const readline = await import("node:readline");
  readline.emitKeypressEvents(process.stdin);

  stdin.resume?.();
  const wasRaw = !!stdin.isRaw;
  stdin.setRawMode?.(true);

  let idx = 0;
  let rendered = false;
  let inputBusy = false;

  const blockHeight = () => rows.length + 1;

  const render = () => {
    if (rendered) {
      stdout.write(`\x1b[${blockHeight()}F`);
    }
    stdout.write("\x1b[J");
    stdout.write("Select LLM tools (↑/↓ move, Space toggle/add custom, Enter confirm):\n");

    for (const [i, row] of rows.entries()) {
      const cursor = i === idx ? ">" : " ";
      if (row.kind === "add-custom") {
        stdout.write(`${cursor} [+] custom\n`);
      } else {
        const mark = selected.has(row.value) ? "[x]" : "[ ]";
        const label = baseTools.includes(row.value) ? row.value : `custom: ${row.value}`;
        stdout.write(`${cursor} ${mark} ${label}\n`);
      }
    }
    rendered = true;
  };

  render();

  let enterArmed = false;
  setTimeout(() => {
    enterArmed = true;
  }, 200);

  const confirmed = await new Promise<Set<string>>((resolve) => {
    const onKeypress = (str: string, key: { name?: string; ctrl?: boolean }) => {
      if (inputBusy) {
        return;
      }

      if (key?.name === "up") {
        idx = (idx - 1 + rows.length) % rows.length;
        render();
        return;
      }

      if (key?.name === "down") {
        idx = (idx + 1) % rows.length;
        render();
        return;
      }

      if (key?.name === "space" || str === " ") {
        const row = rows[idx];
        if (row.kind === "tool") {
          if (selected.has(row.value)) {
            selected.delete(row.value);
          } else {
            selected.add(row.value);
          }
          render();
          return;
        }

        // Add custom tool
        inputBusy = true;
        stdin.off("keypress", onKeypress);
        stdin.setRawMode?.(false);

        void (async () => {
          try {
            const custom = await promptCustomToolName();
            if (custom) {
              const exists = rows.some((r) => r.kind === "tool" && r.value === custom);
              if (!exists) {
                rows.splice(rows.length - 1, 0, { kind: "tool", value: custom });
              }
              selected.add(custom);
              idx = rows.findIndex((r) => r.kind === "tool" && r.value === custom);
            }
          } finally {
            stdin.resume?.();
            stdin.setRawMode?.(true);
            stdin.on("keypress", onKeypress);
            inputBusy = false;
            render();
          }
        })();

        return;
      }

      if (key?.name === "return" || key?.name === "enter") {
        if (!enterArmed) {
          return;
        }
        stdin.off("keypress", onKeypress);
        stdin.setRawMode?.(wasRaw);
        stdin.pause?.();
        if (rendered) {
          stdout.write(`\x1b[${blockHeight()}F`);
          stdout.write("\x1b[J");
        }
        resolve(new Set(selected));
        return;
      }

      if (key?.ctrl && key?.name === "c") {
        stdin.off("keypress", onKeypress);
        stdin.setRawMode?.(wasRaw);
        stdin.pause?.();
        process.exit(130);
      }
    };

    stdin.on("keypress", onKeypress);
  });

  const out = Array.from(confirmed);

  if (out.length === 0) {
    throw new Error("At least one LLM tool must be selected");
  }

  console.log("Selected LLM tools:");
  for (const t of out) {
    if (t === "codex" || t === "claudecode") {
      console.log(`  - ${t}`);
    } else {
      console.log(`  - custom: ${t}`);
    }
  }

  return Array.from(new Set(out));
}
