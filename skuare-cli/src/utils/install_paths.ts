import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import { DomainError } from "../domain/errors";

export function resolvePrimaryTool(llmTools: string[]): string {
  const tool = (llmTools || []).map((value) => value.trim()).find(Boolean);
  if (!tool) {
    throw new DomainError("CLI_OPERATION_FAILED", "No llmTools configured. Run `skr init` and select at least one tool");
  }
  return tool;
}

export function resolveToolHomeDir(cwd: string, tool: string, isGlobal: boolean): string {
  return isGlobal ? join(homedir(), `.${tool}`) : join(cwd, `.${tool}`);
}

function isExplicitPath(input: string): boolean {
  return input === "~" || input.startsWith("~/") || isAbsolute(input);
}

export function resolveInstallTargetRoot(cwd: string, tool: string, isGlobal: boolean, configured?: string): string {
  const raw = String(configured || "").trim();
  if (raw) {
    if (!isGlobal) {
      return raw === "~" ? homedir() : raw.startsWith("~/") ? join(homedir(), raw.slice(2)) : isAbsolute(raw) ? raw : join(cwd, raw);
    }
    if (isExplicitPath(raw)) {
      return raw === "~" ? homedir() : raw.startsWith("~/") ? join(homedir(), raw.slice(2)) : raw;
    }
  }
  return join(resolveToolHomeDir(cwd, tool, isGlobal), "skills");
}
