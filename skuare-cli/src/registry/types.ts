import type { JsonValue, WriteAuth } from "../types";

export type RegistryWriteAuth = WriteAuth;

export type RegistryHealth = {
  status: string;
  name: string;
};

export type RegistryFile = {
  path: string;
  content: string;
  encoding?: string;
  size?: number;
};

export type RegistrySkillEntry = {
  skill_id: string;
  version: string;
  name: string;
  author: string;
  description: string;
  path: string;
  updated_at: string;
};

export type RegistrySkillOverview = {
  skill_id: string;
  author: string;
  versions: string[];
};

export type RegistrySkillDetail = RegistrySkillEntry & {
  files: RegistryFile[];
};

export type RegistryAgentsMDEntry = {
  agentsmd_id: string;
  version: string;
  id: string;
  name: string;
  author: string;
  description: string;
};

export type RegistryAgentsMDOverview = {
  agentsmd_id: string;
  versions: string[];
  ids: string[];
};

export type RegistryAgentsMDDetail = {
  agentsmd_id: string;
  version: string;
  id: string;
  content: string;
};

export type PublishSkillRequest = {
  body: JsonValue | Uint8Array;
  contentType?: string;
  auth?: RegistryWriteAuth;
};

export type PublishAgentsMDRequest = {
  agentsmdID: string;
  version: string;
  content: string;
  auth?: RegistryWriteAuth;
};

export type RegistryMigrationType = "all" | "skill" | "agentsmd";

export type RegistryMigrationRef =
  | { type: "skill"; skill_id: string; version: string }
  | { type: "agentsmd"; agentsmd_id: string; version: string };

export type RegistryMigrationBundle = {
  type: RegistryMigrationType;
  skills: RegistrySkillDetail[];
  agentsmd: RegistryAgentsMDDetail[];
};

export type RegistryImportOptions = {
  auth?: RegistryWriteAuth;
  skipExisting?: boolean;
};

export type RegistryImportResult = {
  imported: RegistryMigrationRef[];
  skipped: Array<RegistryMigrationRef & { reason: string }>;
};
