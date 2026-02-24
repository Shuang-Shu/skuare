SHELL := /bin/sh

ADDR ?= 127.0.0.1:15657
LOCAL_MODE ?= true
SPEC_DIR ?= $(HOME)/.skuare/skills
GOCACHE ?= /tmp/go-cache-skuare
AUTHORIZED_KEYS_FILE ?=
AUTH_MAX_SKEW_SEC ?= 300
BE_ARGS ?=
SERVER ?= http://127.0.0.1:15657
KEY_ID ?=
PRIVKEY_FILE ?=
CLI_ARGS ?= help
Q ?=
SKILL_ID ?=
VERSION ?=
FILE ?=
SKILL_FILE ?=
SKILL_DIR ?=
LOCAL_BIN ?= /tmp/skuare-bin/bin
RELEASE_REPO ?=
SVC_VERSION ?= latest

.PHONY: help start-be start-cli install-skr install-backend health reindex list get create delete validate

help:
	@echo "Available targets:"
	@echo "  make start-be [ADDR=host:port] [LOCAL_MODE=true|false] [SPEC_DIR=$(HOME)/.skuare/skills]"
	@echo "                 [AUTHORIZED_KEYS_FILE=path] [AUTH_MAX_SKEW_SEC=300] [BE_ARGS='--xxx ...']"
	@echo "  make start-cli                 # 启动 CLI（默认 help）"
	@echo "  make start-cli CLI_ARGS='...'  # 传入 CLI 参数"
	@echo "  make install-skr               # 注册 skr 到本地 bin"
	@echo "  make install-backend RELEASE_REPO=owner/repo [SVC_VERSION=v0.1.0]"
	@echo "  make <write-op> KEY_ID=... PRIVKEY_FILE=...  # 写操作需提供签名参数"
	@echo "  make health                    # 健康检查"
	@echo "  make reindex                   # 重建索引"
	@echo "  make list Q='kw'               # 查询 skills"
	@echo "  make get SKILL_ID=... [VERSION=...]"
	@echo "  make create FILE=...                            # 从 JSON 创建"
	@echo "  make create SKILL_FILE=... [SKILL_ID=...] [VERSION=...] # 从 SKILL.md 创建（version 读 frontmatter）"
	@echo "  make create SKILL_DIR=... [SKILL_ID=...] [VERSION=...]  # 从目录创建（自动找 SKILL.md）"
	@echo "  make delete SKILL_ID=... VERSION=..."
	@echo "  make validate SKILL_ID=... VERSION=..."

start-be:
	cd skuare-svc && GOCACHE=$(GOCACHE) SKUARE_LOCAL_MODE=$(LOCAL_MODE) go run ./cmd/skuare-svc --addr $(ADDR) --spec-dir $(abspath $(SPEC_DIR)) --local $(LOCAL_MODE) $(if $(AUTHORIZED_KEYS_FILE),--authorized-keys-file $(AUTHORIZED_KEYS_FILE),) --auth-max-skew-sec $(AUTH_MAX_SKEW_SEC) $(BE_ARGS)

start-cli:
	cd skuare-cli && npm run build && node dist/index.js --server $(SERVER) $(if $(KEY_ID),--key-id '$(KEY_ID)',) $(if $(PRIVKEY_FILE),--privkey-file '$(PRIVKEY_FILE)',) $(CLI_ARGS)

install-skr:
	mkdir -p $(LOCAL_BIN)
	chmod +x ./skr
	ln -sf $(abspath ./skr) $(LOCAL_BIN)/skr
	@echo "skr installed at: $(LOCAL_BIN)/skr"
	@echo "Add to PATH if needed: export PATH=$(LOCAL_BIN):\$$PATH"

install-backend:
	@if [ -z "$(RELEASE_REPO)" ]; then echo "RELEASE_REPO is required (owner/repo)"; exit 2; fi
	cd skuare-cli && SKUARE_AUTO_INSTALL_BACKEND=1 SKUARE_RELEASE_REPO=$(RELEASE_REPO) SKUARE_SVC_VERSION=$(SVC_VERSION) npm run install-backend

health:
	$(MAKE) start-cli CLI_ARGS="health"

reindex:
	$(MAKE) start-cli CLI_ARGS="reindex"

list:
	$(MAKE) start-cli CLI_ARGS="list $(if $(Q),--q '$(Q)',)"

get:
	@if [ -z "$(SKILL_ID)" ]; then echo "SKILL_ID is required"; exit 2; fi
	$(MAKE) start-cli CLI_ARGS="get $(SKILL_ID) $(VERSION)"

create:
	@if [ -n "$(FILE)" ]; then \
		$(MAKE) start-cli CLI_ARGS="create --file $(FILE)"; \
	elif [ -n "$(SKILL_FILE)" ]; then \
		$(MAKE) start-cli CLI_ARGS="create --skill $(SKILL_FILE) $(if $(VERSION),--version $(VERSION),) $(if $(SKILL_ID),--skill-id $(SKILL_ID),)"; \
	elif [ -n "$(SKILL_DIR)" ]; then \
		$(MAKE) start-cli CLI_ARGS="create --dir $(SKILL_DIR) $(if $(VERSION),--version $(VERSION),) $(if $(SKILL_ID),--skill-id $(SKILL_ID),)"; \
	else \
		echo "one of FILE / SKILL_FILE / SKILL_DIR is required"; \
		exit 2; \
	fi

delete:
	@if [ -z "$(SKILL_ID)" ] || [ -z "$(VERSION)" ]; then echo "SKILL_ID and VERSION are required"; exit 2; fi
	$(MAKE) start-cli CLI_ARGS="delete $(SKILL_ID) $(VERSION)"

validate:
	@if [ -z "$(SKILL_ID)" ] || [ -z "$(VERSION)" ]; then echo "SKILL_ID and VERSION are required"; exit 2; fi
	$(MAKE) start-cli CLI_ARGS="validate $(SKILL_ID) $(VERSION)"
