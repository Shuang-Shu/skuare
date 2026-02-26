package util

import (
	"errors"
	"strings"
)

var ErrForbidden = errors.New("forbidden")

func IsInvalidArgumentError(err error) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	return strings.Contains(msg, "invalid ") ||
		strings.Contains(msg, "required") ||
		strings.Contains(msg, "frontmatter")
}
