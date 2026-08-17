# 期刊/数据源清单

> 每个源都必须通过 `node scripts/verify-live.mjs` 真实可达验证后才能标记「可用」。
> 状态：🟢 已验证 / 🟡 规划中 / ⚪ 待验证

## 内置源（v1.1.0）

| 源 | URL/API | 类型 | 状态 |
|---|---|---|---|
| NBER Working Papers | https://www.nber.org/rss/new.xml | 工作论文 RSS | 🟢 已实测（HTTP 200，42 条） |
| arXiv 一般经济学（econ.GN） | export.arxiv.org/api/query?cat:econ.GN | 预印本 API | 🟢 已实测（10 条） |
| arXiv 计量经济学（econ.EM） | export.arxiv.org/api/query?cat:econ.EM | 预印本 API | 🟢 已实测（10 条） |
| arXiv 理论经济学（econ.TH） | export.arxiv.org/api/query?cat:econ.TH | 预印本 API | 🟢 已实测 |
| arXiv 量化金融（q-fin.GN） | export.arxiv.org/api/query?cat:q-fin.GN | 预印本 API | 🟢 已实测（10 条） |
| **世界经济·在线预览** | https://sjjj.magtech.com.cn/CN/online_first | 玛格泰克平台 | 🟢 已实测（7 条） |
| **世界经济·当期目录** | https://sjjj.magtech.com.cn/CN/home | 玛格泰克平台（含摘要） | 🟢 已实测（8 条） |
| **中国农村观察** | https://zgncgc.ajcass.com/ | ajcass 旧版式 | 🟢 已实测（41 条） |
| **财贸经济** | https://cmjj.ajcass.com/ | ajcass 新版式（含摘要） | 🟢 已实测（10 条） |
| **中国人口科学** | https://zgrkkx.ajcass.com/ | ajcass 新版式 | 🟢 已实测（42 条） |
| **经济管理** | https://jjgl.ajcass.com/ | ajcass 路径式 href | 🟢 已实测（15 条） |

## 中文经管期刊源扩展（探测记录 2026-08-17）

| 期刊 | 平台 | 可达性 | 说明 |
|---|---|---|---|
| 世界经济 | 玛格泰克（sjjj.magtech.com.cn） | 🟢 已接入 | online_first + 当期目录（含摘要） |
| 中国农村观察 | ajcass（zgncgc） | 🟢 已接入 | 41 条（旧版 class='green' 版式） |
| 财贸经济 | ajcass（cmjj） | 🟢 已接入 | 10 条（新版 h3 版式，含摘要） |
| 中国人口科学 | ajcass（zgrkkx） | 🟢 已接入 | 42 条（新版 h3 版式） |
| 中国工业经济 | ciejournal.org | ⚪ JS 重定向墙 | /feed 是反爬 JS 页，无公开 RSS |
| 经济研究 | erj.cn | ⚪ 沙箱内不可达 | 官网拒绝连接 |
| 管理世界 | mwm.net.cn → glsj.cbpt.cnki.net | ⚪ **CNKI 验证码墙** | 文章系统在 CNKI 期刊平台（WKB2），需登录态/验证码，不适合纯 RSS 抓取 |
| 中国农村经济 | zgncjj.ajcass.com | ⚪ JS 渲染页 | 骨架页 660 字节 |
| 数量经济技术经济研究 | jqte.net | ⚪ 仅新闻 | 无文章目录 |

> 三个平台解析器沉淀：
> - **玛格泰克**（magtech.com.cn）：`parseCnToc`——online_first + home 当期目录
> - **ajcass 旧版式**（中国农村观察）：`parseAjcass` 版式 A——`<p class="green">` 标题块
> - **ajcass 新版式**（财贸经济/中国人口科学）：`parseAjcass` 版式 B——`<li><h3>` 标题块，含摘要 + 截断标题（…）去重

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
