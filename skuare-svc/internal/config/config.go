package config

import (
	"flag"
	"os"
	"path/filepath"
	"strconv"
)

const DefaultMaxRequestBodySize = 64 << 20

type Config struct {
	Addr               string
	SpecDir            string
	AuthorizedKeysFile string
	LocalMode          bool
	AuthMaxSkewSec     int
	MaxRequestBodySize int
}

func Load() Config {
	cfg := Config{}

	defaultAddr := os.Getenv("SKUARE_SVC_ADDR")
	if defaultAddr == "" {
		defaultAddr = DefaultAddr
	}

	wd, err := os.Getwd()
	if err != nil {
		wd = "."
	}
	defaultSpecDir := os.Getenv("SKUARE_SPEC_DIR")
	if defaultSpecDir == "" {
		home, homeErr := os.UserHomeDir()
		if homeErr == nil && home != "" {
			defaultSpecDir = filepath.Join(home, ".skuare", "skills")
		} else {
			defaultSpecDir = filepath.Join(wd, ".skuare", "skills")
		}
	}

	flag.StringVar(&cfg.Addr, "addr", defaultAddr, "HTTP listen address")
	flag.StringVar(&cfg.SpecDir, "spec-dir", defaultSpecDir, "Remote repository root directory")
	defaultAuthorizedKeys := os.Getenv("SKUARE_AUTHORIZED_KEYS_FILE")
	flag.StringVar(&cfg.AuthorizedKeysFile, "authorized-keys-file", defaultAuthorizedKeys, "Registered public keys file path")
	defaultLocalMode := envBool(os.Getenv("SKUARE_LOCAL_MODE"))
	flag.BoolVar(&cfg.LocalMode, "local", defaultLocalMode, "Enable local mode (bypass write signature verification)")
	defaultAuthMaxSkewSec := 300
	if raw := os.Getenv("SKUARE_AUTH_MAX_SKEW_SEC"); raw != "" {
		if v, err := strconv.Atoi(raw); err == nil && v > 0 {
			defaultAuthMaxSkewSec = v
		}
	}
	defaultMaxRequestBodySize := DefaultMaxRequestBodySize
	if raw := os.Getenv("SKUARE_MAX_REQUEST_BODY_SIZE_BYTES"); raw != "" {
		if v, err := strconv.Atoi(raw); err == nil && v > 0 {
			defaultMaxRequestBodySize = v
		}
	}
	flag.IntVar(&cfg.AuthMaxSkewSec, "auth-max-skew-sec", defaultAuthMaxSkewSec, "Max allowed signature timestamp skew in seconds")
	flag.IntVar(&cfg.MaxRequestBodySize, "max-request-body-size-bytes", defaultMaxRequestBodySize, "Max allowed HTTP request body size in bytes")
	flag.Parse()

	cfg.SpecDir = filepath.Clean(cfg.SpecDir)
	if cfg.AuthorizedKeysFile == "" {
		cfg.AuthorizedKeysFile = filepath.Join(cfg.SpecDir, SystemDirName, AuthorizedKeysRel)
	}
	cfg.AuthorizedKeysFile = filepath.Clean(cfg.AuthorizedKeysFile)
	if cfg.AuthMaxSkewSec <= 0 {
		cfg.AuthMaxSkewSec = 300
	}
	if cfg.MaxRequestBodySize <= 0 {
		cfg.MaxRequestBodySize = DefaultMaxRequestBodySize
	}
	return cfg
}
