package store

import (
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
