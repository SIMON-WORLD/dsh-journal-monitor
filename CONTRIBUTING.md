# 贡献指南（dsh-journal-monitor）

感谢贡献！本仓库的每个功能都对应**可验证的真实能力**——不是文档、不是承诺。

## 硬性纪律（来自多 Agent 审计裁定）

1. **诚实化**：README 只列已实现 + 状态标注（可用/原型）。禁止写「支持 XX」但实际没有。
2. **可验证**：每个改动必须带验证证据，在 PR 描述写明：
   - 代码改动 → `npm run check` + `npm test`
   - 数据源改动 → `node scripts/verify-live.mjs`（真实抓取 HTTP 200 + 可解析）
   - 工具改动 → 注册探针（ctx.tools.register 打印）
3. **最小闭环**：scan → filter → push → status → rollback 闭环完整才算完成，不交半截。
4. **门禁后发布**：README 门禁清单全绿才发版；不铺开，一次一个功能。
5. **真插件不做 skill**：这是带代码的 cordis 插件，不是 SKILL.md。

## 怎么贡献

### 1. 新期刊源

- 改 `src/index.ts` 的 `DEFAULT_SOURCES` 或文档 `docs/10-sources.md`；
- **必须验证**：`node scripts/verify-live.mjs` 通过（该源 HTTP 200 + 可解析）；
- 优先经济学/经管向源（NBER/RePEc/AER/QJE/arXiv econ），中文源（CNKI 经管）走 `docs/20-cn-journals.md` 规划。

### 2. 新工具

- 目录：`src/index.ts` 内 `ctx.tools.register(defineTool({...}))`；
- 必须包含：parameters + output.schema + render + execute；
- 必须补单测（`tests/`）或探针脚本。

### 3. 文档

- 目录：`docs/`，命名 `NN-<english-slug>.md`；
- 内容必须有来源（URL）或验证记录，不写无依据的经验。

### 4. Bug 修复 / 改进

- 小改动直接 PR；大改动先开 Issue 讨论；
- 附环境 + 复现 + 根因。

## 提交规范

- 提交作者用 noreply 邮箱；PR 可带 `Co-Authored-By` 尾注；
- 不提交凭据（Bark/飞书 token 只走环境变量 `DSH_BARK_URL` / `DSH_FEISHU_URL`）；
- 中文文档为主，代码注释中文。

## 本地验证命令

```bash
npm install
npm run check    # typecheck
npm run build    # 构建 lib/
npm test         # 单测
node scripts/verify-live.mjs   # 真实抓取探针（需要联网）
```
