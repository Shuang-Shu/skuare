package store

import (
	"errors"
	"path/filepath"
	"strings"
	"testing"

	"skuare-svc/internal/model"
)

func TestFSStoreCRUD(t *testing.T) {
	dir := t.TempDir()
	s, err := NewFSStore(dir)
	if err != nil {
		t.Fatalf("NewFSStore failed: %v", err)
	}

	req := model.CreateSkillVersionRequest{
		SkillID: "pdf-reader",
		Version: "1.0.0",
		Skill: model.SkillSpec{
			Description: "test skill",
			Overview:    "overview",
			Sections: []model.SkillSection{
				{Title: "目标", Content: "实现读取能力"},
			},
		},
	}

	entry, err := s.Create(req.ToUploadRequest())
	if err != nil {
		t.Fatalf("Create failed: %v", err)
	}
	if entry.Name != "pdf-reader" {
		t.Fatalf("unexpected entry name: %s", entry.Name)
	}
	wantPath := filepath.Join(dir, anonymousSkillAuthorDir, "pdf-reader", "1.0.0")
	if entry.Path != wantPath {
		t.Fatalf("entry.Path=%q, want=%q", entry.Path, wantPath)
	}

	items, err := s.List("pdf")
	if err != nil {
		t.Fatalf("List failed: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("expected 1 item, got %d", len(items))
	}

	detail, err := s.GetVersion("pdf-reader", "1.0.0")
	if err != nil {
		t.Fatalf("GetVersion failed: %v", err)
	}
	if len(detail.Files) == 0 {
		t.Fatalf("expected files in detail")
	}
	if detail.Path != wantPath {
		t.Fatalf("detail.Path=%q, want=%q", detail.Path, wantPath)
	}

	if _, err := s.Validate("pdf-reader", "1.0.0"); err != nil {
		t.Fatalf("Validate failed: %v", err)
	}

	if err := s.Delete("pdf-reader", "1.0.0"); err != nil {
		t.Fatalf("Delete failed: %v", err)
	}
	if _, err := s.GetVersion("pdf-reader", "1.0.0"); err == nil {
		t.Fatalf("expected not found after delete")
	}
}

func TestFSStoreCreateRespectsUploadedSkillMD(t *testing.T) {
	dir := t.TempDir()
	s, err := NewFSStore(dir)
	if err != nil {
		t.Fatalf("NewFSStore failed: %v", err)
	}

	customSkillMD := strings.Join([]string{
		"---",
		"name: custom-reader",
		"description: custom desc",
		"---",
		"",
		"# custom-reader",
		"",
		"## Overview",
		"custom overview",
		"",
	}, "\n")

	req := model.CreateSkillVersionRequest{
		SkillID: "custom-reader",
		Version: "1.0.0",
		Skill:   model.SkillSpec{},
		Files: []model.FileSpec{
			{Path: "SKILL.md", Content: customSkillMD},
		},
	}

	if _, err := s.Create(req.ToUploadRequest()); err != nil {
		t.Fatalf("Create failed: %v", err)
	}

	detail, err := s.GetVersion("custom-reader", "1.0.0")
	if err != nil {
		t.Fatalf("GetVersion failed: %v", err)
	}

	var got string
	for _, f := range detail.Files {
		if f.Path == "SKILL.md" {
			got = f.Content
			break
		}
	}
	if got == "" {
		t.Fatalf("expected SKILL.md in detail files")
	}
	if got != customSkillMD {
		t.Fatalf("expected uploaded SKILL.md to be preserved")
	}
}

func TestFSStorePersistsAuthorFromSkillMetadata(t *testing.T) {
	dir := t.TempDir()
	s, err := NewFSStore(dir)
	if err != nil {
		t.Fatalf("NewFSStore failed: %v", err)
	}

	customSkillMD := strings.Join([]string{
		"---",
		"name: custom-reader",
		"metadata:",
		"  author: custom-author",
		"  version: 1.0.0",
		"description: custom desc",
		"---",
		"",
		"# custom-reader",
		"",
		"## Overview",
		"custom overview",
		"",
	}, "\n")

	req := model.CreateSkillVersionRequest{
		SkillID: "custom-reader",
		Version: "1.0.0",
		Files: []model.FileSpec{
			{Path: "SKILL.md", Content: customSkillMD},
		},
	}

	entry, err := s.Create(req.ToUploadRequest())
	if err != nil {
		t.Fatalf("Create failed: %v", err)
	}
	if entry.Author != "custom-author" {
		t.Fatalf("expected author in create response, got %q", entry.Author)
	}
	wantPath := filepath.Join(dir, "custom-author", "custom-reader", "1.0.0")
	if entry.Path != wantPath {
		t.Fatalf("entry.Path=%q, want=%q", entry.Path, wantPath)
	}

	items, err := s.List("custom")
	if err != nil {
		t.Fatalf("List failed: %v", err)
	}
	if len(items) != 1 || items[0].Author != "custom-author" {
		t.Fatalf("expected author in list response, got %+v", items)
	}

	overview, err := s.GetSkill("custom-reader")
	if err != nil {
		t.Fatalf("GetSkill failed: %v", err)
	}
	if overview.Author != "custom-author" {
		t.Fatalf("expected author in skill overview, got %q", overview.Author)
	}

	detail, err := s.GetVersion("custom-reader", "1.0.0")
	if err != nil {
		t.Fatalf("GetVersion failed: %v", err)
	}
	if detail.Author != "custom-author" {
		t.Fatalf("expected author in detail, got %q", detail.Author)
	}
	if detail.Path != wantPath {
		t.Fatalf("detail.Path=%q, want=%q", detail.Path, wantPath)
	}

	if _, err := s.Reindex(); err != nil {
		t.Fatalf("Reindex failed: %v", err)
	}
	items, err = s.List("custom")
	if err != nil {
		t.Fatalf("List after reindex failed: %v", err)
	}
	if len(items) != 1 || items[0].Author != "custom-author" {
		t.Fatalf("expected author to survive reindex, got %+v", items)
	}
	if items[0].Path != wantPath {
		t.Fatalf("reindex Path=%q, want=%q", items[0].Path, wantPath)
	}
}

func TestFSStoreCreateDuplicateWithoutForceReturnsAlreadyExists(t *testing.T) {
	dir := t.TempDir()
	s, err := NewFSStore(dir)
	if err != nil {
		t.Fatalf("NewFSStore failed: %v", err)
	}

	req := model.CreateSkillVersionRequest{
		SkillID: "demo-skill",
		Version: "1.0.0",
		Skill: model.SkillSpec{
			Description: "first description",
			Overview:    "first overview",
		},
	}

	if _, err := s.Create(req.ToUploadRequest()); err != nil {
		t.Fatalf("first Create failed: %v", err)
	}

	_, err = s.Create(req.ToUploadRequest())
	if !errors.Is(err, ErrAlreadyExists) {
		t.Fatalf("expected ErrAlreadyExists, got %v", err)
	}
}

func TestFSStoreUsesAnonymousDirectoryWhenAuthorMissing(t *testing.T) {
	dir := t.TempDir()
	s, err := NewFSStore(dir)
	if err != nil {
		t.Fatalf("NewFSStore failed: %v", err)
	}

	entry, err := s.Create((model.CreateSkillVersionRequest{
		SkillID: "demo-skill",
		Version: "1.0.0",
		Skill: model.SkillSpec{
			Description: "demo description",
			Overview:    "demo overview",
		},
	}).ToUploadRequest())
	if err != nil {
		t.Fatalf("Create failed: %v", err)
	}

	wantPath := filepath.Join(dir, anonymousSkillAuthorDir, "demo-skill", "1.0.0")
	if entry.Path != wantPath {
		t.Fatalf("entry.Path=%q, want=%q", entry.Path, wantPath)
	}
	if entry.Author != "" {
		t.Fatalf("entry.Author=%q, want empty", entry.Author)
	}
}

func TestFSStoreRejectsAuthorContainingPathSeparator(t *testing.T) {
	dir := t.TempDir()
	s, err := NewFSStore(dir)
	if err != nil {
		t.Fatalf("NewFSStore failed: %v", err)
	}

	skillMD := strings.Join([]string{
		"---",
		"name: bad-author-skill",
		"metadata:",
		"  author: bad/author",
		"description: demo desc",
		"---",
		"",
		"# bad-author-skill",
		"",
	}, "\n")

	_, err = s.Create((model.CreateSkillVersionRequest{
		SkillID: "bad-author-skill",
		Version: "1.0.0",
		Files: []model.FileSpec{
			{Path: "SKILL.md", Content: skillMD},
		},
	}).ToUploadRequest())
	if err == nil || !strings.Contains(err.Error(), "invalid metadata.author") {
		t.Fatalf("expected invalid metadata.author error, got %v", err)
	}
}

func TestFSStoreAgentsMDCrud(t *testing.T) {
	dir := t.TempDir()
	s, err := NewFSStore(dir)
	if err != nil {
		t.Fatalf("NewFSStore failed: %v", err)
	}

	entry, err := s.CreateAgentsMD(model.CreateAgentsMDRequest{
		AgentsMDID: "team-guide",
		Version:    "1.0.0",
		Content:    "# Team Guide\n",
	})
	if err != nil {
		t.Fatalf("CreateAgentsMD failed: %v", err)
	}
	if entry.ID != "team-guide@1.0.0" {
		t.Fatalf("unexpected entry ID: %s", entry.ID)
	}

	items, err := s.ListAgentsMD("team")
	if err != nil {
		t.Fatalf("ListAgentsMD failed: %v", err)
	}
	if len(items) != 1 || items[0].Version != "1.0.0" {
		t.Fatalf("unexpected agentsmd items: %+v", items)
	}

	overview, err := s.GetAgentsMD("team-guide")
	if err != nil {
		t.Fatalf("GetAgentsMD failed: %v", err)
	}
	if len(overview.Versions) != 1 || overview.Versions[0] != "1.0.0" {
		t.Fatalf("unexpected overview: %+v", overview)
	}

	detail, err := s.GetAgentsMDVersion("team-guide", "1.0.0")
	if err != nil {
		t.Fatalf("GetAgentsMDVersion failed: %v", err)
	}
	if detail.Content != "# Team Guide\n" {
		t.Fatalf("unexpected content: %q", detail.Content)
	}

	if err := s.DeleteAgentsMD("team-guide", "1.0.0"); err != nil {
		t.Fatalf("DeleteAgentsMD failed: %v", err)
	}
	if _, err := s.GetAgentsMDVersion("team-guide", "1.0.0"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("expected ErrNotFound after delete, got %v", err)
	}
}

func TestFSStoreCreateForceOverwritesExistingVersion(t *testing.T) {
	dir := t.TempDir()
	s, err := NewFSStore(dir)
	if err != nil {
		t.Fatalf("NewFSStore failed: %v", err)
	}

	firstSkillMD := strings.Join([]string{
		"---",
		"name: demo-skill",
		"metadata:",
		"  version: 1.0.0",
		"description: first description",
		"---",
		"",
		"# demo-skill",
		"",
		"## Overview",
		"first overview",
		"",
	}, "\n")
	secondSkillMD := strings.Join([]string{
		"---",
		"name: demo-skill",
		"metadata:",
		"  version: 1.0.0",
		"description: second description",
		"---",
		"",
		"# demo-skill",
		"",
		"## Overview",
		"second overview",
		"",
	}, "\n")

	firstReq := model.CreateSkillVersionRequest{
		SkillID: "demo-skill",
		Version: "1.0.0",
		Files: []model.FileSpec{
			{Path: "SKILL.md", Content: firstSkillMD},
			{Path: "notes/old.txt", Content: "old content"},
		},
	}
	if _, err := s.Create(firstReq.ToUploadRequest()); err != nil {
		t.Fatalf("first Create failed: %v", err)
	}

	secondReq := model.CreateSkillVersionRequest{
		SkillID: "demo-skill",
		Version: "1.0.0",
		Force:   true,
		Files: []model.FileSpec{
			{Path: "SKILL.md", Content: secondSkillMD},
			{Path: "notes/new.txt", Content: "new content"},
		},
	}
	entry, err := s.Create(secondReq.ToUploadRequest())
	if err != nil {
		t.Fatalf("force Create failed: %v", err)
	}
	if entry.Description != "second description" {
		t.Fatalf("expected overwritten description, got %q", entry.Description)
	}

	detail, err := s.GetVersion("demo-skill", "1.0.0")
	if err != nil {
		t.Fatalf("GetVersion failed: %v", err)
	}

	files := map[string]string{}
	for _, file := range detail.Files {
		files[file.Path] = file.Content
	}
	if files["notes/new.txt"] != "new content" {
		t.Fatalf("expected new file to exist, got %+v", files)
	}
	if _, ok := files["notes/old.txt"]; ok {
		t.Fatalf("expected old file to be removed after force overwrite, got %+v", files)
	}
	if !strings.Contains(files["SKILL.md"], "second description") {
		t.Fatalf("expected SKILL.md to be overwritten, got %q", files["SKILL.md"])
	}
}

func TestFSStoreGetVersionBase64EncodesBinaryFiles(t *testing.T) {
	dir := t.TempDir()
	s, err := NewFSStore(dir)
	if err != nil {
		t.Fatalf("NewFSStore failed: %v", err)
	}

	req := model.CreateSkillUploadRequest{
		SkillID: "demo-skill",
		Version: "1.0.0",
		Files: []model.UploadedFile{
			{
				Path: "SKILL.md",
				Content: []byte(strings.Join([]string{
					"---",
					"name: demo-skill",
					"metadata:",
					"  version: 1.0.0",
					"description: demo description",
					"---",
					"",
					"# demo-skill",
					"",
					"## Overview",
					"demo overview",
					"",
				}, "\n")),
			},
			{
				Path:    "assets/icon.bin",
				Content: []byte{0x00, 0x01, 0x02, 0xff},
			},
		},
	}

	if _, err := s.Create(req); err != nil {
		t.Fatalf("Create failed: %v", err)
	}

	detail, err := s.GetVersion("demo-skill", "1.0.0")
	if err != nil {
		t.Fatalf("GetVersion failed: %v", err)
	}

	files := map[string]model.FileSpec{}
	for _, file := range detail.Files {
		files[file.Path] = file
	}
	if files["assets/icon.bin"].Encoding != "base64" {
		t.Fatalf("expected base64 encoding, got %+v", files["assets/icon.bin"])
	}
	if files["assets/icon.bin"].Content != "AAEC/w==" {
		t.Fatalf("unexpected base64 content: %q", files["assets/icon.bin"].Content)
	}
	if files["SKILL.md"].Encoding != "" {
		t.Fatalf("expected text file to omit encoding, got %+v", files["SKILL.md"])
	}
}
