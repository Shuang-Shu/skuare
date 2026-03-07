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
	svc             *service.SkillService
	agentsmdSvc     *service.AgentsMDService
	authorizer      authz.WriteAuthorizer
	localMode       bool
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
	if err := h.checkWritePermission(c); err != nil {
		writeError(c, err)
		return
	}
	var req model.CreateSkillVersionRequest
	if err := c.BindAndValidate(&req); err != nil {
		writeError(c, err)
		return
	}
	entry, err := h.svc.Create(req)
	if err != nil {
		writeError(c, err)
		return
	}
	c.JSON(201, entry)
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
	overview, err := h.svc.GetSkill(skillID)
	if err != nil {
		writeError(c, err)
		return
	}
	c.JSON(200, overview)
}

func (h *Handler) getVersion(_ context.Context, c *app.RequestContext) {
	skillID := c.Param("skillID")
	version := c.Param("version")
	detail, err := h.svc.GetVersion(skillID, version)
	if err != nil {
		writeError(c, err)
		return
	}
	c.JSON(200, detail)
}

func (h *Handler) deleteVersion(_ context.Context, c *app.RequestContext) {
	if err := h.checkWritePermission(c); err != nil {
		writeError(c, err)
		return
	}
	skillID := c.Param("skillID")
	version := c.Param("version")
	if err := h.svc.Delete(skillID, version); err != nil {
		writeError(c, err)
		return
	}
	c.JSON(200, map[string]any{"deleted": true})
}

func (h *Handler) validateVersion(_ context.Context, c *app.RequestContext) {
	skillID := c.Param("skillID")
	version := c.Param("version")
	entry, err := h.svc.Validate(skillID, version)
	if err != nil {
		writeError(c, err)
		return
	}
	c.JSON(200, entry)
}

func (h *Handler) reindex(_ context.Context, c *app.RequestContext) {
	if err := h.checkWritePermission(c); err != nil {
		writeError(c, err)
		return
	}
	n, err := h.svc.Reindex()
	if err != nil {
		writeError(c, err)
		return
	}
	c.JSON(200, map[string]any{"count": n})
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
	if err := h.checkWritePermission(c); err != nil {
		writeError(c, err)
		return
	}
	var req model.CreateAgentsMDRequest
	if err := c.BindAndValidate(&req); err != nil {
		writeError(c, err)
		return
	}
	entry, err := h.agentsmdSvc.Create(req)
	if err != nil {
		writeError(c, err)
		return
	}
	c.JSON(201, entry)
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
	overview, err := h.agentsmdSvc.GetAgentsMD(agentsmdID)
	if err != nil {
		writeError(c, err)
		return
	}
	c.JSON(200, overview)
}

func (h *Handler) getAgentsMDVersion(_ context.Context, c *app.RequestContext) {
	agentsmdID := c.Param("agentsmdID")
	version := c.Param("version")
	detail, err := h.agentsmdSvc.GetVersion(agentsmdID, version)
	if err != nil {
		writeError(c, err)
		return
	}
	c.JSON(200, detail)
}

func (h *Handler) deleteAgentsMD(_ context.Context, c *app.RequestContext) {
	if err := h.checkWritePermission(c); err != nil {
		writeError(c, err)
		return
	}
	agentsmdID := c.Param("agentsmdID")
	version := c.Param("version")
	if err := h.agentsmdSvc.Delete(agentsmdID, version); err != nil {
		writeError(c, err)
		return
	}
	c.JSON(200, map[string]any{"deleted": true})
}
