import { callApi as callHttpApi } from "../http/client";
import type { JsonValue, WriteAuth } from "../types";
import { DomainError } from "../domain/errors";
import type { RegistryBackend } from "./backend";
import type {
  PublishAgentsMDRequest,
  PublishSkillRequest,
  RegistryAgentsMDDetail,
  RegistryAgentsMDEntry,
  RegistryAgentsMDOverview,
  RegistryFile,
  RegistryHealth,
  RegistrySkillDetail,
  RegistrySkillEntry,
  RegistrySkillOverview,
} from "./types";

export class HttpRegistryBackend implements RegistryBackend {
  constructor(private readonly server: string) {}

  async health(): Promise<RegistryHealth> {
    return this.getObject("/healthz", toHealth);
  }

  async listSkills(query = ""): Promise<RegistrySkillEntry[]> {
    const path = query ? `/api/v1/skills?q=${encodeURIComponent(query)}` : "/api/v1/skills";
    return this.getItems(path, toSkillEntry);
  }

  async getSkillOverview(skillID: string): Promise<RegistrySkillOverview> {
    return this.getObject(`/api/v1/skills/${encodeURIComponent(skillID)}`, toSkillOverview);
  }

  async getSkillVersion(skillID: string, version: string): Promise<RegistrySkillDetail> {
    return this.getObject(`/api/v1/skills/${encodeURIComponent(skillID)}/${encodeURIComponent(version)}`, toSkillDetail);
  }

  async publishSkill(request: PublishSkillRequest): Promise<RegistrySkillEntry> {
    return this.postObject("/api/v1/skills", request, toSkillEntry);
  }

  async deleteSkill(skillID: string, version: string, auth?: WriteAuth): Promise<void> {
    await callHttpApi({
      method: "DELETE",
      path: `/api/v1/skills/${encodeURIComponent(skillID)}/${encodeURIComponent(version)}`,
      server: this.server,
      auth,
      silent: true,
    });
  }

  async validateSkill(skillID: string, version: string): Promise<RegistrySkillEntry> {
    return this.postObject(`/api/v1/skills/${encodeURIComponent(skillID)}/${encodeURIComponent(version)}/validate`, { body: {} }, toSkillEntry);
  }

  async listAgentsMD(query = ""): Promise<RegistryAgentsMDEntry[]> {
    const path = query ? `/api/v1/agentsmd?q=${encodeURIComponent(query)}` : "/api/v1/agentsmd";
    return this.getItems(path, toAgentsMDEntry);
  }

  async getAgentsMDOverview(agentsmdID: string): Promise<RegistryAgentsMDOverview> {
    return this.getObject(`/api/v1/agentsmd/${encodeURIComponent(agentsmdID)}`, toAgentsMDOverview);
  }

  async getAgentsMDVersion(agentsmdID: string, version: string): Promise<RegistryAgentsMDDetail> {
    return this.getObject(`/api/v1/agentsmd/${encodeURIComponent(agentsmdID)}/${encodeURIComponent(version)}`, toAgentsMDDetail);
  }

  async publishAgentsMD(request: PublishAgentsMDRequest): Promise<RegistryAgentsMDEntry> {
    return this.postObject("/api/v1/agentsmd", {
      body: {
        agentsmd_id: request.agentsmdID,
        version: request.version,
        content: request.content,
      },
      auth: request.auth,
    }, toAgentsMDEntry);
  }

  async deleteAgentsMD(agentsmdID: string, version: string, auth?: WriteAuth): Promise<void> {
    await callHttpApi({
      method: "DELETE",
      path: `/api/v1/agentsmd/${encodeURIComponent(agentsmdID)}/${encodeURIComponent(version)}`,
      server: this.server,
      auth,
      silent: true,
    });
  }

  private async getObject<T>(path: string, map: (value: Record<string, JsonValue>) => T): Promise<T> {
    const resp = await callHttpApi({ method: "GET", path, server: this.server, silent: true });
    return map(asObject(resp.data, path));
  }

  private async postObject<T>(
    path: string,
    request: { body: JsonValue | Uint8Array; contentType?: string; auth?: WriteAuth },
    map: (value: Record<string, JsonValue>) => T
  ): Promise<T> {
    const resp = await callHttpApi({
      method: "POST",
      path,
      body: request.body,
      contentType: request.contentType,
      auth: request.auth,
      server: this.server,
      silent: true,
    });
    return map(asObject(resp.data, path));
  }

  private async getItems<T>(path: string, map: (value: Record<string, JsonValue>) => T): Promise<T[]> {
    const resp = await callHttpApi({ method: "GET", path, server: this.server, silent: true });
    const row = asObject(resp.data, path);
    const items = row.items;
    if (!Array.isArray(items)) {
      return [];
    }
    return items
      .filter((item): item is Record<string, JsonValue> => !!item && typeof item === "object" && !Array.isArray(item))
      .map(map);
  }
}

function asObject(data: JsonValue | string | null, label: string): Record<string, JsonValue> {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new DomainError("CLI_OPERATION_FAILED", `Invalid registry response for ${label}`);
  }
  return data as Record<string, JsonValue>;
}

function toHealth(row: Record<string, JsonValue>): RegistryHealth {
  return {
    status: String(row.status || ""),
    name: String(row.name || ""),
  };
}

function toSkillEntry(row: Record<string, JsonValue>): RegistrySkillEntry {
  return {
    skill_id: String(row.skill_id || ""),
    version: String(row.version || ""),
    name: String(row.name || ""),
    author: String(row.author || ""),
    description: String(row.description || ""),
    path: String(row.path || ""),
    updated_at: String(row.updated_at || ""),
  };
}

function toSkillOverview(row: Record<string, JsonValue>): RegistrySkillOverview {
  return {
    skill_id: String(row.skill_id || ""),
    author: String(row.author || ""),
    versions: Array.isArray(row.versions) ? row.versions.map((value) => String(value)).filter(Boolean) : [],
  };
}

function toRegistryFile(row: Record<string, JsonValue>): RegistryFile {
  return {
    path: String(row.path || ""),
    content: String(row.content || ""),
    encoding: row.encoding === undefined ? undefined : String(row.encoding || ""),
    size: typeof row.size === "number" ? row.size : undefined,
  };
}

function toSkillDetail(row: Record<string, JsonValue>): RegistrySkillDetail {
  const files = Array.isArray(row.files)
    ? row.files
      .filter((item): item is Record<string, JsonValue> => !!item && typeof item === "object" && !Array.isArray(item))
      .map(toRegistryFile)
    : [];
  return {
    ...toSkillEntry(row),
    files,
  };
}

function toAgentsMDEntry(row: Record<string, JsonValue>): RegistryAgentsMDEntry {
  return {
    agentsmd_id: String(row.agentsmd_id || ""),
    version: String(row.version || ""),
    id: String(row.id || ""),
    name: String(row.name || ""),
    author: String(row.author || ""),
    description: String(row.description || ""),
  };
}

function toAgentsMDOverview(row: Record<string, JsonValue>): RegistryAgentsMDOverview {
  return {
    agentsmd_id: String(row.agentsmd_id || ""),
    versions: Array.isArray(row.versions) ? row.versions.map((value) => String(value)).filter(Boolean) : [],
    ids: Array.isArray(row.ids) ? row.ids.map((value) => String(value)).filter(Boolean) : [],
  };
}

function toAgentsMDDetail(row: Record<string, JsonValue>): RegistryAgentsMDDetail {
  return {
    agentsmd_id: String(row.agentsmd_id || ""),
    version: String(row.version || ""),
    id: String(row.id || ""),
    content: String(row.content || ""),
  };
}
