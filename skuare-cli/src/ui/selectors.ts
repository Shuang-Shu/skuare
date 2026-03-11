/**
 * TUI 选择器组件 - 方向键选择交互
 */

type KeypressHandler = (str: string, key: { name?: string; ctrl?: boolean }) => void;

type StdinInterface = {
  isTTY?: boolean;
  isRaw?: boolean;
  setRawMode?: (mode: boolean) => void;
  resume?: () => void;
  pause?: () => void;
  on: (event: string, cb: KeypressHandler) => void;
  off: (event: string, cb: KeypressHandler) => void;
};

type StdoutInterface = {
  isTTY?: boolean;
  write: (msg: string) => void;
};

/**
 * 通用方向键选择器
 */
export async function selectWithArrows<T>({
  options,
  labels,
  defaultIndex = 0,
  title,
  minSelected = 1,
  allowMultiple = false,
}: {
  options: T[];
  labels: string[];
  defaultIndex?: number;
  title: string;
  minSelected?: number;
  allowMultiple?: boolean;
}): Promise<T | T[] | Set<T>> {
  const stdin = process.stdin as StdinInterface;
  const stdout = process.stdout as StdoutInterface;

  if (!stdin.isTTY || !stdout.isTTY) {
    return allowMultiple ? [options[defaultIndex]] : options[defaultIndex];
  }

  const readline = await import("node:readline");
  readline.emitKeypressEvents(process.stdin);

  stdin.resume?.();
  const wasRaw = !!stdin.isRaw;
  stdin.setRawMode?.(true);

  let idx = defaultIndex;
  const selected = new Set<T>([options[defaultIndex]]);
  const blockHeight = options.length + 1;
  let rendered = false;
  let enterArmed = false;

  setTimeout(() => {
    enterArmed = true;
  }, 200);

  const render = () => {
    if (rendered) {
      stdout.write(`\x1b[${blockHeight}F`);
    }
    stdout.write("\x1b[J");
    stdout.write(`${title}\n`);

    for (let i = 0; i < options.length; i++) {
      const cursor = i === idx ? "> " : "  ";
      const mark = allowMultiple ? (selected.has(options[i]) ? "[x]" : "[ ]") : "";
      stdout.write(`${cursor}${mark} ${labels[i]}\n`);
    }
    rendered = true;
  };

  render();

  return await new Promise<T | T[] | Set<T>>((resolve) => {
    const onKeypress: KeypressHandler = (str, key) => {
      if (key?.name === "up") {
        idx = (idx - 1 + options.length) % options.length;
        render();
        return;
      }

      if (key?.name === "down") {
        idx = (idx + 1) % options.length;
        render();
        return;
      }

      if (key?.name === "space" || str === " ") {
        if (allowMultiple) {
          if (selected.has(options[idx])) {
            if (selected.size > minSelected) {
              selected.delete(options[idx]);
            }
          } else {
            selected.add(options[idx]);
          }
          render();
        }
        return;
      }

      if (key?.name === "return" || key?.name === "enter") {
        if (!enterArmed) {
          return;
        }

        if (allowMultiple) {
          if (selected.size < minSelected) {
            stdout.write(
              `\x1b[33m[WARN]\x1b[0m Please select at least ${minSelected} option(s).\n`
            );
            return;
          }
          stdin.off("keypress", onKeypress);
          stdin.setRawMode?.(wasRaw);
          stdin.pause?.();
          if (rendered) {
            stdout.write(`\x1b[${blockHeight}F`);
            stdout.write("\x1b[J");
          }
          resolve(new Set(selected));
        } else {
          stdin.off("keypress", onKeypress);
          stdin.setRawMode?.(wasRaw);
          stdin.pause?.();
          if (rendered) {
            stdout.write(`\x1b[${blockHeight}F`);
            stdout.write("\x1b[J");
          }
          stdout.write(`Selected: ${labels[idx]}\n`);
          resolve(options[idx]);
        }
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
}

/**
 * 选择配置作用域
 */
export async function selectScope(defaultScope: "global" | "workspace"): Promise<"global" | "workspace"> {
  const result = await selectWithArrows({
    options: ["global", "workspace"],
    labels: ["global", "workspace"],
    defaultIndex: defaultScope === "global" ? 0 : 1,
    title: "Config scope (use ↑/↓, Enter to confirm):",
  });
  return result as "global" | "workspace";
}

/**
 * 选择远端模式
 */
export async function selectRemoteMode(defaultMode: "local" | "remote"): Promise<"local" | "remote"> {
  const result = await selectWithArrows({
    options: ["local", "remote"],
    labels: ["local (no signing required)", "remote (signed writes required)"],
    defaultIndex: defaultMode === "local" ? 0 : 1,
    title: "Remote mode (use ↑/↓, Enter to confirm):",
  });
  return result as "local" | "remote";
}

/**
 * 选择工作区初始化模式
 */
export async function selectWorkspaceMode(
  defaultMode: "reuse-global" | "modify" | "new"
): Promise<"reuse-global" | "modify" | "new"> {
  const modeIndex = { "reuse-global": 0, modify: 1, new: 2 };
  const result = await selectWithArrows({
    options: ["reuse-global", "modify", "new"],
    labels: ["1) reuse global", "2) modify", "3) new"],
    defaultIndex: modeIndex[defaultMode],
    title: "Workspace init mode (use ↑/↓, Enter to confirm):",
  });
  return result as "reuse-global" | "modify" | "new";
}

/**
 * 选择要修改的配置字段
 */
export async function selectModifyFields(): Promise<Set<"mode" | "address" | "port" | "keyId" | "privateKeyFile" | "llmTools">> {
  const fields = [
    { key: "mode", label: "remote mode (local / remote)" },
    { key: "address", label: "remote registry address" },
    { key: "port", label: "remote registry port" },
    { key: "keyId", label: "default signing key id" },
    { key: "privateKeyFile", label: "default private key file path" },
    { key: "llmTools", label: "LLM tools selection" },
  ] as const;

  const result = await selectWithArrows({
    options: fields.map((f) => f.key),
    labels: fields.map((f) => f.label),
    defaultIndex: 0,
    title: "Select fields to modify (↑/↓ move, Space toggle, Enter confirm):",
    allowMultiple: true,
    minSelected: 1,
  });

  return result as Set<"mode" | "address" | "port" | "keyId" | "privateKeyFile" | "llmTools">;
}

type SkillOption = {
  skillID: string;
  version: string;
  description: string;
};

function formatSkillOptionLabel(skill: SkillOption): string {
  return `${skill.skillID}@${skill.version} - ${skill.description}`;
}

export async function selectSkillWithScroll(
  skills: SkillOption[],
  title: string
): Promise<SkillOption> {
  const stdin = process.stdin as StdinInterface;
  const stdout = process.stdout as StdoutInterface;

  if (!stdin.isTTY || !stdout.isTTY) {
    return skills[0];
  }

  const readline = await import("node:readline");
  readline.emitKeypressEvents(process.stdin);

  stdin.resume?.();
  const wasRaw = !!stdin.isRaw;
  stdin.setRawMode?.(true);

  const windowSize = 10;
  let idx = 0;
  let windowStart = 0;
  let rendered = false;
  let enterArmed = false;

  setTimeout(() => {
    enterArmed = true;
  }, 200);

  const render = () => {
    const blockHeight = Math.min(windowSize, skills.length) + 1;
    if (rendered) {
      stdout.write(`\x1b[${blockHeight}F`);
    }
    stdout.write("\x1b[J");
    stdout.write(`${title} (${idx + 1}/${skills.length})\n`);

    const windowEnd = Math.min(windowStart + windowSize, skills.length);
    for (let i = windowStart; i < windowEnd; i++) {
      const cursor = i === idx ? "> " : "  ";
      const skill = skills[i];
      stdout.write(`${cursor}${formatSkillOptionLabel(skill)}\n`);
    }
    rendered = true;
  };

  render();

  return await new Promise<SkillOption>((resolve) => {
    const onKeypress: KeypressHandler = (str, key) => {
      if (key?.name === "up") {
        if (idx > 0) {
          idx--;
          if (idx < windowStart) {
            windowStart = Math.max(0, windowStart - 1);
          }
          render();
        }
        return;
      }

      if (key?.name === "down") {
        if (idx < skills.length - 1) {
          idx++;
          if (idx >= windowStart + windowSize) {
            windowStart = Math.min(skills.length - windowSize, windowStart + 1);
          }
          render();
        }
        return;
      }

      if (key?.name === "return" || key?.name === "enter") {
        if (!enterArmed) {
          return;
        }

        stdin.off("keypress", onKeypress);
        stdin.setRawMode?.(wasRaw);
        stdin.pause?.();
        const blockHeight = Math.min(windowSize, skills.length) + 1;
        if (rendered) {
          stdout.write(`\x1b[${blockHeight}F`);
          stdout.write("\x1b[J");
        }
        stdout.write(`Selected: ${skills[idx].skillID}@${skills[idx].version}\n`);
        resolve(skills[idx]);
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
}

export async function selectSkillsWithScroll(
  skills: SkillOption[],
  title: string
): Promise<SkillOption[]> {
  const stdin = process.stdin as StdinInterface;
  const stdout = process.stdout as StdoutInterface;

  if (!stdin.isTTY || !stdout.isTTY) {
    return [skills[0]];
  }

  const readline = await import("node:readline");
  readline.emitKeypressEvents(process.stdin);

  stdin.resume?.();
  const wasRaw = !!stdin.isRaw;
  stdin.setRawMode?.(true);

  const windowSize = 10;
  let idx = 0;
  let windowStart = 0;
  let rendered = false;
  let enterArmed = false;
  const selected = new Set<number>([0]);

  setTimeout(() => {
    enterArmed = true;
  }, 200);

  const render = () => {
    const blockHeight = Math.min(windowSize, skills.length) + 1;
    if (rendered) {
      stdout.write(`\x1b[${blockHeight}F`);
    }
    stdout.write("\x1b[J");
    stdout.write(`${title} (${idx + 1}/${skills.length})\n`);

    const windowEnd = Math.min(windowStart + windowSize, skills.length);
    for (let i = windowStart; i < windowEnd; i++) {
      const cursor = i === idx ? "> " : "  ";
      const mark = selected.has(i) ? "[x]" : "[ ]";
      stdout.write(`${cursor}${mark} ${formatSkillOptionLabel(skills[i])}\n`);
    }
    rendered = true;
  };

  render();

  return await new Promise<SkillOption[]>((resolve) => {
    const cleanup = () => {
      stdin.off("keypress", onKeypress);
      stdin.setRawMode?.(wasRaw);
      stdin.pause?.();
      const blockHeight = Math.min(windowSize, skills.length) + 1;
      if (rendered) {
        stdout.write(`\x1b[${blockHeight}F`);
        stdout.write("\x1b[J");
      }
    };

    const onKeypress: KeypressHandler = (str, key) => {
      if (key?.name === "up") {
        if (idx > 0) {
          idx--;
          if (idx < windowStart) {
            windowStart = Math.max(0, windowStart - 1);
          }
          render();
        }
        return;
      }

      if (key?.name === "down") {
        if (idx < skills.length - 1) {
          idx++;
          if (idx >= windowStart + windowSize) {
            windowStart = Math.min(Math.max(skills.length - windowSize, 0), windowStart + 1);
          }
          render();
        }
        return;
      }

      if (key?.name === "space" || str === " ") {
        if (selected.has(idx)) {
          if (selected.size > 1) {
            selected.delete(idx);
          }
        } else {
          selected.add(idx);
        }
        render();
        return;
      }

      if (key?.name === "return" || key?.name === "enter") {
        if (!enterArmed) {
          return;
        }
        cleanup();
        resolve(Array.from(selected).sort((a, b) => a - b).map((index) => skills[index]));
        return;
      }

      if (key?.ctrl && key?.name === "c") {
        cleanup();
        process.exit(130);
      }
    };

    stdin.on("keypress", onKeypress);
  });
}
