package model

// CreateAgentsMDRequest 创建 AGENTS.md 请求
type CreateAgentsMDRequest struct {
	AgentsMDID string `json:"agentsmd_id"`
	Version    string `json:"version"`
	Content    string `json:"content"`
}

// AgentsMDEntry AGENTS.md 条目
type AgentsMDEntry struct {
	AgentsMDID string `json:"agentsmd_id"`
	Version    string `json:"version"`
	ID         string `json:"id"` // <agentsmd-id>@<version>
}

// AgentsMDDetail AGENTS.md 详情
type AgentsMDDetail struct {
	AgentsMDID string `json:"agentsmd_id"`
	Version    string `json:"version"`
	ID         string `json:"id"`
	Content    string `json:"content"`
}

// AgentsMDOverview AGENTS.md 概览（所有版本）
type AgentsMDOverview struct {
	AgentsMDID string   `json:"agentsmd_id"`
	Versions   []string `json:"versions"`
	IDs        []string `json:"ids"`
}
