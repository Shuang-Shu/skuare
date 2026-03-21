import type {
  PublishAgentsMDRequest,
  PublishSkillRequest,
  RegistryAgentsMDDetail,
  RegistryAgentsMDEntry,
  RegistryAgentsMDOverview,
  RegistryHealth,
  RegistrySkillDetail,
  RegistrySkillEntry,
  RegistrySkillOverview,
  RegistryWriteAuth,
} from "./types";

export interface RegistryBackend {
  health(): Promise<RegistryHealth>;

  listSkills(query?: string): Promise<RegistrySkillEntry[]>;
  getSkillOverview(skillID: string): Promise<RegistrySkillOverview>;
  getSkillVersion(skillID: string, version: string): Promise<RegistrySkillDetail>;
  publishSkill(request: PublishSkillRequest): Promise<RegistrySkillEntry>;
  deleteSkill(skillID: string, version: string, auth?: RegistryWriteAuth): Promise<void>;
  validateSkill(skillID: string, version: string): Promise<RegistrySkillEntry>;

  listAgentsMD(query?: string): Promise<RegistryAgentsMDEntry[]>;
  getAgentsMDOverview(agentsmdID: string): Promise<RegistryAgentsMDOverview>;
  getAgentsMDVersion(agentsmdID: string, version: string): Promise<RegistryAgentsMDDetail>;
  publishAgentsMD(request: PublishAgentsMDRequest): Promise<RegistryAgentsMDEntry>;
  deleteAgentsMD(agentsmdID: string, version: string, auth?: RegistryWriteAuth): Promise<void>;
}
