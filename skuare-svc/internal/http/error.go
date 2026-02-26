package http

import (
	"errors"
	"net/http"

	"skuare-svc/internal/store"
	"skuare-svc/internal/util"
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
		return http.StatusConflict, util.ErrCodeSkillVersionAlreadyExists, err.Error()
	}
	if errors.Is(err, store.ErrNotFound) {
		return http.StatusNotFound, util.ErrCodeSkillVersionNotFound, err.Error()
	}
	if errors.Is(err, util.ErrForbidden) {
		return http.StatusForbidden, util.ErrCodeForbidden, err.Error()
	}

	msg := err.Error()
	if util.IsInvalidArgumentError(err) {
		return http.StatusBadRequest, util.ErrCodeInvalidArgument, msg
	}
	return http.StatusInternalServerError, util.ErrCodeInternalError, msg
}

func writeError(c interface{ JSON(int, any) }, err error) {
	status, code, message := mapError(err)
	c.JSON(status, errorResponse{Code: code, Message: message})
}
