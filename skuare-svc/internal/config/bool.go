package config

import (
	"strconv"
	"strings"
)

func envBool(name string) bool {
	raw := strings.TrimSpace(strings.ToLower(name))
	if raw == "" {
		return false
	}
	if raw == "on" || raw == "yes" {
		return true
	}
	b, err := strconv.ParseBool(raw)
	if err != nil {
		return false
	}
	return b
}
