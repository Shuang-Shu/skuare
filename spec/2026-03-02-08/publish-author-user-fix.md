# Publish 作者字段回填修复规格

> 文档类型：SPEC
> 状态：进行中
> 更新时间：2026-03-02
> 适用范围：skuare-cli, skuare-svc, docs
> 关联计划文件路径：plan/2026-03-02-08/publish-author-user-fix.md

## 背景与目标
- 当前技能发布后，若 `SKILL.md` 中已填写 `metadata.author`，后续查询结果仍可能显示 `author/user=undefined`。
- 需要保证发布链路能够保留作者信息，并在 `list/peek/publish` 相关返回结果中稳定回传，避免展示层错误回退为 `undefined`。

## 需求范围
- 修复发布后作者信息未进入服务端索引与返回体的问题。
- 保证 `skuare-cli` 在 `list/peek` 场景能直接消费服务端返回的作者字段，而非仅依赖 `skill_id` 推断。
- 补充回归测试，覆盖 `publish -> list -> peek` 的作者字段行为。
- 同步更新相关技术说明文档。

## 非目标
- 不调整 `skill_id` 命名规则。
- 不引入新的鉴权/用户体系；本次仅修复已有 `metadata.author` 的透传与展示。
- 不修改 `get/build/format` 的交互流程。

## 用户验收标准与风险
- 当 `SKILL.md metadata.author` 存在时，发布后 `list` 与 `peek` 输出中的作者字段不再回退为 `undefined`。
- `publish` 成功返回结果中包含作者字段，便于调用方立即确认落库内容。
- 风险：服务端索引结构新增字段后，旧数据在未重建索引前仍可能缺作者。
- 缓解：保留 CLI 的回退逻辑，并确保新发布数据立即写入作者字段。

## 需求优化建议
- 建议后续统一术语，只保留 `author`，避免业务侧再将其称为 `user`，减少接口歧义。
- 建议后续为历史仓库增加一次性 `reindex`/迁移说明，补齐旧技能索引中的作者字段。
