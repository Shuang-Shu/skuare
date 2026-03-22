package http

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"sort"

	"github.com/cloudwego/hertz/pkg/app"
	"github.com/cloudwego/hertz/pkg/app/server"

	"skuare-svc/internal/authz"
	"skuare-svc/internal/model"
	"skuare-svc/internal/service"
	"skuare-svc/internal/store"
	"skuare-svc/internal/util"
)

type Handler struct {
	svc         *service.SkillService
	agentsmdSvc *service.AgentsMDService
	authorizer  authz.WriteAuthorizer
	localMode   bool
}

type healthResponse struct {
	Status string `json:"status"`
	Name   string `json:"name"`
}

func NewServer(addr string, svc *service.SkillService, agentsmdSvc *service.AgentsMDService, authorizer authz.WriteAuthorizer, localMode bool, maxRequestBodySize int) *server.Hertz {
	h := server.Default(
		server.WithHostPorts(addr),
		server.WithMaxRequestBodySize(maxRequestBodySize),
		server.WithMaxKeepBodySize(maxRequestBodySize),
	)
	handler := &Handler{svc: svc, agentsmdSvc: agentsmdSvc, authorizer: authorizer, localMode: localMode}

	h.GET("/healthz", handler.healthz)

	v1 := h.Group("/api/v1")
	v1.POST("/skills", handler.createSkill)
	v1.GET("/skills", handler.listSkills)
	v1.GET("/skills/:skillID", handler.getSkill)
	v1.GET("/skills/:skillID/:version", handler.getVersion)
	v1.DELETE("/skills/:skillID/:version", handler.deleteVersion)
	v1.POST("/skills/:skillID/:version/validate", handler.validateVersion)
	v1.POST("/reindex", handler.reindex)
	v1.GET("/migrate/export", handler.exportMigrateBundle)
	v1.POST("/migrate/import", handler.importMigrateBundle)

	// AgentsMD routes
	v1.POST("/agentsmd", handler.createAgentsMD)
	v1.GET("/agentsmd", handler.listAgentsMD)
	v1.GET("/agentsmd/:agentsmdID", handler.getAgentsMD)
	v1.GET("/agentsmd/:agentsmdID/:version", handler.getAgentsMDVersion)
	v1.DELETE("/agentsmd/:agentsmdID/:version", handler.deleteAgentsMD)

	return h
}

func (h *Handler) healthz(_ context.Context, c *app.RequestContext) {
	c.JSON(200, healthResponse{Status: "ok", Name: "skuare-svc"})
}

func (h *Handler) createSkill(_ context.Context, c *app.RequestContext) {
	if !h.requireWritePermission(c) {
		return
	}
	if isMultipartSkillUpload(c) {
		req, err := parseMultipartSkillUpload(c)
		if err != nil {
			writeError(c, err)
			return
		}
		writeJSONCall(c, 201, func() (model.SkillEntry, error) {
			return h.svc.CreateUpload(req)
		})
		return
	}
	var req model.CreateSkillVersionRequest
	if !bindAndValidateJSON(c, &req) {
		return
	}
	writeJSONCall(c, 201, func() (model.SkillEntry, error) {
		return h.svc.Create(req)
	})
}

func (h *Handler) listSkills(_ context.Context, c *app.RequestContext) {
	q := c.Query("q")
	entries, err := h.svc.List(q)
	if err != nil {
		writeError(c, err)
		return
	}
	c.JSON(200, map[string]any{"items": entries})
}

func (h *Handler) getSkill(_ context.Context, c *app.RequestContext) {
	skillID := c.Param("skillID")
	writeJSONCall(c, 200, func() (model.SkillOverview, error) {
		return h.svc.GetSkill(skillID)
	})
}

func (h *Handler) getVersion(_ context.Context, c *app.RequestContext) {
	skillID := c.Param("skillID")
	version := c.Param("version")
	writeJSONCall(c, 200, func() (model.SkillDetail, error) {
		return h.svc.GetVersion(skillID, version)
	})
}

func (h *Handler) deleteVersion(_ context.Context, c *app.RequestContext) {
	if !h.requireWritePermission(c) {
		return
	}
	skillID := c.Param("skillID")
	version := c.Param("version")
	if err := h.svc.Delete(skillID, version); err != nil {
		writeError(c, err)
		return
	}
	writeDeleted(c)
}

func (h *Handler) validateVersion(_ context.Context, c *app.RequestContext) {
	skillID := c.Param("skillID")
	version := c.Param("version")
	writeJSONCall(c, 200, func() (model.SkillEntry, error) {
		return h.svc.Validate(skillID, version)
	})
}

func (h *Handler) reindex(_ context.Context, c *app.RequestContext) {
	if !h.requireWritePermission(c) {
		return
	}
	count, err := h.svc.Reindex()
	if err != nil {
		writeError(c, err)
		return
	}
	c.JSON(200, map[string]any{"count": count})
}

func (h *Handler) exportMigrateBundle(_ context.Context, c *app.RequestContext) {
	resourceType, err := parseMigrateResourceType(c.Query("type"))
	if err != nil {
		writeError(c, err)
		return
	}

	bundle := model.MigrateBundle{Type: resourceType}
	if resourceType == model.MigrateResourceTypeAll || resourceType == model.MigrateResourceTypeSkill {
		items, err := h.svc.List("")
		if err != nil {
			writeError(c, err)
			return
		}
		for _, item := range items {
			detail, err := h.svc.GetVersion(item.SkillID, item.Version)
			if err != nil {
				writeError(c, err)
				return
			}
			bundle.Skills = append(bundle.Skills, detail)
		}
	}
	if resourceType == model.MigrateResourceTypeAll || resourceType == model.MigrateResourceTypeAgentsMD {
		items, err := h.agentsmdSvc.List("")
		if err != nil {
			writeError(c, err)
			return
		}
		for _, item := range items {
			detail, err := h.agentsmdSvc.GetVersion(item.AgentsMDID, item.Version)
			if err != nil {
				writeError(c, err)
				return
			}
			bundle.AgentsMD = append(bundle.AgentsMD, detail)
		}
	}
	c.JSON(200, bundle)
}

func (h *Handler) importMigrateBundle(_ context.Context, c *app.RequestContext) {
	if !h.requireWritePermission(c) {
		return
	}
	var req model.ImportMigrateRequest
	if !bindAndValidateJSON(c, &req) {
		return
	}
	if req.Type == "" {
		req.Type = model.MigrateResourceTypeAll
	}
	writeJSONCall(c, 200, func() (model.ImportMigrateResult, error) {
		return h.applyMigrateImport(req)
	})
}

func (h *Handler) checkWritePermission(c *app.RequestContext) error {
	if h.localMode {
		return nil
	}
	if h.authorizer == nil {
		return util.ErrForbidden
	}
	keyID := string(c.Request.Header.Peek(authz.HeaderKeyID))
	ts := string(c.Request.Header.Peek(authz.HeaderTimestamp))
	nonce := string(c.Request.Header.Peek(authz.HeaderNonce))
	signature := string(c.Request.Header.Peek(authz.HeaderSignature))
	return h.authorizer.Verify(
		string(c.Request.Header.Method()),
		string(c.Request.URI().Path()),
		c.Request.Body(),
		keyID,
		ts,
		nonce,
		signature,
	)
}

// AgentsMD handlers

func (h *Handler) createAgentsMD(_ context.Context, c *app.RequestContext) {
	if !h.requireWritePermission(c) {
		return
	}
	var req model.CreateAgentsMDRequest
	if !bindAndValidateJSON(c, &req) {
		return
	}
	writeJSONCall(c, 201, func() (model.AgentsMDEntry, error) {
		return h.agentsmdSvc.Create(req)
	})
}

func (h *Handler) listAgentsMD(_ context.Context, c *app.RequestContext) {
	q := c.Query("q")
	entries, err := h.agentsmdSvc.List(q)
	if err != nil {
		writeError(c, err)
		return
	}
	c.JSON(200, map[string]any{"items": entries})
}

func (h *Handler) getAgentsMD(_ context.Context, c *app.RequestContext) {
	agentsmdID := c.Param("agentsmdID")
	writeJSONCall(c, 200, func() (model.AgentsMDOverview, error) {
		return h.agentsmdSvc.GetAgentsMD(agentsmdID)
	})
}

func (h *Handler) getAgentsMDVersion(_ context.Context, c *app.RequestContext) {
	agentsmdID := c.Param("agentsmdID")
	version := c.Param("version")
	writeJSONCall(c, 200, func() (model.AgentsMDDetail, error) {
		return h.agentsmdSvc.GetVersion(agentsmdID, version)
	})
}

func (h *Handler) deleteAgentsMD(_ context.Context, c *app.RequestContext) {
	if !h.requireWritePermission(c) {
		return
	}
	agentsmdID := c.Param("agentsmdID")
	version := c.Param("version")
	if err := h.agentsmdSvc.Delete(agentsmdID, version); err != nil {
		writeError(c, err)
		return
	}
	writeDeleted(c)
}

func (h *Handler) requireWritePermission(c *app.RequestContext) bool {
	if err := h.checkWritePermission(c); err != nil {
		writeError(c, err)
		return false
	}
	return true
}

func bindAndValidateJSON[T any](c *app.RequestContext, target *T) bool {
	if err := c.BindAndValidate(target); err != nil {
		writeError(c, err)
		return false
	}
	return true
}

func writeJSONCall[T any](c *app.RequestContext, status int, call func() (T, error)) {
	value, err := call()
	if err != nil {
		writeError(c, err)
		return
	}
	c.JSON(status, value)
}

func writeDeleted(c *app.RequestContext) {
	c.JSON(200, map[string]any{"deleted": true})
}

func (h *Handler) applyMigrateImport(req model.ImportMigrateRequest) (model.ImportMigrateResult, error) {
	result := model.ImportMigrateResult{
		Imported: []model.MigrateRef{},
		Skipped:  []model.MigrateSkippedRef{},
	}

	for _, skill := range req.Skills {
		ref := model.MigrateRef{Type: string(model.MigrateResourceTypeSkill), SkillID: skill.SkillID, Version: skill.Version}
		existing, err := h.svc.GetVersion(skill.SkillID, skill.Version)
		if err == nil {
			if sameSkillContent(existing, skill) {
				result.Skipped = append(result.Skipped, model.MigrateSkippedRef{MigrateRef: ref, Reason: "unchanged"})
				continue
			}
			if req.SkipExisting {
				result.Skipped = append(result.Skipped, model.MigrateSkippedRef{MigrateRef: ref, Reason: "version_conflict"})
				continue
			}
			return result, fmt.Errorf("skill version already exists with different content: %s@%s: %w", skill.SkillID, skill.Version, store.ErrAlreadyExists)
		}
		if err != nil && !errors.Is(err, store.ErrNotFound) {
			return result, err
		}
		uploadReq, err := toUploadFromDetail(skill)
		if err != nil {
			return result, err
		}
		entry, err := h.svc.CreateUpload(uploadReq)
		if err != nil {
			return result, err
		}
		result.Imported = append(result.Imported, model.MigrateRef{Type: "skill", SkillID: entry.SkillID, Version: entry.Version})
	}

	for _, agentsmd := range req.AgentsMD {
		ref := model.MigrateRef{Type: string(model.MigrateResourceTypeAgentsMD), AgentsMDID: agentsmd.AgentsMDID, Version: agentsmd.Version}
		existing, err := h.agentsmdSvc.GetVersion(agentsmd.AgentsMDID, agentsmd.Version)
		if err == nil {
			if sameAgentsMDContent(existing, agentsmd) {
				result.Skipped = append(result.Skipped, model.MigrateSkippedRef{MigrateRef: ref, Reason: "unchanged"})
				continue
			}
			if req.SkipExisting {
				result.Skipped = append(result.Skipped, model.MigrateSkippedRef{MigrateRef: ref, Reason: "version_conflict"})
				continue
			}
			return result, fmt.Errorf("skill version already exists with different content: %s@%s: %w", agentsmd.AgentsMDID, agentsmd.Version, store.ErrAlreadyExists)
		}
		if err != nil && !errors.Is(err, store.ErrNotFound) {
			return result, err
		}
		entry, err := h.agentsmdSvc.Create(model.CreateAgentsMDRequest{
			AgentsMDID: agentsmd.AgentsMDID,
			Version:    agentsmd.Version,
			Content:    agentsmd.Content,
		})
		if err != nil {
			return result, err
		}
		result.Imported = append(result.Imported, model.MigrateRef{Type: "agentsmd", AgentsMDID: entry.AgentsMDID, Version: entry.Version})
	}

	return result, nil
}

func parseMigrateResourceType(raw string) (model.MigrateResourceType, error) {
	switch raw {
	case "", "all":
		return model.MigrateResourceTypeAll, nil
	case "skill":
		return model.MigrateResourceTypeSkill, nil
	case "agentsmd", "agmd":
		return model.MigrateResourceTypeAgentsMD, nil
	default:
		return "", errors.New("invalid migrate resource type")
	}
}

func toUploadFromDetail(detail model.SkillDetail) (model.CreateSkillUploadRequest, error) {
	files := make([]model.UploadedFile, 0, len(detail.Files))
	for _, file := range detail.Files {
		content := []byte(file.Content)
		if file.Encoding == "base64" {
			decoded, err := base64.StdEncoding.DecodeString(file.Content)
			if err != nil {
				return model.CreateSkillUploadRequest{}, err
			}
			content = decoded
		}
		files = append(files, model.UploadedFile{
			Path:    file.Path,
			Content: content,
		})
	}
	return model.CreateSkillUploadRequest{
		SkillID: detail.SkillID,
		Version: detail.Version,
		Files:   files,
	}, nil
}

func sameSkillContent(left model.SkillDetail, right model.SkillDetail) bool {
	leftFiles := normalizeSkillFiles(left.Files)
	rightFiles := normalizeSkillFiles(right.Files)
	if len(leftFiles) != len(rightFiles) {
		return false
	}
	for index := range leftFiles {
		if leftFiles[index].Path != rightFiles[index].Path || leftFiles[index].Content != rightFiles[index].Content {
			return false
		}
	}
	return true
}

func sameAgentsMDContent(left model.AgentsMDDetail, right model.AgentsMDDetail) bool {
	return left.Content == right.Content
}

func normalizeSkillFiles(files []model.FileSpec) []model.FileSpec {
	normalized := make([]model.FileSpec, 0, len(files))
	for _, file := range files {
		content := file.Content
		if file.Encoding == "base64" {
			decoded, err := base64.StdEncoding.DecodeString(file.Content)
			if err == nil {
				content = string(decoded)
			}
		}
		normalized = append(normalized, model.FileSpec{
			Path:    file.Path,
			Content: content,
		})
	}
	sort.Slice(normalized, func(i, j int) bool {
		return normalized[i].Path < normalized[j].Path
	})
	return normalized
}
