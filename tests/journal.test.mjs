import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseFeed, filterItems, itemId } from '../src/index.ts'

const SAMPLE_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>NBER</title>
  <item>
    <title>The Causal Effects of Minimum Wages on Employment</title>
    <link>https://www.nber.org/papers/w33001</link>
    <pubDate>Mon, 01 Jan 2026 00:00:00 GMT</pubDate>
    <description><![CDATA[We study the effects of minimum wages using a difference-in-differences design.]]></description>
  </item>
  <item>
    <title>Monetary Policy and Housing Markets</title>
    <link>https://www.nber.org/papers/w33002</link>
    <pubDate>Tue, 02 Jan 2026 00:00:00 GMT</pubDate>
    <description>Interest rates and house prices.</description>
  </item>
</channel></rss>`

test('parseFeed: 解析 title/link/date/summary 并剥离 HTML', () => {
  const items = parseFeed(SAMPLE_RSS)
  assert.equal(items.length, 2)
  assert.equal(items[0].title, 'The Causal Effects of Minimum Wages on Employment')
  assert.equal(items[0].link, 'https://www.nber.org/papers/w33001')
  assert.match(items[0].date, /2026/)
  assert.match(items[0].summary, /difference-in-differences/)
})

test('parseFeed: 空输入返回空数组', () => {
  assert.equal(parseFeed('').length, 0)
  assert.equal(parseFeed('<rss></rss>').length, 0)
})

test('filterItems: 大小写不敏感的子串匹配（title+summary）', () => {
  const items = parseFeed(SAMPLE_RSS)
  const hit = filterItems(items, ['causal'])
  assert.equal(hit.length, 1)
  assert.equal(hit[0].link, 'https://www.nber.org/papers/w33001')

  const hit2 = filterItems(items, ['minimum wage'])
  assert.equal(hit2.length, 1)

  const hit3 = filterItems(items, ['difference-in-differences']) // 命中 summary
  assert.equal(hit3.length, 1)
})

test('filterItems: 空关键词原样返回', () => {
  const items = parseFeed(SAMPLE_RSS)
  assert.equal(filterItems(items, []).length, 2)
})

test('itemId: 同 link 稳定、不同条目不同', () => {
  const a = parseFeed(SAMPLE_RSS)
  assert.equal(itemId(a[0]), itemId(a[0]))
  assert.notEqual(itemId(a[0]), itemId(a[1]))
})

test('itemId: 无 link 时用 title 兜底且稳定', () => {
  const x = { title: 'Some Paper', link: '', summary: '' }
  const y = { title: 'Some Paper', link: '', summary: '' }
  assert.equal(itemId(x), itemId(y))
})
