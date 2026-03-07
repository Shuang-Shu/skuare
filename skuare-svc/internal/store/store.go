package store

import "skuare-svc/internal/model"

// Store defines skill persistence operations.
// Future implementations may target distributed filesystems or object stores.
type Store interface {
	Create(req model.CreateSkillVersionRequest) (model.SkillEntry, error)
	List(query string) ([]model.SkillEntry, error)
	GetSkill(skillID string) (model.SkillOverview, error)
	GetVersion(skillID string, version string) (model.SkillDetail, error)
	Delete(skillID string, version string) error
	Validate(skillID string, version string) (model.SkillEntry, error)
	Reindex() (int, error)

	// AgentsMD operations
	CreateAgentsMD(req model.CreateAgentsMDRequest) (model.AgentsMDEntry, error)
	ListAgentsMD(query string) ([]model.AgentsMDEntry, error)
	GetAgentsMD(agentsmdID string) (model.AgentsMDOverview, error)
	GetAgentsMDVersion(agentsmdID string, version string) (model.AgentsMDDetail, error)
	DeleteAgentsMD(agentsmdID string, version string) error
}
