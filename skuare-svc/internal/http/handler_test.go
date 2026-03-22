package http

import (
	"encoding/base64"
	"errors"
	"testing"

	"github.com/cloudwego/hertz/pkg/app"

	"skuare-svc/internal/model"
	"skuare-svc/internal/service"
	"skuare-svc/internal/store"
	"skuare-svc/internal/util"
)

type denyAuthorizer struct{}

func (d *denyAuthorizer) Verify(string, string, []byte, string, string, string, string) error {
	return util.ErrForbidden
}

func TestCheckWritePermissionLocalMode(t *testing.T) {
	h := &Handler{localMode: true}
	c := &app.RequestContext{}
	if err := h.checkWritePermission(c); err != nil {
		t.Fatalf("expected local mode bypass, got %v", err)
	}
}

func TestCheckWritePermissionNonLocalNoAuthorizer(t *testing.T) {
	h := &Handler{localMode: false, authorizer: nil}
	c := &app.RequestContext{}
	err := h.checkWritePermission(c)
	if !errors.Is(err, util.ErrForbidden) {
		t.Fatalf("expected forbidden, got %v", err)
	}
}

func TestCheckWritePermissionNonLocalDenied(t *testing.T) {
	h := &Handler{localMode: false, authorizer: &denyAuthorizer{}}
	c := &app.RequestContext{}
	err := h.checkWritePermission(c)
	if !errors.Is(err, util.ErrForbidden) {
		t.Fatalf("expected forbidden, got %v", err)
	}
}

func TestApplyMigrateImportSkipsExistingAndDecodesBase64(t *testing.T) {
	dir := t.TempDir()
	fsStore, err := store.NewFSStore(dir)
	if err != nil {
		t.Fatalf("NewFSStore failed: %v", err)
	}
	h := &Handler{
		svc:         service.NewSkillService(fsStore),
		agentsmdSvc: service.NewAgentsMDService(fsStore),
		localMode:   true,
	}

	if _, err := h.svc.Create(model.CreateSkillVersionRequest{
		SkillID: "existing",
		Version: "1.0.0",
		Files: []model.FileSpec{
			{Path: "SKILL.md", Content: "---\nname: existing\nmetadata:\n  version: \"1.0.0\"\n  author: \"team\"\ndescription: seed\n---\n"},
		},
	}); err != nil {
		t.Fatalf("seed Create failed: %v", err)
	}

	req := model.ImportMigrateRequest{
		Type:         model.MigrateResourceTypeAll,
		SkipExisting: true,
		Skills: []model.SkillDetail{
			{
				SkillEntry: model.SkillEntry{SkillID: "existing", Version: "1.0.0"},
				Files: []model.FileSpec{
					{Path: "SKILL.md", Content: "---\nname: existing\nmetadata:\n  version: \"1.0.0\"\n  author: \"team\"\ndescription: existing\n---\n"},
				},
			},
			{
				SkillEntry: model.SkillEntry{SkillID: "new-skill", Version: "1.0.0"},
				Files: []model.FileSpec{
					{Path: "SKILL.md", Content: "---\nname: new-skill\nmetadata:\n  version: \"1.0.0\"\n  author: \"team\"\ndescription: imported\n---\n"},
					{Path: "bin/data.bin", Content: base64.StdEncoding.EncodeToString([]byte{1, 2, 3}), Encoding: "base64"},
				},
			},
		},
		AgentsMD: []model.AgentsMDDetail{
			{AgentsMDID: "team-guide", Version: "1.0.0", Content: "# Guide\n"},
		},
	}

	result, err := h.applyMigrateImport(req)
	if err != nil {
		t.Fatalf("applyMigrateImport failed: %v", err)
	}
	if len(result.Skipped) != 1 || result.Skipped[0].SkillID != "existing" || result.Skipped[0].Reason != "version_conflict" {
		t.Fatalf("unexpected skipped result: %+v", result.Skipped)
	}
	if len(result.Imported) != 2 {
		t.Fatalf("unexpected imported result: %+v", result.Imported)
	}

	skillDetail, err := h.svc.GetVersion("new-skill", "1.0.0")
	if err != nil {
		t.Fatalf("GetVersion failed: %v", err)
	}
	var encoded string
	for _, file := range skillDetail.Files {
		if file.Path == "bin/data.bin" {
			encoded = file.Content
			break
		}
	}
	if got := []byte(encoded); len(got) != 3 || got[0] != 1 || got[1] != 2 || got[2] != 3 {
		t.Fatalf("binary file content mismatch: %v", got)
	}

	agentsmdDetail, err := h.agentsmdSvc.GetVersion("team-guide", "1.0.0")
	if err != nil {
		t.Fatalf("GetVersion agentsmd failed: %v", err)
	}
	if agentsmdDetail.Content != "# Guide\n" {
		t.Fatalf("unexpected agentsmd content: %q", agentsmdDetail.Content)
	}

}

func TestApplyMigrateImportSkipsUnchangedWithoutSkipExisting(t *testing.T) {
	dir := t.TempDir()
	fsStore, err := store.NewFSStore(dir)
	if err != nil {
		t.Fatalf("NewFSStore failed: %v", err)
	}
	h := &Handler{
		svc:         service.NewSkillService(fsStore),
		agentsmdSvc: service.NewAgentsMDService(fsStore),
		localMode:   true,
	}

	if _, err := h.svc.Create(model.CreateSkillVersionRequest{
		SkillID: "existing",
		Version: "1.0.0",
		Files: []model.FileSpec{
			{Path: "SKILL.md", Content: "---\nname: existing\nmetadata:\n  version: \"1.0.0\"\n  author: \"team\"\ndescription: same\n---\n"},
		},
	}); err != nil {
		t.Fatalf("seed Create failed: %v", err)
	}
	if _, err := h.agentsmdSvc.Create(model.CreateAgentsMDRequest{
		AgentsMDID: "team-guide",
		Version:    "1.0.0",
		Content:    "# Guide\n",
	}); err != nil {
		t.Fatalf("seed AgentsMD Create failed: %v", err)
	}

	result, err := h.applyMigrateImport(model.ImportMigrateRequest{
		Type: model.MigrateResourceTypeAll,
		Skills: []model.SkillDetail{
			{
				SkillEntry: model.SkillEntry{SkillID: "existing", Version: "1.0.0"},
				Files: []model.FileSpec{
					{Path: "SKILL.md", Content: "---\nname: existing\nmetadata:\n  version: \"1.0.0\"\n  author: \"team\"\ndescription: same\n---\n"},
				},
			},
		},
		AgentsMD: []model.AgentsMDDetail{
			{AgentsMDID: "team-guide", Version: "1.0.0", Content: "# Guide\n"},
		},
	})
	if err != nil {
		t.Fatalf("applyMigrateImport failed: %v", err)
	}
	if len(result.Imported) != 0 {
		t.Fatalf("unexpected imported result: %+v", result.Imported)
	}
	if len(result.Skipped) != 2 || result.Skipped[0].Reason != "unchanged" || result.Skipped[1].Reason != "unchanged" {
		t.Fatalf("unexpected skipped result: %+v", result.Skipped)
	}
}
