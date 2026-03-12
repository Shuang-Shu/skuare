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
	agentsmdSvc := service.NewAgentsMDService(fsStore)
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

	h := internalhttp.NewServer(cfg.Addr, svc, agentsmdSvc, writeAuthorizer, cfg.LocalMode, cfg.MaxRequestBodySize)
	log.Printf(
		"skuare-svc listening on %s, spec_dir=%s, authorized_keys_file=%s, local_mode=%v, auth_max_skew_sec=%d, max_request_body_size=%d",
		cfg.Addr,
		cfg.SpecDir,
		cfg.AuthorizedKeysFile,
		cfg.LocalMode,
		cfg.AuthMaxSkewSec,
		cfg.MaxRequestBodySize,
	)
	h.Spin()
}
