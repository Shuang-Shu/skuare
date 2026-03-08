package http

import (
	"context"

	"github.com/cloudwego/hertz/pkg/app"
	"github.com/cloudwego/hertz/pkg/app/server"

	"skuare-svc/internal/authz"
	"skuare-svc/internal/model"
	"skuare-svc/internal/service"
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

func NewServer(addr string, svc *service.SkillService, agentsmdSvc *service.AgentsMDService, authorizer authz.WriteAuthorizer, localMode bool) *server.Hertz {
	h := server.Default(server.WithHostPorts(addr))
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
