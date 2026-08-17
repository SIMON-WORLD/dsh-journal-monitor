# 期刊/数据源清单

> 每个源都必须通过 `node scripts/verify-live.mjs` 真实可达验证后才能标记「可用」。
> 状态：🟢 已验证 / 🟡 规划中 / ⚪ 待验证

## 内置源（v0.5.0）

| 源 | URL/API | 类型 | 状态 |
|---|---|---|---|
| NBER Working Papers | https://www.nber.org/rss/new.xml | 工作论文 RSS | 🟢 已实测（HTTP 200，42 条） |
| arXiv 一般经济学（econ.GN） | export.arxiv.org/api/query?cat:econ.GN | 预印本 API | 🟢 已实测（10 条） |
| arXiv 计量经济学（econ.EM） | export.arxiv.org/api/query?cat:econ.EM | 预印本 API | 🟢 已实测（10 条） |
| arXiv 理论经济学（econ.TH） | export.arxiv.org/api/query?cat:econ.TH | 预印本 API | 🟢 已实测 |
| arXiv 量化金融（q-fin.GN） | export.arxiv.org/api/query?cat:q-fin.GN | 预印本 API | 🟢 已实测（10 条） |
| **世界经济·在线预览** | https://sjjj.magtech.com.cn/CN/online_first | 中文期刊 HTML 目录 | 🟢 已实测（7 条） |
| **世界经济·当期目录** | https://sjjj.magtech.com.cn/CN/home | 中文期刊 HTML 目录（含摘要） | 🟢 已实测（8 条，标题/作者/卷期/摘要全文） |

## 中文经管期刊源扩展（探测记录 2026-08-17）

| 期刊 | 平台 | 可达性 | 说明 |
|---|---|---|---|
| 世界经济 | 玛格泰克（sjjj.magtech.com.cn） | 🟢 已接入 | online_first 页可解析 abstract*.shtml 文章 |
| 中国工业经济 | ciejournal.org | ⚪ JS 重定向墙 | /feed 是反爬 JS 页，无公开 RSS |
| 经济研究 | erj.cn | ⚪ 沙箱内连不上 | 官网拒绝连接（本地网络限制） |
| 管理世界 | mwm.net.cn | ⚪ 超时 | 官网不可达 |
| 中国农村经济 | ajcass.com | ⚪ JS 渲染页 | 骨架页 660 字节，无 SSR 内容 |
| 数量经济技术经济研究 | jqte.net | ⚪ 仅新闻 | 无文章目录/RSS |

> 玛格泰克平台（magtech.com.cn）是中文期刊主流托管平台，`parseCnToc` 解析器可复用于该平台其他期刊（如各社科期刊）。

## 扩展源（经济学垂直，v0.3.0 规划）

| 源 | URL 猜测 | 类型 | 状态 |
|---|---|---|---|
| AER（American Economic Review） | 见 https://www.aeaweb.org/journals/aer （RSS 需确认） | 顶刊 | ⚪ 待验证 |
| QJE（Quarterly Journal of Economics） | OUP RSS，需确认 | 顶刊 | ⚪ 待验证 |
| JPE（Journal of Political Economy） | UChicago 期刊 RSS，需确认 | 顶刊 | ⚪ 待验证 |
| RePEc/IDEAS | https://ideas.repec.org/ （RSS/API 需确认） | 工作论文聚合 | ⚪ 待验证 |
| 经济研究（中文） | 官网 RSS 需确认 | 中文顶刊 | ⚪ 待验证 |
| 管理世界（中文） | 官网 RSS 需确认 | 中文顶刊 | ⚪ 待验证 |

## 如何加源

1. 确认源有 RSS/Atom 输出（`curl <url>` 看是否有 `<item>`/`<entry>`）；
2. 加入 `src/index.ts` 的 `DEFAULT_SOURCES`（或作为自定义 `sourceUrl` 参数使用）；
3. 跑 `node scripts/verify-live.mjs` 验证 HTTP 200 + 可解析；
4. 更新本表状态。

> 中文经管期刊接入（CNKI 检索式 / 官网 RSS）见 `docs/20-cn-journals.md`（规划中）。
