# dsh-journal-monitor — 经管期刊/工作论文监控推送插件

> 让 DeepSeek Harness (dsh) 帮你盯着 NBER / arXiv 经济学的新论文：抓取 → 关键词过滤 → 摘要 → 推送（Bark/飞书/Dry-run）→ 去重持久化。

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![dsh-plugin](https://img.shields.io/badge/ecosystem-dsh--plugin-orange)](https://github.com/topics/dsh-plugin)

> **⚠️ 状态（诚实声明）**：v0.1.0 = 可用原型。已实现并实测：RSS 抓取（NBER 真实 42 条 ✓）、关键词过滤（✓ 单测）、工具注册（4 工具 ✓）、dry-run 推送（✓）、去重持久化（✓）。**未实现**：真实 Bark/飞书推送（代码有，需配置 webhook 后验证）、Web/UI 端到端验收、定时调度（计划接 dsh-schedule）。

## 为什么是真插件，不是 skill

| | Skill | 本插件 |
|---|---|---|
| 抓取 RSS | ❌ 只能教你怎么抓 | ✅ 真代码 `journal_scan` 直接抓 |
| 定时推送 | ❌ 做不到 | ✅ 计划接 dsh-schedule（every/at） |
| 去重持久化 | ❌ 做不到 | ✅ 状态文件 JSONL 去重 |
| 关键词过滤 | 文本建议 | ✅ `journal_filter` 真过滤 |

## 安装

```sh
# 方式一：装进现有 profile
dsh plugin --profile web add git+https://github.com/SIMON-WORLD/dsh-journal-monitor.git

# 方式二：headless
dsh plugin --profile headless add git+https://github.com/SIMON-WORLD/dsh-journal-monitor.git
```

重启 dsh 后，模型自动获得 4 个工具：`journal_scan` / `journal_filter` / `journal_push` / `journal_status`。

## 快速使用

对话里直接说人话：

1. **抓**：`journal_scan`（默认源：NBER Working Papers + arXiv Economics；可传 `sourceUrl` 抓任意 RSS）
2. **筛**：`journal_filter`（关键词如 `["china","trade","labor","did"]`，标题+摘要子串匹配，大小写不敏感）
3. **推**：`journal_push`（默认 dry-run 只记录；配 webhook 后真实推送）
4. **查**：`journal_status`（已推送记录 + 去重依据）

```text
用 journal_scan 抓最新 NBER 论文，用 journal_filter 筛出含 "china" 或 "trade" 的，
再用 journal_push 推送（dry-run），最后 journal_status 看看记录。
```

## 真实推送配置

| 环境变量 | 说明 |
|---|---|
| `DSH_BARK_URL` | Bark 推送 URL（例 `https://api.day.app/TOKEN/`），设置即启用 |
| `DSH_FEISHU_URL` | 飞书机器人 webhook，设置即启用 |
| `DSH_JOURNAL_STATE` | 状态文件路径（默认 `<workspace>/.dsh-journal-monitor/state.jsonl`） |
| `DSH_WORKSPACE` | 工作区根（dsh 自动注入） |

## 工具说明

### `journal_scan`
- 内置源：NBER Working Papers（`https://www.nber.org/rss/new.xml`）、arXiv Economics（`http://export.arxiv.org/rss/econ`）
- 参数：`sourceUrl`（自定义源）、`limit`（默认 20）
- 输出：title/link/summary/date 列表

### `journal_filter`
- 参数：`items`（scan 结果）、`keywords`（字符串数组，子串匹配）
- 空关键词返回原样

### `journal_push`
- 参数：`items`、`dryRun`（强制 dry-run）
- 无 webhook 时自动 dry-run（只写状态、不发消息），**不会误发**

### `journal_status`
- 参数：`limit`（最近 N 条，默认 10）
- 输出：已记录总数、最近记录、状态文件路径

## 最小闭环（scan → plan → apply → verify）

```
scan（抓 RSS）→ filter（plan：关键词筛选）→ push（apply：推送）→ status（verify：查状态）→ 状态文件（rollback：删除行即可回滚）
```

## 开发与验证（门禁）

```bash
npm install          # devDeps: typescript + @deepseek-ai/* 类型
npm run check        # typecheck（erasable-only TS）
npm run build        # tsc 构建到 lib/
npm test             # 单测（parseFeed/filterItems/itemId，6 用例）
```

**门禁清单（达到才可发版）**：

- [x] typecheck 通过（erasableSyntaxOnly）
- [x] 单测 6/6 通过
- [x] 真实抓取验证：NBER RSS HTTP 200、解析 42 条、关键词过滤命中
- [x] 插件契约：name/inject/apply + cordis.patch.yml + dsh.bundle 完整
- [x] 工具注册：4 工具注册成功（ctx.tools.register）
- [ ] 真实 Bark/飞书推送验证（需 webhook，未配置）
- [ ] headless 插件树加载探针（隔离 profile）
- [ ] CI 全绿（仓库建好后）
- [ ] Web/UI 端到端验收

## 路线图（不铺开，逐个门禁）

- [ ] v0.1.0：本原型（当前）
- [ ] v0.2.0：接 dsh-schedule 定时调度 + 真实推送验证
- [ ] v0.3.0：期刊源配置化（AER/QJE/JPE + CNKI 中文经管）——**经济学垂直差异化**
- [ ] v0.4.0：引用核验联动（与 dsh-cite 类插件互操作）

## 文档

- [10-sources.md](docs/10-sources.md) — 期刊/数据源清单与扩展方法
- [20-cn-journals.md](docs/20-cn-journals.md) — 中文经管期刊接入规划（进行中）

## 贡献

- 每个 PR 对应一个真实痛点或已验证功能；写明「验证结果」。
- 遵守 DSH 插件规范（cordis.patch.yml + defineTool + erasable TS）。
- 本仓库与 `SIMON-WORLD/dsh-toolkit` 是姊妹仓库：toolkit 做通用好用化，本仓做经济学垂直。

## License

MIT
