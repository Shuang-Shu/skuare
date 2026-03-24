SHELL := /bin/sh

ADDR ?= 127.0.0.1:15657
LOCAL_MODE ?= true
DAEMON ?= false
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
PREFIX ?= /usr/local
BINDIR ?= $(if $(LOCAL_BIN),$(LOCAL_BIN),$(PREFIX)/bin)
LOCAL_BIN ?=
RELEASE_REPO ?=
SVC_VERSION ?= latest

.PHONY: help start-be stop-be start-cli install install-cli-deps install-svc-deps install-link install-skr install-backend health list peek get publish create format delete validate

help:
	@echo "Available targets:"
	@echo "  make start-be [ADDR=host:port] [LOCAL_MODE=true|false] [SPEC_DIR=$(HOME)/.skuare/skills]"
	@echo "                 [AUTHORIZED_KEYS_FILE=path] [AUTH_MAX_SKEW_SEC=300] [DAEMON=true|false] [BE_ARGS='--xxx ...']"
	@echo "  make stop-be                   # 停止后台守护的 skuare-svc"
	@echo "  make start-cli                 # 启动 CLI（默认 help）"
	@echo "  make start-cli CLI_ARGS='...'  # 传入 CLI 参数"
	@echo "  make install                   # 安装前后端依赖并将 skr 链接到 Linux 默认可执行目录"
	@echo "  make install-skr               # 兼容别名：仅注册链接目标名已迁移到 make install"
	@echo "  make install-backend RELEASE_REPO=owner/repo [SVC_VERSION=v0.1.0]"
	@echo "  make <write-op> KEY_ID=... PRIVKEY_FILE=...  # 写操作需提供签名参数"
	@echo "  make health                    # 健康检查"
	@echo "  make list Q='kw'               # 查询 skills"
	@echo "  make peek SKILL_ID=... [VERSION=...]"
	@echo "  make get SKILL_ID=... [VERSION=...] [CLI_ARGS='--scope workspace']"
	@echo "  make publish FILE=...                           # 从 JSON 发布"
	@echo "  make publish SKILL_FILE=... [SKILL_ID=...] [VERSION=...] # 从 SKILL.md 发布（version 读 frontmatter）"
	@echo "  make publish SKILL_DIR=... [SKILL_ID=...] [VERSION=...]  # 从目录发布（自动找 SKILL.md）"
	@echo "  make create ...                                 # publish 兼容别名（已弃用）"
	@echo "  make format FILE='path1 path2'                  # 交互式格式化指定技能目录"
	@echo "  make format                                     # 交互式格式化当前目录下技能"
	@echo "  make delete SKILL_ID=... VERSION=..."
	@echo "  make validate SKILL_ID=... VERSION=..."

install: install-cli-deps install-svc-deps install-link

install-cli-deps:
	@command -v npm >/dev/null 2>&1 || { echo "npm is required but was not found in PATH"; exit 2; }
	cd skuare-cli && npm install

install-svc-deps:
	@command -v go >/dev/null 2>&1 || { echo "go is required but was not found in PATH"; exit 2; }
	cd skuare-svc && GOCACHE=$(GOCACHE) go mod download

install-link:
	mkdir -p $(BINDIR)
	chmod +x ./skr
	ln -sf $(abspath ./skr) $(BINDIR)/skr
	@echo "skr installed at: $(BINDIR)/skr"
	@echo "Default Linux install dir is $(PREFIX)/bin; override with PREFIX=/path or BINDIR=/path if needed"
	@echo "If $(BINDIR) is not writable, rerun with sudo or use a writable BINDIR"

start-be:
	@if [ "$(DAEMON)" = "true" ]; then \
		ADDR="$(ADDR)" LOCAL_MODE="$(LOCAL_MODE)" SPEC_DIR="$(SPEC_DIR)" GOCACHE="$(GOCACHE)" AUTHORIZED_KEYS_FILE="$(AUTHORIZED_KEYS_FILE)" AUTH_MAX_SKEW_SEC="$(AUTH_MAX_SKEW_SEC)" BE_ARGS="$(BE_ARGS)" ./scripts/dev-up.sh; \
	else \
		cd skuare-svc && GOCACHE=$(GOCACHE) SKUARE_LOCAL_MODE=$(LOCAL_MODE) go run ./cmd/skuare-svc --addr $(ADDR) --spec-dir $(abspath $(SPEC_DIR)) --local $(LOCAL_MODE) $(if $(AUTHORIZED_KEYS_FILE),--authorized-keys-file $(AUTHORIZED_KEYS_FILE),) --auth-max-skew-sec $(AUTH_MAX_SKEW_SEC) $(BE_ARGS); \
	fi

stop-be:
	@./scripts/dev-down.sh

start-cli:
	cd skuare-cli && npm run build && node dist/index.js --server $(SERVER) $(if $(KEY_ID),--key-id '$(KEY_ID)',) $(if $(PRIVKEY_FILE),--privkey-file '$(PRIVKEY_FILE)',) $(CLI_ARGS)

install-skr:
	@$(MAKE) install

install-backend:
	@if [ -z "$(RELEASE_REPO)" ]; then echo "RELEASE_REPO is required (owner/repo)"; exit 2; fi
	cd skuare-cli && SKUARE_AUTO_INSTALL_BACKEND=1 SKUARE_RELEASE_REPO=$(RELEASE_REPO) SKUARE_SVC_VERSION=$(SVC_VERSION) npm run install-backend

health:
	$(MAKE) start-cli CLI_ARGS="health"

list:
	$(MAKE) start-cli CLI_ARGS="list $(if $(Q),--q '$(Q)',)"

peek:
	@if [ -z "$(SKILL_ID)" ]; then echo "SKILL_ID is required"; exit 2; fi
	$(MAKE) start-cli CLI_ARGS="peek $(SKILL_ID) $(VERSION)"

get:
	@if [ -z "$(SKILL_ID)" ]; then echo "SKILL_ID is required"; exit 2; fi
	$(MAKE) start-cli CLI_ARGS="get $(SKILL_ID) $(VERSION)"

publish:
	@if [ -n "$(FILE)" ]; then \
		$(MAKE) start-cli CLI_ARGS="publish --file $(FILE)"; \
	elif [ -n "$(SKILL_FILE)" ]; then \
		$(MAKE) start-cli CLI_ARGS="publish --skill $(SKILL_FILE) $(if $(VERSION),--version $(VERSION),) $(if $(SKILL_ID),--skill-id $(SKILL_ID),)"; \
	elif [ -n "$(SKILL_DIR)" ]; then \
		$(MAKE) start-cli CLI_ARGS="publish --dir $(SKILL_DIR) $(if $(VERSION),--version $(VERSION),) $(if $(SKILL_ID),--skill-id $(SKILL_ID),)"; \
	else \
		echo "one of FILE / SKILL_FILE / SKILL_DIR is required"; \
		exit 2; \
	fi

create:
	$(MAKE) publish FILE="$(FILE)" SKILL_FILE="$(SKILL_FILE)" SKILL_DIR="$(SKILL_DIR)" SKILL_ID="$(SKILL_ID)" VERSION="$(VERSION)"

delete:
	@if [ -z "$(SKILL_ID)" ] || [ -z "$(VERSION)" ]; then echo "SKILL_ID and VERSION are required"; exit 2; fi
	$(MAKE) start-cli CLI_ARGS="delete $(SKILL_ID) $(VERSION)"

validate:
	@if [ -z "$(SKILL_ID)" ] || [ -z "$(VERSION)" ]; then echo "SKILL_ID and VERSION are required"; exit 2; fi
	$(MAKE) start-cli CLI_ARGS="validate $(SKILL_ID) $(VERSION)"
format:
	$(MAKE) start-cli CLI_ARGS="format $(FILE)"
