#!/usr/bin/env node
/**
 * probe-embed.mjs — 插件树加载探针（门禁：真实 dsh-tools API）
 *
 * 用法：node scripts/probe-embed.mjs
 * 验证项：
 *   1. 插件 bundle 契约：name / inject / apply 完整
 *   2. 用真实 @deepseek-ai/dsh-tools 的 defineTool 注册全部工具（schema 编译通过）
 *   3. 端到端执行：journal_filter 过滤真实参数（validate + execute）
 * 退出码：0 = 全过；1 = 任一失败
 *
 * 说明：本探针直接 import 仓库内 node_modules 的 dsh-tools（与 dsh 运行时同版本），
 * 不依赖 npx 拉包或修改用户 profile——安全、可重复、CI 可跑。
 */
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

const req = createRequire(import.meta.url)
const dshTools = await import(pathToFileURL(req.resolve('@deepseek-ai/dsh-tools')).href)
const m = await import(new URL('../lib/index.js', import.meta.url).href)

let failures = 0
const report = (ok, msg) => {
  console.log(`${ok ? '✓' : '✗'} ${msg}`)
  if (!ok) failures++
}

// 1. 契约
report(m.name === 'dsh-journal-monitor', `bundle name: ${m.name}`)
report(Array.isArray(m.inject) && m.inject.includes('tools'), `inject: ${JSON.stringify(m.inject)}`)
report(typeof m.apply === 'function', 'apply is function')

// 2. 真实 dsh-tools 注册
const registered = []
m.apply({ tools: { register: (def) => registered.push(def) } })
report(registered.length === 7, `registered 7 tools: ${registered.map((d) => d.name).join(', ')}`)
for (const def of registered) {
  report(def.parameters?.type === 'object', `${def.name}: schema compiled`)
  report(typeof def.execute === 'function', `${def.name}: execute present`)
}

// 3. 端到端执行（validate + execute 由 defineTool 内部完成）
const filterDef = registered.find((d) => d.name === 'journal_filter')
try {
  const items = [
    { title: 'China Trade Policy and Global Value Chains', link: 'https://x/1', summary: '' },
    { title: 'Monetary Policy Transmission', link: 'https://x/2', summary: '' },
  ]
  const result = await filterDef.execute({ items, keywords: ['china'] })
  report(result.matched === 1 && result.items[0].title.includes('China'), `journal_filter e2e: ${result.matched}/${result.total} matched`)
} catch (e) {
  report(false, `journal_filter e2e: ${e instanceof Error ? e.message : String(e)}`)
}

// 4. briefing 参数生成
const briefDef = registered.find((d) => d.name === 'journal_briefing')
try {
  const b = await briefDef.execute({ topic: '中国贸易', interval_days: 1 })
  report(b.every_seconds === 86400 && typeof b.schedule_prompt === 'string', `journal_briefing e2e: every=${b.every_seconds}s`)
} catch (e) {
  report(false, `journal_briefing e2e: ${e instanceof Error ? e.message : String(e)}`)
}

if (failures > 0) {
  console.error(`\n✗ ${failures} 项失败`)
  process.exit(1)
}
console.log('\n✓ 插件树加载探针全部通过（真实 dsh-tools API）')
process.exit(0)
