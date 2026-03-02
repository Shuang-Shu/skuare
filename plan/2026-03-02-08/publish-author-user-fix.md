# Publish 作者字段回填修复计划

> 文档类型：PLAN
> 状态：进行中
> 当前节点状态：结束
> 更新时间：2026-03-02
> 适用范围：skuare-cli, skuare-svc, docs
> 日期分支：feat/2026-03-02
> 功能分支：feat/2026-03-02-publish-author-user-fix
> Worktree 目录：/home/shuangshu/study/code/demos/ts-demo/wt-2026-03-02-publish-author-user-fix
> 关联规格文件路径：spec/2026-03-02-08/publish-author-user-fix.md
> 关联计划文件路径：plan/2026-03-02-08/publish-author-user-fix.md

## 目标与范围
- 修复 `metadata.author` 在发布后未被服务端索引与查询接口保留的问题。
- 保持现有 CLI 输出结构兼容，同时让 `publish/list/peek` 直接展示真实作者。

## 架构与 API 设计
- `skuare-svc/internal/validator/skill.go`：从 `SKILL.md` frontmatter 解析 `metadata.author`，供发布和查询链路复用。
- `skuare-svc/internal/model/skill.go`、`skuare-svc/internal/store/fs_store.go`：在 `SkillEntry/SkillDetail/SkillOverview/Index` 中补充 `author` 字段，并在 `Create/List/GetSkill/GetVersion/Reindex` 过程中写入与返回。
- `skuare-cli/src/commands/write.ts`：`publish` 成功输出补充 `author` 字段。
- `skuare-svc/internal/store/fs_store_test.go`、`skuare-cli` 测试：新增发布后作者透传回归测试。
- `docs/tech_summary.md`、`docs/tech_summary_zh.md`：同步说明服务端已直接返回作者字段。

## 分阶段实施步骤
1. 输入=现有发布/查询链路代码 -> 在服务端模型、frontmatter 解析与 FS store 中补充作者字段读写，并让 `Create/List/GetSkill/GetVersion` 返回作者 -> 代码变更位置：`skuare-svc/internal/model/skill.go`、`skuare-svc/internal/validator/skill.go`、`skuare-svc/internal/store/fs_store.go` -> 输出=新发布数据持久化作者信息。
2. 输入=服务端返回作者字段 -> 调整 CLI `publish` 输出与必要展示逻辑，确保直接透传 `author` -> 代码变更位置：`skuare-cli/src/commands/write.ts`、`skuare-cli/src/commands/query.ts`（如需） -> 输出=CLI 输出不再依赖错误回退。
3. 输入=完成后的实现 -> 补充单测并执行全量构建/测试，更新技术说明文档 -> 代码变更位置：`skuare-svc/internal/store/fs_store_test.go`、`skuare-cli/src/*.test.ts`、`docs/tech_summary.md`、`docs/tech_summary_zh.md` -> 输出=验证记录完整且文档一致。

## 验收标准与风险
- 验收标准：`metadata.author` 存在时，`publish/list/peek` 返回作者不为 `undefined`；CLI 构建通过；Go 全量测试通过。
- 风险：旧索引文件不含作者字段时，历史数据短期内仍可能显示 `undefined`。
- 缓解：新数据立即落盘作者字段；保留 CLI 从 `files/SKILL.md` 解析作者的兜底。

## 分支与 Worktree 关联
- 日期分支：`feat/2026-03-02`
- 功能分支：`feat/2026-03-02-publish-author-user-fix`
- Worktree：`/home/shuangshu/study/code/demos/ts-demo/wt-2026-03-02-publish-author-user-fix`
- 目标合入分支：`feat/2026-03-02`
- 关联 PR：待创建
- 兼容说明：规则文档要求三层分支名，但仓库已存在 `feat/2026-03-02` 实分支，Git 无法创建 `feat/2026-03-02/<featName>`；本次采用仓库已存在的平铺命名方式。

## 开发中问题与解决
- 已知问题：服务端索引结构当前仅保存 `skill_id/version/name/description/path/updated_at`，缺少作者字段。
- 解决思路：将作者解析与索引写入放到服务端，避免 CLI 在 `list` 阶段无法获取 `SKILL.md` 内容时丢失作者。

## 结束回写
- 核心变更：服务端在发布、校验、重建索引链路解析并持久化 `SKILL.md metadata.author`，`publish/list/peek` 返回直接透出 `author`。
- 过程总结：根因是服务端索引模型缺少作者字段，CLI 只能依赖 `skill_id/files` 兜底，导致发布后作者回退为 `undefined`；本次已补模型、存储、OpenAPI、README 与回归测试。
- 后续优化：如需补齐历史数据，可执行一次 `reindex` 或补充离线迁移脚本，将旧索引中的作者字段重建出来。

## 需求设计
### Log
- [2026-03-02 08:16] 明确问题范围：`metadata.author` 已存在，但发布后查询结果仍回退为 `undefined`。
- [2026-03-02 08:18] 确认修复方向：服务端在发布与索引阶段保存作者，并让 CLI 直接消费返回字段。

## 开发 1
### Log
- [2026-03-02 08:18] 新建本次修复的 SPEC/PLAN，并记录分支命名与 worktree 约束。
- [2026-03-02 08:22] 完成服务端作者字段回填：`FSStore` 在 Create/Validate/Reindex 中解析 `SKILL.md metadata.author`，并写入 `SkillEntry/SkillOverview/SkillDetail`。
- [2026-03-02 08:23] 完成 CLI 展示修复：`publish` 成功输出补充 `author`，`peek <skillID>` 改为优先使用服务端返回的 `author`。
- [2026-03-02 08:23] 完成文档与契约同步：更新 `openapi.yaml`、CLI README、SVC README 与技术说明中的作者字段说明。

## 验收 1
### Log
- [2026-03-02 08:18] 待开发完成后补充单测通过记录与用户验收结论。
- [2026-03-02 08:24] 单测通过记录：`cd skuare-cli && npm run check` 通过；`cd skuare-cli && npm run build` 通过；`cd skuare-cli && npm test` 通过；`cd skuare-svc && go test ./...` 全量通过；`cd skuare-svc && go build ./...` 通过。
- [2026-03-02 08:24] 用户验收结论：代码修复与回归验证已完成，待用户确认“publish 后作者字段不再回退为 undefined”是否满足预期。

## 开发 2（如需）
### Log
- [2026-03-02 08:18] 预留。

## 验收 2（如需）
### Log
- [2026-03-02 08:18] 预留。

## 结束（仅在用户明确同意后填写）
### Log
- [2026-03-02 08:26] 用户同意结束：“符合预期”
