package store

import (
	"errors"
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

	entry, err := s.Create(req)
	if err != nil {
		t.Fatalf("Create failed: %v", err)
	}
	if entry.Name != "pdf-reader" {
		t.Fatalf("unexpected entry name: %s", entry.Name)
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

	if _, err := s.Create(req); err != nil {
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

	entry, err := s.Create(req)
	if err != nil {
		t.Fatalf("Create failed: %v", err)
	}
	if entry.Author != "custom-author" {
		t.Fatalf("expected author in create response, got %q", entry.Author)
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

	if _, err := s.Create(req); err != nil {
		t.Fatalf("first Create failed: %v", err)
	}

	_, err = s.Create(req)
	if !errors.Is(err, ErrAlreadyExists) {
		t.Fatalf("expected ErrAlreadyExists, got %v", err)
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
	if _, err := s.Create(firstReq); err != nil {
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
	entry, err := s.Create(secondReq)
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
