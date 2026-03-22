package model

type MigrateResourceType string

const (
	MigrateResourceTypeAll      MigrateResourceType = "all"
	MigrateResourceTypeSkill    MigrateResourceType = "skill"
	MigrateResourceTypeAgentsMD MigrateResourceType = "agentsmd"
)

type MigrateRef struct {
	Type       string `json:"type"`
	SkillID    string `json:"skill_id,omitempty"`
	AgentsMDID string `json:"agentsmd_id,omitempty"`
	Version    string `json:"version"`
}

type MigrateSkippedRef struct {
	MigrateRef
	Reason string `json:"reason"`
}

type MigrateBundle struct {
	Type     MigrateResourceType `json:"type"`
	Skills   []SkillDetail       `json:"skills,omitempty"`
	AgentsMD []AgentsMDDetail    `json:"agentsmd,omitempty"`
}

type ImportMigrateRequest struct {
	Type         MigrateResourceType `json:"type"`
	Skills       []SkillDetail       `json:"skills,omitempty"`
	AgentsMD     []AgentsMDDetail    `json:"agentsmd,omitempty"`
	SkipExisting bool                `json:"skip_existing,omitempty"`
}

type ImportMigrateResult struct {
	Imported []MigrateRef        `json:"imported"`
	Skipped  []MigrateSkippedRef `json:"skipped"`
}
