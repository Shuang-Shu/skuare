import { homedir } from "node:os";
import { join } from "node:path";
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

export function resolveInstallTargetRoot(cwd: string, tool: string, isGlobal: boolean): string {
  return join(resolveToolHomeDir(cwd, tool, isGlobal), "skills");
}
