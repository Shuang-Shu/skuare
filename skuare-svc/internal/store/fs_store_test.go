package store

import (
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
