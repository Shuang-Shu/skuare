package authz

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"os"
	"path/filepath"
	"testing"
)

func TestLoadPublicKeyRegistryAndGet(t *testing.T) {
	tmpDir := t.TempDir()
	keysFile := filepath.Join(tmpDir, "authorized_pubkeys")
	pubA, _, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatalf("generate key: %v", err)
	}
	pubB, _, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatalf("generate key: %v", err)
	}
	content := "# comments are ignored\n\n" +
		"key-a:" + base64.StdEncoding.EncodeToString(pubA) + "\n" +
		"key-b:" + base64.StdEncoding.EncodeToString(pubB) + "\n"
	if err := os.WriteFile(keysFile, []byte(content), 0o644); err != nil {
		t.Fatalf("write keys file: %v", err)
	}

	reg, err := LoadPublicKeyRegistry(keysFile)
	if err != nil {
		t.Fatalf("load registry: %v", err)
	}
	got, ok := reg.GetPublicKey("key-a")
	if !ok {
		t.Fatalf("expected key-a to exist")
	}
	if string(got) != string(pubA) {
		t.Fatalf("unexpected pubkey value")
	}
}

func TestLoadPublicKeyRegistryFileNotFound(t *testing.T) {
	reg, err := LoadPublicKeyRegistry(filepath.Join(t.TempDir(), "missing"))
	if err != nil {
		t.Fatalf("expected missing file to be allowed, got err=%v", err)
	}
	if _, ok := reg.GetPublicKey("key-a"); ok {
		t.Fatalf("expected empty registry")
	}
}
