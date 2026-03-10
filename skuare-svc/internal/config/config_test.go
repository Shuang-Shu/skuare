package config

import (
	"flag"
	"os"
	"path/filepath"
	"testing"
)

func TestLoadDefaultsToSkuareSkillsRoot(t *testing.T) {
	oldArgs := os.Args
	oldCommandLine := flag.CommandLine
	t.Cleanup(func() {
		os.Args = oldArgs
		flag.CommandLine = oldCommandLine
	})

	tmpHome := t.TempDir()
	t.Setenv("HOME", tmpHome)
	t.Setenv("SKUARE_SPEC_DIR", "")
	t.Setenv("SKUARE_AUTHORIZED_KEYS_FILE", "")
	t.Setenv("SKUARE_LOCAL_MODE", "")
	t.Setenv("SKUARE_AUTH_MAX_SKEW_SEC", "")
	os.Args = []string{"skuare-svc-test"}
	flag.CommandLine = flag.NewFlagSet(os.Args[0], flag.ContinueOnError)

	cfg := Load()

	wantSpecDir := filepath.Join(tmpHome, ".skuare", "skills")
	if cfg.SpecDir != wantSpecDir {
		t.Fatalf("SpecDir=%q, want=%q", cfg.SpecDir, wantSpecDir)
	}
	wantAuthorizedKeys := filepath.Join(wantSpecDir, SystemDirName, AuthorizedKeysRel)
	if cfg.AuthorizedKeysFile != wantAuthorizedKeys {
		t.Fatalf("AuthorizedKeysFile=%q, want=%q", cfg.AuthorizedKeysFile, wantAuthorizedKeys)
	}
}
