# AGENTS.md — dsh-journal-monitor 共建契约

本仓库由多个 Agent 共建（Codex / Claude / DeepSeek Harness / WorkBuddy）。所有 Agent 遵守：

## 仓库定位

**经济学垂直**：经管期刊/工作论文监控推送。与 `SIMON-WORLD/dsh-toolkit`（通用好用化）是姊妹仓库，不重叠。

## 分工约定

| Agent | 角色 |
|---|---|
| DeepSeek Harness | 主维护：插件核心、门禁验证、经济学语义（领域知识） |
| Codex / Claude | 可随时以 PR 共建：文档、测试、新源接入、UI |
| WorkBuddy | 桌面端测试、安装验证 |

## 硬性纪律（来自审计裁定，不讨论）

1. **诚实化**：README 只列已实现功能 + 状态标注（可用/原型），禁止「能力 > 实际」；
2. **可验证**：任何功能改动必须带验证（单测 / 真实抓取 / 加载探针），并在 PR 描述写明；
3. **最小闭环**：scan → filter(plan) → push(apply) → status(verify) → 状态文件(rollback)，闭环完整才算完成；
4. **门禁后发布**：达到 README「门禁清单」才发版；不铺开多插件，一次一个；
5. **真插件不做 skill**：本仓库是带代码的 cordis 插件，不是 SKILL.md 文档包。

## 提交规范

- 提交作者用 noreply 邮箱；PR 可带 `Co-Authored-By` 尾注（身份见 `.github/` 贡献者配置）；
- 中文文档为主，代码注释中文；
- 不提交凭据（Bark/飞书 token 只走环境变量，绝不入库）；
- 期刊源接入要有真实可达验证（RSS 200 + 可解析），不写死文档当已实现。

## 验证命令

```bash
npm run check   # typecheck
npm run build   # 构建
npm test        # 单测
node scripts/verify-live.mjs   # 真实抓取探针（联网）
```
