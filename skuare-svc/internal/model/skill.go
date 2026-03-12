package model

type CreateSkillVersionRequest struct {
	SkillID string     `json:"skill_id"`
	Version string     `json:"version"`
	Force   bool       `json:"force,omitempty"`
	Skill   SkillSpec  `json:"skill"`
	Files   []FileSpec `json:"files,omitempty"`
}

type CreateSkillUploadRequest struct {
	SkillID string
	Version string
	Force   bool
	Skill   SkillSpec
	Files   []UploadedFile
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
	Path     string `json:"path"`
	Content  string `json:"content"`
	Encoding string `json:"encoding,omitempty"`
	Size     int64  `json:"size,omitempty"`
}

type UploadedFile struct {
	Path    string
	Content []byte
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

func (req CreateSkillVersionRequest) ToUploadRequest() CreateSkillUploadRequest {
	files := make([]UploadedFile, 0, len(req.Files))
	for _, file := range req.Files {
		files = append(files, UploadedFile{
			Path:    file.Path,
			Content: []byte(file.Content),
		})
	}
	return CreateSkillUploadRequest{
		SkillID: req.SkillID,
		Version: req.Version,
		Force:   req.Force,
		Skill:   req.Skill,
		Files:   files,
	}
}
