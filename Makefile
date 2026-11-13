.DEFAULT_GOAL := help

SG_HOST ?= sg
SG_SSH ?= ssh
SG_NAME := humanity-test
SG_RELEASES := /srv/h5/releases/$(SG_NAME)
SG_CURRENT := /srv/h5/current/$(SG_NAME)
SG_URL := https://h5.cidychou.com/$(SG_NAME)/
PORT ?= 8765

.PHONY: help dev sg

help: ## 显示全部 Make 命令和说明
	@echo "HUMAN/01 人类还有希望吗"
	@echo "用法：make <命令>"
	@awk 'BEGIN { FS = ":.*##" } /^[a-zA-Z0-9_-]+:.*##/ { printf "  %-14s %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

dev: ## 本地启动（默认端口 8765，可用 PORT=xxxx 覆盖）
	@./start.sh $(PORT)

sg: ## 部署静态页面到新加坡（https://h5.cidychou.com/humanity-test/，无需构建）
	@set -eu; \
	work=$$(mktemp -d); \
	trap 'rm -rf "$$work"' EXIT; \
	version=$$(date +%Y%m%d%H%M%S); \
	cp index.html "$$work/index.html.original"; \
	mkdir "$$work/site"; \
	tar --exclude=.git --exclude=Makefile --exclude=README.md --exclude=start.sh \
	    --exclude=.gitignore --exclude='*-shots' --exclude=node_modules --exclude=tests \
	    --exclude=.task-refs --exclude=TASK_OUTPUT.md --exclude=.agents --exclude=.codex --exclude=.aws \
	    -cf - . | tar -xf - -C "$$work/site"; \
	find "$$work/site" \( -name '.DS_Store' -o -name '._*' -o -name '*.map' \) -delete; \
	test -s "$$work/site/index.html"; \
	sed -E "s@(href|src)=\"(v31\\.css|questions\\.js|ai-demo\\.js)(\\?v=[^\"]*)?\"@\1=\"\2?v=$$version\"@g" \
	    "$$work/site/index.html" > "$$work/index.html.versioned"; \
	mv "$$work/index.html.versioned" "$$work/site/index.html"; \
	for asset in v31.css questions.js ai-demo.js; do \
	    grep -Fq "$$asset?v=$$version\"" "$$work/site/index.html"; \
	done; \
	cmp -s index.html "$$work/index.html.original"; \
	COPYFILE_DISABLE=1 tar -czf "$$work/site.tar.gz" -C "$$work/site" .; \
	$(SG_SSH) -T "$(SG_HOST)" 'set -eu; \
		sudo -n mkdir -p "$(SG_RELEASES)"; \
		release=$$(sudo -n mktemp -d "$(SG_RELEASES)/$$(date -u +%Y%m%dT%H%M%SZ)-XXXXXX"); \
		sudo -n tar -xzf - --no-same-owner -C "$$release"; \
		sudo -n chmod -R u=rwX,go=rX "$$release"; \
		test -s "$$release/index.html"; \
		sudo -n ln -s "$$release" "$$release/.current"; \
		sudo -n mv -Tf "$$release/.current" "$(SG_CURRENT)"' < "$$work/site.tar.gz"; \
	printf '已部署 %s\n' "$(SG_URL)"
