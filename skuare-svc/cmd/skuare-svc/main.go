package main

import (
	"log"
	"time"

	"skuare-svc/internal/authz"
	"skuare-svc/internal/config"
	internalhttp "skuare-svc/internal/http"
	"skuare-svc/internal/service"
	"skuare-svc/internal/store"
)

func main() {
	cfg := config.Load()

	fsStore, err := store.NewFSStore(cfg.SpecDir)
	if err != nil {
		log.Fatalf("init fs store failed: %v", err)
	}
	svc := service.NewSkillService(fsStore)
	var writeAuthorizer authz.WriteAuthorizer
	if cfg.LocalMode {
		writeAuthorizer = authz.NewAllowAllVerifier()
		log.Printf("LOCAL MODE ENABLED - DO NOT USE IN PRODUCTION")
	} else {
		authzReg, err := authz.LoadPublicKeyRegistry(cfg.AuthorizedKeysFile)
		if err != nil {
			log.Fatalf("load authorized public keys failed: %v", err)
		}
		writeAuthorizer = authz.NewSignatureVerifierWithMaxSkew(authzReg, time.Duration(cfg.AuthMaxSkewSec)*time.Second)
	}

	h := internalhttp.NewServer(cfg.Addr, svc, writeAuthorizer, cfg.LocalMode)
	log.Printf(
		"skuare-svc listening on %s, spec_dir=%s, authorized_keys_file=%s, local_mode=%v, auth_max_skew_sec=%d",
		cfg.Addr,
		cfg.SpecDir,
		cfg.AuthorizedKeysFile,
		cfg.LocalMode,
		cfg.AuthMaxSkewSec,
	)
	h.Spin()
}
