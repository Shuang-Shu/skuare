package authz

import "testing"

func TestAllowAllVerifier(t *testing.T) {
	v := NewAllowAllVerifier()
	if err := v.Verify("POST", "/api/v1/skills", []byte("{}"), "", "", "", ""); err != nil {
		t.Fatalf("allow-all verifier should always pass: %v", err)
	}
}
