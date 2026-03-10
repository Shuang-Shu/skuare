package store

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"syscall"
	"time"

	"skuare-svc/internal/config"
	"skuare-svc/internal/model"
	"skuare-svc/internal/validator"
)

var (
	ErrAlreadyExists = errors.New("skill version already exists")
	ErrNotFound      = errors.New("skill/version not found")
)

const anonymousSkillAuthorDir = "_anonymous"

type FSStore struct {
	specDir string
	fs      FileSystem
}

var _ Store = (*FSStore)(nil)

func NewFSStore(specDir string) (*FSStore, error) {
	return NewFSStoreWithFS(specDir, OSFileSystem{})
}

func NewFSStoreWithFS(specDir string, fileSystem FileSystem) (*FSStore, error) {
	if fileSystem == nil {
		fileSystem = OSFileSystem{}
	}
	s := &FSStore{specDir: specDir, fs: fileSystem}
	if err := s.fs.MkdirAll(s.systemDir(), 0o755); err != nil {
		return nil, err
	}
	if err := s.fs.MkdirAll(s.lockDir(), 0o755); err != nil {
		return nil, err
	}
	if _, err := s.fs.Stat(s.indexPath()); errors.Is(err, os.ErrNotExist) {
		if err := s.writeIndex(model.Index{UpdatedAt: time.Now().UTC().Format(time.RFC3339), Entries: nil}); err != nil {
			return nil, err
		}
	}
	return s, nil
}

func (s *FSStore) Create(req model.CreateSkillVersionRequest) (model.SkillEntry, error) {
	if err := validator.ValidateSkillID(req.SkillID); err != nil {
		return model.SkillEntry{}, err
	}
	if err := validator.ValidateVersion(req.Version); err != nil {
		return model.SkillEntry{}, err
	}
	uploadedSkillMD := ""
	for _, f := range req.Files {
		if err := validator.ValidateRelativeFilePath(f.Path); err != nil {
			return model.SkillEntry{}, err
		}
		if filepath.Clean(f.Path) == "SKILL.md" {
			uploadedSkillMD = f.Content
		}
	}

	skillMD := uploadedSkillMD
	if skillMD == "" {
		if err := validator.ValidateSkillSpec(req.Skill); err != nil {
			return model.SkillEntry{}, err
		}
		skillMD = validator.RenderSkillMD(req.SkillID, req.Skill)
	}

	name, desc, author, err := validator.ValidateSkillMD(req.SkillID, skillMD)
	if err != nil {
		return model.SkillEntry{}, err
	}
	authorDir, err := resolveSkillAuthorDir(author)
	if err != nil {
		return model.SkillEntry{}, err
	}

	unlock, err := s.lockSkill(req.SkillID)
	if err != nil {
		return model.SkillEntry{}, err
	}
	defer unlock()

	targetDir := s.versionDir(authorDir, req.SkillID, req.Version)
	existingDir, err := s.findSkillVersionDir(req.SkillID, req.Version)
	if err != nil && !errors.Is(err, ErrNotFound) {
		return model.SkillEntry{}, err
	}
	targetExists := existingDir != ""
	if targetExists && !req.Force {
		return model.SkillEntry{}, ErrAlreadyExists
	}

	skillDir := filepath.Dir(targetDir)
	if err := s.fs.MkdirAll(skillDir, 0o755); err != nil {
		return model.SkillEntry{}, err
	}

	tmpDir := filepath.Join(skillDir, req.Version+".tmp-"+fmt.Sprintf("%d", time.Now().UnixNano()))
	if err := s.fs.MkdirAll(tmpDir, 0o755); err != nil {
		return model.SkillEntry{}, err
	}
	cleanup := true
	defer func() {
		if cleanup {
			_ = s.fs.RemoveAll(tmpDir)
		}
	}()

	if err := s.writeFile(filepath.Join(tmpDir, "SKILL.md"), skillMD); err != nil {
		return model.SkillEntry{}, err
	}
	for _, f := range req.Files {
		cleanPath := filepath.Clean(f.Path)
		if cleanPath == "SKILL.md" {
			continue
		}
		if err := s.writeFile(filepath.Join(tmpDir, cleanPath), f.Content); err != nil {
			return model.SkillEntry{}, err
		}
	}

	backupDir := ""
	if targetExists {
		backupDir = filepath.Join(filepath.Dir(existingDir), req.Version+".bak-"+fmt.Sprintf("%d", time.Now().UnixNano()))
		if err := s.fs.Rename(existingDir, backupDir); err != nil {
			return model.SkillEntry{}, err
		}
	}

	if err := s.fs.Rename(tmpDir, targetDir); err != nil {
		if backupDir != "" {
			_ = s.fs.Rename(backupDir, existingDir)
		}
		return model.SkillEntry{}, err
	}
	cleanup = false
	if backupDir != "" {
		if err := s.fs.RemoveAll(backupDir); err != nil {
			return model.SkillEntry{}, err
		}
		s.cleanupEmptyParents(existingDir, s.specDir)
	}

	entry := model.SkillEntry{
		SkillID:     req.SkillID,
		Version:     req.Version,
		Name:        name,
		Author:      author,
		Description: desc,
		Path:        targetDir,
		UpdatedAt:   time.Now().UTC().Format(time.RFC3339),
	}
	if err := s.upsertIndex(entry); err != nil {
		return model.SkillEntry{}, err
	}
	return entry, nil
}

func (s *FSStore) List(query string) ([]model.SkillEntry, error) {
	idx, err := s.readIndex()
	if err != nil {
		return nil, err
	}
	query = strings.ToLower(strings.TrimSpace(query))
	out := make([]model.SkillEntry, 0, len(idx.Entries))
	for _, e := range idx.Entries {
		if query == "" || strings.Contains(strings.ToLower(e.SkillID), query) || strings.Contains(strings.ToLower(e.Name), query) || strings.Contains(strings.ToLower(e.Description), query) {
			out = append(out, e)
		}
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].SkillID == out[j].SkillID {
			return out[i].Version < out[j].Version
		}
		return out[i].SkillID < out[j].SkillID
	})
	return out, nil
}

func (s *FSStore) GetSkill(skillID string) (model.SkillOverview, error) {
	if err := validator.ValidateSkillID(skillID); err != nil {
		return model.SkillOverview{}, err
	}
	entries, err := s.List("")
	if err != nil {
		return model.SkillOverview{}, err
	}
	versions := make([]string, 0)
	for _, e := range entries {
		if e.SkillID == skillID {
			versions = append(versions, e.Version)
		}
	}
	if len(versions) == 0 {
		return model.SkillOverview{}, ErrNotFound
	}
	sort.Strings(versions)
	author := ""
	for _, e := range entries {
		if e.SkillID == skillID && strings.TrimSpace(e.Author) != "" {
			author = e.Author
		}
	}
	return model.SkillOverview{SkillID: skillID, Author: author, Versions: versions}, nil
}

func (s *FSStore) GetVersion(skillID string, version string) (model.SkillDetail, error) {
	if err := validator.ValidateSkillID(skillID); err != nil {
		return model.SkillDetail{}, err
	}
	if err := validator.ValidateVersion(version); err != nil {
		return model.SkillDetail{}, err
	}
	entries, err := s.List("")
	if err != nil {
		return model.SkillDetail{}, err
	}

	var entry model.SkillEntry
	found := false
	for _, e := range entries {
		if e.SkillID == skillID && e.Version == version {
			entry = e
			found = true
			break
		}
	}
	if !found {
		return model.SkillDetail{}, ErrNotFound
	}

	versionDir := entry.Path
	if versionDir == "" {
		var err error
		versionDir, err = s.findSkillVersionDir(skillID, version)
		if err != nil {
			return model.SkillDetail{}, err
		}
	}
	files, err := s.listFiles(versionDir)
	if err != nil {
		return model.SkillDetail{}, err
	}

	return model.SkillDetail{
		SkillEntry: entry,
		Files:      files,
	}, nil
}

func (s *FSStore) Delete(skillID string, version string) error {
	if err := validator.ValidateSkillID(skillID); err != nil {
		return err
	}
	if err := validator.ValidateVersion(version); err != nil {
		return err
	}

	unlock, err := s.lockSkill(skillID)
	if err != nil {
		return err
	}
	defer unlock()

	versionDir, err := s.findSkillVersionDir(skillID, version)
	if err != nil {
		return err
	}
	if err := s.removeVersionDir(versionDir); err != nil {
		return err
	}

	if err := s.deleteIndexEntry(skillID, version); err != nil {
		return err
	}

	s.cleanupEmptyParents(versionDir, s.specDir)
	return nil
}

func (s *FSStore) Validate(skillID string, version string) (model.SkillEntry, error) {
	if err := validator.ValidateSkillID(skillID); err != nil {
		return model.SkillEntry{}, err
	}
	if err := validator.ValidateVersion(version); err != nil {
		return model.SkillEntry{}, err
	}
	versionDir, err := s.findSkillVersionDir(skillID, version)
	if err != nil {
		return model.SkillEntry{}, err
	}
	return s.validateVersionDir(skillID, version, versionDir)
}

func (s *FSStore) validateVersionDir(skillID string, version string, versionDir string) (model.SkillEntry, error) {
	skillMDPath := filepath.Join(versionDir, "SKILL.md")
	b, err := s.fs.ReadFile(skillMDPath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return model.SkillEntry{}, ErrNotFound
		}
		return model.SkillEntry{}, err
	}
	name, desc, author, err := validator.ValidateSkillMD(skillID, string(b))
	if err != nil {
		return model.SkillEntry{}, err
	}
	entry := model.SkillEntry{
		SkillID:     skillID,
		Version:     version,
		Name:        name,
		Author:      author,
		Description: desc,
		Path:        versionDir,
		UpdatedAt:   time.Now().UTC().Format(time.RFC3339),
	}
	return entry, nil
}

func (s *FSStore) Reindex() (int, error) {
	entries := make([]model.SkillEntry, 0)
	authorDirs, err := s.fs.ReadDir(s.specDir)
	if err != nil {
		return 0, err
	}
	for _, ad := range authorDirs {
		if !ad.IsDir() || strings.HasPrefix(ad.Name(), ".") || ad.Name() == "agentsmd" {
			continue
		}
		skillDirs, err := s.fs.ReadDir(filepath.Join(s.specDir, ad.Name()))
		if err != nil {
			continue
		}
		for _, sd := range skillDirs {
			if !sd.IsDir() {
				continue
			}
			skillID := sd.Name()
			if err := validator.ValidateSkillID(skillID); err != nil {
				continue
			}
			versions, err := s.fs.ReadDir(filepath.Join(s.specDir, ad.Name(), skillID))
			if err != nil {
				continue
			}
			for _, vd := range versions {
				if !vd.IsDir() || strings.Contains(vd.Name(), ".tmp-") || strings.Contains(vd.Name(), ".bak-") {
					continue
				}
				if err := validator.ValidateVersion(vd.Name()); err != nil {
					continue
				}
				entry, err := s.validateVersionDir(skillID, vd.Name(), filepath.Join(s.specDir, ad.Name(), skillID, vd.Name()))
				if err == nil {
					entries = append(entries, entry)
				}
			}
		}
	}
	idx := model.Index{UpdatedAt: time.Now().UTC().Format(time.RFC3339), Entries: entries}
	if err := s.writeIndex(idx); err != nil {
		return 0, err
	}
	return len(entries), nil
}

func (s *FSStore) versionDir(authorDir string, skillID string, version string) string {
	return filepath.Join(s.specDir, authorDir, skillID, version)
}

func (s *FSStore) systemDir() string {
	return filepath.Join(s.specDir, config.SystemDirName)
}

func (s *FSStore) agentsmdDir() string {
	return filepath.Join(s.specDir, "agentsmd")
}

func (s *FSStore) lockDir() string {
	return filepath.Join(s.systemDir(), "locks")
}

func (s *FSStore) indexPath() string {
	return filepath.Join(s.systemDir(), "index.json")
}

func (s *FSStore) writeFile(path string, content string) error {
	if err := s.fs.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	return s.fs.WriteFile(path, []byte(content), 0o644)
}

func (s *FSStore) lockSkill(skillID string) (func(), error) {
	lockPath := filepath.Join(s.lockDir(), skillID+".lock")
	f, err := s.fs.OpenFile(lockPath, os.O_CREATE|os.O_RDWR, 0o644)
	if err != nil {
		return nil, err
	}
	if err := syscall.Flock(int(f.Fd()), syscall.LOCK_EX); err != nil {
		_ = f.Close()
		return nil, err
	}
	return func() {
		_ = syscall.Flock(int(f.Fd()), syscall.LOCK_UN)
		_ = f.Close()
	}, nil
}

func (s *FSStore) readIndex() (model.Index, error) {
	b, err := s.fs.ReadFile(s.indexPath())
	if err != nil {
		return model.Index{}, err
	}
	if len(strings.TrimSpace(string(b))) == 0 {
		return model.Index{}, nil
	}
	idx := model.Index{}
	if err := json.Unmarshal(b, &idx); err != nil {
		return model.Index{}, err
	}
	return idx, nil
}

func (s *FSStore) writeIndex(idx model.Index) error {
	b, err := json.MarshalIndent(idx, "", "  ")
	if err != nil {
		return err
	}
	tmp := s.indexPath() + ".tmp"
	if err := s.fs.WriteFile(tmp, b, 0o644); err != nil {
		return err
	}
	return s.fs.Rename(tmp, s.indexPath())
}

func (s *FSStore) upsertIndex(entry model.SkillEntry) error {
	idx, err := s.readIndex()
	if err != nil {
		return err
	}
	idx.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	updated := false
	for i := range idx.Entries {
		if idx.Entries[i].SkillID == entry.SkillID && idx.Entries[i].Version == entry.Version {
			idx.Entries[i] = entry
			updated = true
			break
		}
	}
	if !updated {
		idx.Entries = append(idx.Entries, entry)
	}
	return s.writeIndex(idx)
}

func (s *FSStore) deleteIndexEntry(skillID string, version string) error {
	idx, err := s.readIndex()
	if err != nil {
		return err
	}
	idx.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	entries := make([]model.SkillEntry, 0, len(idx.Entries))
	for _, e := range idx.Entries {
		if !(e.SkillID == skillID && e.Version == version) {
			entries = append(entries, e)
		}
	}
	idx.Entries = entries
	return s.writeIndex(idx)
}

func (s *FSStore) isDirEmpty(path string) (bool, error) {
	entries, err := s.fs.ReadDir(path)
	if err != nil {
		return false, err
	}
	return len(entries) == 0, nil
}

// CreateAgentsMD creates a new AGENTS.md version
func (s *FSStore) CreateAgentsMD(req model.CreateAgentsMDRequest) (model.AgentsMDEntry, error) {
	if err := validator.ValidateSkillID(req.AgentsMDID); err != nil {
		return model.AgentsMDEntry{}, err
	}
	if err := validator.ValidateVersion(req.Version); err != nil {
		return model.AgentsMDEntry{}, err
	}

	versionDir := filepath.Join(s.agentsmdDir(), req.AgentsMDID, req.Version)
	if _, err := s.fs.Stat(versionDir); err == nil {
		return model.AgentsMDEntry{}, ErrAlreadyExists
	}

	if err := s.fs.MkdirAll(versionDir, 0o755); err != nil {
		return model.AgentsMDEntry{}, err
	}

	agentsmdPath := filepath.Join(versionDir, "AGENTS.md")
	if err := s.fs.WriteFile(agentsmdPath, []byte(req.Content), 0o644); err != nil {
		return model.AgentsMDEntry{}, err
	}

	metaPath := filepath.Join(versionDir, "meta.json")
	meta := map[string]string{
		"agentsmd_id": req.AgentsMDID,
		"version":     req.Version,
	}
	metaBytes, _ := json.MarshalIndent(meta, "", "  ")
	if err := s.fs.WriteFile(metaPath, metaBytes, 0o644); err != nil {
		return model.AgentsMDEntry{}, err
	}

	return model.AgentsMDEntry{
		AgentsMDID:  req.AgentsMDID,
		Version:     req.Version,
		ID:          fmt.Sprintf("%s@%s", req.AgentsMDID, req.Version),
		Name:        req.AgentsMDID,
		Author:      "undefined",
		Description: "",
	}, nil
}

// ListAgentsMD lists all AGENTS.md entries
func (s *FSStore) ListAgentsMD(query string) ([]model.AgentsMDEntry, error) {
	agentsmdRoot := s.agentsmdDir()
	if _, err := s.fs.Stat(agentsmdRoot); errors.Is(err, os.ErrNotExist) {
		return []model.AgentsMDEntry{}, nil
	}

	entries := []model.AgentsMDEntry{}
	agentsmdIDs, err := s.fs.ReadDir(agentsmdRoot)
	if err != nil {
		return nil, err
	}

	query = strings.ToLower(strings.TrimSpace(query))
	for _, idEntry := range agentsmdIDs {
		if !idEntry.IsDir() {
			continue
		}
		agentsmdID := idEntry.Name()
		if query != "" && !strings.Contains(strings.ToLower(agentsmdID), query) {
			continue
		}

		versionsDir := filepath.Join(agentsmdRoot, agentsmdID)
		versions, err := s.fs.ReadDir(versionsDir)
		if err != nil {
			continue
		}

		for _, vEntry := range versions {
			if !vEntry.IsDir() {
				continue
			}
			version := vEntry.Name()
			entries = append(entries, model.AgentsMDEntry{
				AgentsMDID:  agentsmdID,
				Version:     version,
				ID:          fmt.Sprintf("%s@%s", agentsmdID, version),
				Name:        agentsmdID,
				Author:      "undefined",
				Description: "",
			})
		}
	}

	sort.Slice(entries, func(i, j int) bool {
		if entries[i].AgentsMDID == entries[j].AgentsMDID {
			return entries[i].Version < entries[j].Version
		}
		return entries[i].AgentsMDID < entries[j].AgentsMDID
	})

	return entries, nil
}

// GetAgentsMD gets all versions of an AGENTS.md
func (s *FSStore) GetAgentsMD(agentsmdID string) (model.AgentsMDOverview, error) {
	if err := validator.ValidateSkillID(agentsmdID); err != nil {
		return model.AgentsMDOverview{}, err
	}

	entries, err := s.ListAgentsMD("")
	if err != nil {
		return model.AgentsMDOverview{}, err
	}

	versions := []string{}
	ids := []string{}
	for _, e := range entries {
		if e.AgentsMDID == agentsmdID {
			versions = append(versions, e.Version)
			ids = append(ids, e.ID)
		}
	}

	if len(versions) == 0 {
		return model.AgentsMDOverview{}, ErrNotFound
	}

	sort.Strings(versions)
	return model.AgentsMDOverview{
		AgentsMDID: agentsmdID,
		Versions:   versions,
		IDs:        ids,
	}, nil
}

// GetAgentsMDVersion gets a specific version of AGENTS.md
func (s *FSStore) GetAgentsMDVersion(agentsmdID string, version string) (model.AgentsMDDetail, error) {
	if err := validator.ValidateSkillID(agentsmdID); err != nil {
		return model.AgentsMDDetail{}, err
	}
	if err := validator.ValidateVersion(version); err != nil {
		return model.AgentsMDDetail{}, err
	}

	versionDir := filepath.Join(s.agentsmdDir(), agentsmdID, version)
	if err := s.ensureVersionDir(versionDir); err != nil {
		return model.AgentsMDDetail{}, err
	}

	agentsmdPath := filepath.Join(versionDir, "AGENTS.md")
	content, err := s.readTextFile(agentsmdPath)
	if err != nil {
		return model.AgentsMDDetail{}, err
	}

	return model.AgentsMDDetail{
		AgentsMDID: agentsmdID,
		Version:    version,
		ID:         fmt.Sprintf("%s@%s", agentsmdID, version),
		Content:    content,
	}, nil
}

// DeleteAgentsMD deletes a specific version of AGENTS.md
func (s *FSStore) DeleteAgentsMD(agentsmdID string, version string) error {
	if err := validator.ValidateSkillID(agentsmdID); err != nil {
		return err
	}
	if err := validator.ValidateVersion(version); err != nil {
		return err
	}

	versionDir := filepath.Join(s.agentsmdDir(), agentsmdID, version)
	if err := s.removeVersionDir(versionDir); err != nil {
		return err
	}

	s.cleanupEmptyParents(versionDir, s.agentsmdDir())
	return nil
}

func (s *FSStore) ensureVersionDir(versionDir string) error {
	if _, err := s.fs.Stat(versionDir); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return ErrNotFound
		}
		return err
	}
	return nil
}

func (s *FSStore) removeVersionDir(versionDir string) error {
	if err := s.ensureVersionDir(versionDir); err != nil {
		return err
	}
	return s.fs.RemoveAll(versionDir)
}

func (s *FSStore) cleanupEmptyParents(versionDir string, stopDir string) {
	stopDir = filepath.Clean(stopDir)
	for parent := filepath.Dir(versionDir); parent != stopDir && parent != "." && parent != string(filepath.Separator); parent = filepath.Dir(parent) {
		empty, err := s.isDirEmpty(parent)
		if err != nil || !empty {
			return
		}
		if err := s.fs.Remove(parent); err != nil {
			return
		}
	}
}

func (s *FSStore) listFiles(versionDir string) ([]model.FileSpec, error) {
	if err := s.ensureVersionDir(versionDir); err != nil {
		return nil, err
	}
	files := make([]model.FileSpec, 0)
	_ = s.fs.WalkDir(versionDir, func(path string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return nil
		}
		rel, relErr := filepath.Rel(versionDir, path)
		if relErr != nil {
			return nil
		}
		content, readErr := s.readTextFile(path)
		if readErr != nil {
			return nil
		}
		files = append(files, model.FileSpec{
			Path:    filepath.ToSlash(rel),
			Content: content,
		})
		return nil
	})
	sort.Slice(files, func(i, j int) bool {
		return files[i].Path < files[j].Path
	})
	return files, nil
}

func (s *FSStore) readTextFile(path string) (string, error) {
	b, err := s.fs.ReadFile(path)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

func (s *FSStore) findSkillVersionDir(skillID string, version string) (string, error) {
	authorDirs, err := s.fs.ReadDir(s.specDir)
	if err != nil {
		return "", err
	}
	for _, ad := range authorDirs {
		if !ad.IsDir() || strings.HasPrefix(ad.Name(), ".") || ad.Name() == "agentsmd" {
			continue
		}
		versionDir := filepath.Join(s.specDir, ad.Name(), skillID, version)
		if _, err := s.fs.Stat(versionDir); err == nil {
			return versionDir, nil
		} else if !errors.Is(err, os.ErrNotExist) {
			return "", err
		}
	}
	return "", ErrNotFound
}

func resolveSkillAuthorDir(author string) (string, error) {
	author = strings.TrimSpace(author)
	if author == "" {
		return anonymousSkillAuthorDir, nil
	}
	if author == "." || author == ".." || strings.Contains(author, "/") || strings.Contains(author, `\`) {
		return "", errors.New("invalid metadata.author: must be a single path segment")
	}
	return author, nil
}
