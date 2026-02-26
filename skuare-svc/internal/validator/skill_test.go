package validator

import (
	"testing"

	"skuare-svc/internal/model"
)

func TestValidateSkillID(t *testing.T) {
	if err := ValidateSkillID("pdf-reader"); err != nil {
		t.Fatalf("expected valid skill id, got %v", err)
	}
	if err := ValidateSkillID("PDF"); err == nil {
		t.Fatalf("expected invalid skill id")
	}
}

func TestValidateSkillMD(t *testing.T) {
	skillMD := "---\nname: pdf-reader\ndescription: desc\n---\n\n# Title\n"
	name, desc, err := ValidateSkillMD("pdf-reader", skillMD)
	if err != nil {
		t.Fatalf("expected valid skill md, got %v", err)
	}
	if name != "pdf-reader" || desc != "desc" {
		t.Fatalf("unexpected parse result: %s %s", name, desc)
	}

	if _, _, err := ValidateSkillMD("other", skillMD); err == nil {
		t.Fatalf("expected mismatched name error")
	}
}

func TestValidateAndRenderSkillSpec(t *testing.T) {
	spec := model.SkillSpec{
		Description: "read pdf skill",
		Sections: []model.SkillSection{
			{Title: "目标与范围", Content: "范围说明"},
		},
	}
	if err := ValidateSkillSpec(spec); err != nil {
		t.Fatalf("expected valid skill spec, got %v", err)
	}
	md := RenderSkillMD("pdf-reader", spec)
	name, desc, err := ValidateSkillMD("pdf-reader", md)
	if err != nil {
		t.Fatalf("expected rendered markdown valid, got %v", err)
	}
	if name != "pdf-reader" || desc != "read pdf skill" {
		t.Fatalf("unexpected parse result: %s %s", name, desc)
	}
}

func TestValidateRelativeFilePath(t *testing.T) {
	if err := ValidateRelativeFilePath("references/readme.md"); err != nil {
		t.Fatalf("expected valid path, got %v", err)
	}
	if err := ValidateRelativeFilePath("../etc/passwd"); err == nil {
		t.Fatalf("expected invalid path error")
	}
}
