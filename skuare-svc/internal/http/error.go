package http

import (
	"errors"
	"net/http"
	"strings"

	"skuare-svc/internal/authz"
	"skuare-svc/internal/store"
)

type errorResponse struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

func mapError(err error) (int, string, string) {
	if err == nil {
		return http.StatusOK, "", ""
	}

	if errors.Is(err, store.ErrAlreadyExists) {
		return http.StatusConflict, "SKILL_VERSION_ALREADY_EXISTS", err.Error()
	}
	if errors.Is(err, store.ErrNotFound) {
		return http.StatusNotFound, "SKILL_VERSION_NOT_FOUND", err.Error()
	}
	if errors.Is(err, authz.ErrForbidden) {
		return http.StatusForbidden, "FORBIDDEN", err.Error()
	}

	msg := err.Error()
	if strings.Contains(msg, "invalid ") || strings.Contains(msg, "required") || strings.Contains(msg, "frontmatter") {
		return http.StatusBadRequest, "INVALID_ARGUMENT", msg
	}
	return http.StatusInternalServerError, "INTERNAL_ERROR", msg
}

func writeError(c interface{ JSON(int, any) }, err error) {
	status, code, message := mapError(err)
	c.JSON(status, errorResponse{Code: code, Message: message})
}
