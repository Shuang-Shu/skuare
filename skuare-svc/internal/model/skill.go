package model

type CreateSkillVersionRequest struct {
	SkillID string     `json:"skill_id"`
	Version string     `json:"version"`
	Force   bool       `json:"force,omitempty"`
	Skill   SkillSpec  `json:"skill"`
	Files   []FileSpec `json:"files,omitempty"`
}

type SkillSpec struct {
	Overview    string         `json:"overview"`
	Description string         `json:"description"`
	Sections    []SkillSection `json:"sections,omitempty"`
}

type SkillSection struct {
	Title   string `json:"title"`
	Content string `json:"content"`
}

type FileSpec struct {
	Path    string `json:"path"`
	Content string `json:"content"`
}

type SkillEntry struct {
	SkillID     string `json:"skill_id"`
	Version     string `json:"version"`
	Name        string `json:"name"`
	Author      string `json:"author"`
	Description string `json:"description"`
	Path        string `json:"path"`
	UpdatedAt   string `json:"updated_at"`
}

type SkillDetail struct {
	SkillEntry
	Files []FileSpec `json:"files"`
}

type SkillOverview struct {
	SkillID  string   `json:"skill_id"`
	Author   string   `json:"author"`
	Versions []string `json:"versions"`
}

type Index struct {
	UpdatedAt string       `json:"updated_at"`
	Entries   []SkillEntry `json:"entries"`
}
