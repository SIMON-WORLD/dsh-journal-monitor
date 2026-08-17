# dsh-journal-monitor — 经管期刊/工作论文监控推送插件

> 让 DeepSeek Harness (dsh) 帮你盯着 NBER / arXiv 经济学的新论文：抓取 → 关键词过滤 → 推送（Bark/飞书/Dry-run）→ 去重持久化 → 定时简报。

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![dsh-plugin](https://img.shields.io/badge/ecosystem-dsh--plugin-orange)](https://github.com/topics/dsh-plugin)

> **⚠️ 状态（诚实声明）**：v0.5.0 = 可用原型。已实现并实测：多源抓取（NBER 42 条 ✓ + arXiv 三类目各 10 条 ✓ + **《世界经济》online_first 7 条 + 当期目录 8 条含摘要/作者/卷期 ✓**）、关键词过滤（✓ 单测）、工具注册（5 工具 ✓）、dry-run 推送（✓）、去重持久化（✓）、定时简报参数生成（✓，schedule_create 兼容）、**插件树加载探针（✓ 真实 dsh-tools API 端到端）**。**未实现**：真实 Bark/飞书推送（代码有，需配置 webhook 后验证）、Web/UI 端到端验收、定时调度的端到端执行验证（建议配合 dsh-schedule 实测）。

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

1. **抓**：`journal_scan`（默认全部经济源：NBER + arXiv econ.GN/EM/TH + q-fin.GN；可传 `source` 指定单个源，或 `sourceUrl` 抓任意 RSS）
2. **筛**：`journal_filter`（关键词如 `["china","trade","labor","did"]`，标题+摘要子串匹配，大小写不敏感）
3. **推**：`journal_push`（默认 dry-run 只记录；配 webhook 后真实推送）
4. **查**：`journal_status`（已推送记录 + 去重依据）
5. **定时**：`journal_briefing`（生成 `schedule_create` 参数 + 监控提示词，配合内置 dsh-schedule 每日/每周自动跑）

```text
用 journal_scan 抓最新 NBER 论文，用 journal_filter 筛出含 "china" 或 "trade" 的，
再用 journal_push 推送（dry-run），最后 journal_status 看看记录。
想每天自动跑：journal_briefing(topic="中国贸易", interval_days=1) 然后用返回的 every_seconds 建 schedule_create。
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
- 内置源：NBER Working Papers（RSS）、arXiv 经济类目（API：econ.GN / econ.EM / econ.TH / q-fin.GN）、**《世界经济》online_first（中文经管）+ 当期目录（含作者/卷期/摘要）**
- 参数：`source`（指定单个源）、`sourceUrl`（自定义 RSS/Atom）、`limit`（默认 20）
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

### `journal_briefing`（v0.2.0 新增）
- 参数：`topic`（简报主题）、`interval_days`（间隔天数，默认 1）
- 输出：`every_seconds` + `schedule_prompt`，可直接传给内置 `schedule_create` 建立定时监控

## 最小闭环（scan → plan → apply → verify）

```
scan（抓 RSS/API）→ filter（plan：关键词筛选）→ push（apply：推送）→ status（verify：查状态）→ 状态文件（rollback：删除行即可回滚）→ briefing（schedule_create 定时）
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
- [x] 单测 15/15 通过
- [x] 真实抓取验证：NBER RSS HTTP 200 解析 42 条、arXiv econ.GN/EM/q-fin.GN 各 10 条、**《世界经济》online_first 7 条 + 当期目录 8 条（含作者/卷期/摘要）**
- [x] 插件契约：name/inject/apply + cordis.patch.yml + dsh.bundle 完整
- [x] 工具注册：5 工具注册成功（真实 dsh-tools API）
- [x] **插件树加载探针：scripts/probe-embed.mjs（真实 dsh-tools 端到端，已入 CI）**
- [ ] 真实 Bark/飞书推送验证（需 webhook，未配置）
- [ ] CI 全绿（仓库已建，CI 自动跑）
- [ ] Web/UI 端到端验收
- [ ] 定时调度端到端（配合 dsh-schedule 实测）

## 路线图（不铺开，逐个门禁）

- [x] v0.1.0：抓取/过滤/推送/去重闭环原型
- [x] v0.2.0：arXiv 多类目 API + 定时简报参数生成（并入 schedule-briefing 能力）
- [x] v0.3.0：**中文经管期刊源（《世界经济》online_first）**——经济学垂直差异化
- [x] v0.4.0：**插件树加载探针（真实 dsh-tools API，入 CI）**
- [x] v0.5.0：**《世界经济》当期目录源（含作者/卷期/摘要全文解析）**
- [ ] v0.6.0：真实推送验证（Bark/飞书 webhook）+ 定时调度端到端
- [ ] v0.7.0：更多中文经管期刊（管理世界/经济研究/中国工业经济）+ 引用核验联动

## 文档

- [10-sources.md](docs/10-sources.md) — 期刊/数据源清单与扩展方法
- [20-cn-journals.md](docs/20-cn-journals.md) — 中文经管期刊接入规划（进行中）

## 贡献

- 每个 PR 对应一个真实痛点或已验证功能；写明「验证结果」。
- 遵守 DSH 插件规范（cordis.patch.yml + defineTool + erasable TS）。
- 本仓库与 `SIMON-WORLD/dsh-toolkit` 是姊妹仓库：toolkit 做通用好用化，本仓做经济学垂直。

## License

MIT
