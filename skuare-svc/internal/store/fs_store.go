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

type FSStore struct {
	specDir string
}

func NewFSStore(specDir string) (*FSStore, error) {
	s := &FSStore{specDir: specDir}
	if err := os.MkdirAll(s.systemDir(), 0o755); err != nil {
		return nil, err
	}
	if err := os.MkdirAll(s.lockDir(), 0o755); err != nil {
		return nil, err
	}
	if _, err := os.Stat(s.indexPath()); errors.Is(err, os.ErrNotExist) {
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
	if err := validator.ValidateSkillSpec(req.Skill); err != nil {
		return model.SkillEntry{}, err
	}
	skillMD := validator.RenderSkillMD(req.SkillID, req.Skill)
	name, desc, err := validator.ValidateSkillMD(req.SkillID, skillMD)
	if err != nil {
		return model.SkillEntry{}, err
	}

	unlock, err := s.lockSkill(req.SkillID)
	if err != nil {
		return model.SkillEntry{}, err
	}
	defer unlock()

	targetDir := s.versionDir(req.SkillID, req.Version)
	if _, err := os.Stat(targetDir); err == nil {
		return model.SkillEntry{}, ErrAlreadyExists
	}

	skillDir := filepath.Dir(targetDir)
	if err := os.MkdirAll(skillDir, 0o755); err != nil {
		return model.SkillEntry{}, err
	}

	tmpDir := filepath.Join(skillDir, req.Version+".tmp-"+fmt.Sprintf("%d", time.Now().UnixNano()))
	if err := os.MkdirAll(tmpDir, 0o755); err != nil {
		return model.SkillEntry{}, err
	}
	cleanup := true
	defer func() {
		if cleanup {
			_ = os.RemoveAll(tmpDir)
		}
	}()

	if err := s.writeFile(filepath.Join(tmpDir, "SKILL.md"), skillMD); err != nil {
		return model.SkillEntry{}, err
	}
	for _, f := range req.Files {
		if err := validator.ValidateRelativeFilePath(f.Path); err != nil {
			return model.SkillEntry{}, err
		}
		if err := s.writeFile(filepath.Join(tmpDir, filepath.Clean(f.Path)), f.Content); err != nil {
			return model.SkillEntry{}, err
		}
	}

	if err := os.Rename(tmpDir, targetDir); err != nil {
		return model.SkillEntry{}, err
	}
	cleanup = false

	entry := model.SkillEntry{
		SkillID:     req.SkillID,
		Version:     req.Version,
		Name:        name,
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
	return model.SkillOverview{SkillID: skillID, Versions: versions}, nil
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

	versionDir := s.versionDir(skillID, version)

	files := make([]model.FileSpec, 0)
	_ = filepath.WalkDir(versionDir, func(path string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return nil
		}
		rel, relErr := filepath.Rel(versionDir, path)
		if relErr == nil {
			b, readErr := os.ReadFile(path)
			if readErr != nil {
				return nil
			}
			files = append(files, model.FileSpec{
				Path:    filepath.ToSlash(rel),
				Content: string(b),
			})
		}
		return nil
	})
	sort.Slice(files, func(i, j int) bool {
		return files[i].Path < files[j].Path
	})

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

	versionDir := s.versionDir(skillID, version)
	if _, err := os.Stat(versionDir); errors.Is(err, os.ErrNotExist) {
		return ErrNotFound
	}
	if err := os.RemoveAll(versionDir); err != nil {
		return err
	}

	if err := s.deleteIndexEntry(skillID, version); err != nil {
		return err
	}

	parent := filepath.Dir(versionDir)
	empty, err := isDirEmpty(parent)
	if err == nil && empty {
		_ = os.Remove(parent)
	}
	return nil
}

func (s *FSStore) Validate(skillID string, version string) (model.SkillEntry, error) {
	if err := validator.ValidateSkillID(skillID); err != nil {
		return model.SkillEntry{}, err
	}
	if err := validator.ValidateVersion(version); err != nil {
		return model.SkillEntry{}, err
	}
	skillMDPath := filepath.Join(s.versionDir(skillID, version), "SKILL.md")
	b, err := os.ReadFile(skillMDPath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return model.SkillEntry{}, ErrNotFound
		}
		return model.SkillEntry{}, err
	}
	name, desc, err := validator.ValidateSkillMD(skillID, string(b))
	if err != nil {
		return model.SkillEntry{}, err
	}
	entry := model.SkillEntry{
		SkillID:     skillID,
		Version:     version,
		Name:        name,
		Description: desc,
		Path:        s.versionDir(skillID, version),
		UpdatedAt:   time.Now().UTC().Format(time.RFC3339),
	}
	return entry, nil
}

func (s *FSStore) Reindex() (int, error) {
	entries := make([]model.SkillEntry, 0)
	skillDirs, err := os.ReadDir(s.specDir)
	if err != nil {
		return 0, err
	}
	for _, sd := range skillDirs {
		if !sd.IsDir() || strings.HasPrefix(sd.Name(), ".") {
			continue
		}
		skillID := sd.Name()
		if err := validator.ValidateSkillID(skillID); err != nil {
			continue
		}
		versions, err := os.ReadDir(filepath.Join(s.specDir, skillID))
		if err != nil {
			continue
		}
		for _, vd := range versions {
			if !vd.IsDir() || strings.Contains(vd.Name(), ".tmp-") {
				continue
			}
			entry, err := s.Validate(skillID, vd.Name())
			if err == nil {
				entries = append(entries, entry)
			}
		}
	}
	idx := model.Index{UpdatedAt: time.Now().UTC().Format(time.RFC3339), Entries: entries}
	if err := s.writeIndex(idx); err != nil {
		return 0, err
	}
	return len(entries), nil
}

func (s *FSStore) versionDir(skillID string, version string) string {
	return filepath.Join(s.specDir, skillID, version)
}

func (s *FSStore) systemDir() string {
	return filepath.Join(s.specDir, config.SystemDirName)
}

func (s *FSStore) lockDir() string {
	return filepath.Join(s.systemDir(), "locks")
}

func (s *FSStore) indexPath() string {
	return filepath.Join(s.systemDir(), "index.json")
}

func (s *FSStore) writeFile(path string, content string) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	return os.WriteFile(path, []byte(content), 0o644)
}

func (s *FSStore) lockSkill(skillID string) (func(), error) {
	lockPath := filepath.Join(s.lockDir(), skillID+".lock")
	f, err := os.OpenFile(lockPath, os.O_CREATE|os.O_RDWR, 0o644)
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
	b, err := os.ReadFile(s.indexPath())
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
	if err := os.WriteFile(tmp, b, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, s.indexPath())
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

func isDirEmpty(path string) (bool, error) {
	entries, err := os.ReadDir(path)
	if err != nil {
		return false, err
	}
	return len(entries) == 0, nil
}
