# 推送链路验证记录（v0.7.0）

> 验证时间：2026-08-17 ｜ 方式：本地 mock HTTP 服务器端到端（非真实 webhook）
> 目的：在无真实 webhook 的前提下，验证 `journal_push` 的推送代码路径真实发出 HTTP 请求、去重持久化生效、dry-run 不误发。

## 验证场景（tests/push.integration.test.mjs，5 用例全过）

| # | 场景 | 断言 |
|---|---|---|
| 1 | dry-run 不发请求且记录状态 | `received.length === 0`，且状态文件写入（后续可去重） |
| 2 | Bark URL 拼接 GET 真实发送 | mock 收到 GET，URL 含标题（中文全角括号被 URL 编码） |
| 3 | 飞书 POST JSON 真实发送 | mock 收到 POST，body 含 `msg_type` 与标题 |
| 4 | 真实推送后同状态文件去重 | 第二次推送 `pushed=0`，mock 只收到 1 次请求 |
| 5 | itemId 同 link 去重稳定 | 同 link 不同 title 视为同一条 |

## 过程中发现并修复的 bug

1. **dry-run 语义错误**：原逻辑 `opts.dryRun !== false && !barkUrl && !feishuUrl`——显式 `dryRun: true` + 配置了 webhook 时会**误发**。修复为 `opts.dryRun === true || (!barkUrl && !feishuUrl)`（显式 dry-run 最高优先）。
2. **Bark 中文标题 URL 编码**：标题含中文全角括号【】，Bark URL 拼接后整体被 `encodeURIComponent`——验证时用 `decodeURIComponent` 断言内容。

## 诚实声明

- ✅ 已验证：推送代码路径（HTTP 请求格式、去重、dry-run）端到端正确。
- ⏳ 待验证：真实 Bark/飞书 webhook 的最终投递（需用户提供 webhook URL 或自建测试端点）。
- 结论：`journal_push` 达到「可配置即用」状态——设置 `DSH_BARK_URL` / `DSH_FEISHU_URL` 环境变量即可启用真实推送。
