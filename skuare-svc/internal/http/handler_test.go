package http

import (
	"errors"
	"testing"

	"github.com/cloudwego/hertz/pkg/app"

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
