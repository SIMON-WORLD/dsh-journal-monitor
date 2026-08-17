#!/usr/bin/env node
/**
 * verify-live.mjs — 真实抓取探针（门禁：联网验证）
 *
 * 用法：node scripts/verify-live.mjs
 * 验证项：
 *   1. NBER RSS 可达（HTTP 200 + 可解析出条目）
 *   2. parseFeed / filterItems / itemId 在真实数据上工作
 * 退出码：0 = 全过；1 = 任一失败
 */
import { parseFeed, filterItems, itemId } from '../lib/index.js'

const SOURCES = [
  { id: 'nber', label: 'NBER Working Papers', url: 'https://www.nber.org/rss/new.xml' },
  { id: 'arxiv-econ', label: 'arXiv Economics', url: 'http://export.arxiv.org/rss/econ' },
]

let failures = 0
const report = (ok, msg) => {
  console.log(`${ok ? '✓' : '✗'} ${msg}`)
  if (!ok) failures++
}

for (const src of SOURCES) {
  try {
    const res = await fetch(src.url, { headers: { 'user-agent': 'dsh-journal-monitor/0.1' } })
    report(res.ok, `${src.label}: HTTP ${res.status}`)
    if (!res.ok) continue
    const xml = await res.text()
    const items = parseFeed(xml)
    report(items.length > 0, `${src.label}: 解析出 ${items.length} 条`)
    if (items.length > 0) {
      const ids = new Set(items.map(itemId))
      report(ids.size === items.length, `${src.label}: itemId 唯一（${ids.size}/${items.length}）`)
      const hit = filterItems(items, ['the']) // 保证有命中，验证过滤链路
      report(hit.length > 0, `${src.label}: filterItems 链路正常（命中 ${hit.length}）`)
    }
  } catch (e) {
    report(false, `${src.label}: 抓取失败 ${e instanceof Error ? e.message : String(e)}`)
  }
}

if (failures > 0) {
  console.error(`\n✗ ${failures} 项失败`)
  process.exit(1)
}
console.log('\n✓ 全部通过')
process.exit(0)
