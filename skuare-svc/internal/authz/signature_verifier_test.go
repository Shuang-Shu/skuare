package authz

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestSignatureVerify(t *testing.T) {
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatalf("generate key: %v", err)
	}
	tmpDir := t.TempDir()
	keysFile := filepath.Join(tmpDir, "authorized_keys")
	content := "writer:" + base64.StdEncoding.EncodeToString(pub) + "\n"
	if err := os.WriteFile(keysFile, []byte(content), 0o644); err != nil {
		t.Fatalf("write keys file: %v", err)
	}

	reg, err := LoadPublicKeyRegistry(keysFile)
	if err != nil {
		t.Fatalf("load registry: %v", err)
	}
	v := NewSignatureVerifier(reg)
	now := time.Unix(1_700_000_000, 0).UTC()
	v.now = func() time.Time { return now }

	body := []byte(`{"x":1}`)
	ts := "1700000000"
	nonce := "abc123"
	msg := CanonicalMessage("POST", "/api/v1/skills", body, ts, nonce)
	sig := ed25519.Sign(priv, msg)
	sigB64 := base64.StdEncoding.EncodeToString(sig)

	if err := v.Verify("POST", "/api/v1/skills", body, "writer", ts, nonce, sigB64); err != nil {
		t.Fatalf("verify should pass: %v", err)
	}
	if err := v.Verify("POST", "/api/v1/skills", body, "writer", ts, nonce, sigB64); err == nil {
		t.Fatalf("replay nonce should fail")
	}
	if err := v.Verify("POST", "/api/v1/skills", body, "unknown", ts, "n2", sigB64); err == nil {
		t.Fatalf("unknown key should fail")
	}
	if err := v.Verify("POST", "/api/v1/skills", body, "writer", "1", "n3", sigB64); err == nil {
		t.Fatalf("expired timestamp should fail")
	}
}
