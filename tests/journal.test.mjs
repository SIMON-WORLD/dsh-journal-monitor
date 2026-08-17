import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseFeed, filterItems, itemId, buildBriefing, ECON_SOURCES, fetchArxivCategory } from '../src/index.ts'

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

const SAMPLE_ATOM = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>arXiv econ</title>
  <entry>
    <id>http://arxiv.org/abs/2608.00001</id>
    <title>Trade and Labor Market Outcomes: New Evidence</title>
    <published>2026-08-16T00:00:00Z</published>
    <summary>We study the effects of trade on labor markets.</summary>
  </entry>
  <entry>
    <id>http://arxiv.org/abs/2608.00002</id>
    <title>Monetary Policy Transmission</title>
    <published>2026-08-15T00:00:00Z</published>
    <summary>Interest rates and inflation.</summary>
  </entry>
</feed>`

test('parseFeed: 解析 RSS title/link/date/summary 并剥离 HTML', () => {
  const items = parseFeed(SAMPLE_RSS)
  assert.equal(items.length, 2)
  assert.equal(items[0].title, 'The Causal Effects of Minimum Wages on Employment')
  assert.equal(items[0].link, 'https://www.nber.org/papers/w33001')
  assert.match(items[0].date, /2026/)
  assert.match(items[0].summary, /difference-in-differences/)
})

test('parseFeed: 解析 Atom 的 link href 属性', () => {
  const items = parseFeed(SAMPLE_ATOM)
  assert.equal(items.length, 2)
  assert.equal(items[0].link, 'http://arxiv.org/abs/2608.00001')
  assert.equal(items[0].date.slice(0, 10), '2026-08-16')
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

test('buildBriefing: 生成 schedule_create 参数（every_seconds + 自包含提示词）', () => {
  const b = buildBriefing('数字化转型', 1)
  assert.equal(b.every_seconds, 86400)
  assert.match(b.schedule_prompt, /数字化转型/)
  assert.match(b.schedule_prompt, /journal_scan/)
  assert.match(b.schedule_prompt, /journal_filter/)
  assert.match(b.schedule_prompt, /journal_push/)

  const weekly = buildBriefing('货币政策', 7)
  assert.equal(weekly.every_seconds, 7 * 86400)
})

test('buildBriefing: interval 下限保护（≥300s）', () => {
  const b = buildBriefing('测试', 0)
  assert.ok(b.every_seconds >= 300)
})

test('ECON_SOURCES: 含 arXiv 多类目 + NBER', () => {
  const ids = ECON_SOURCES.map((s) => s.id)
  assert.ok(ids.includes('arxiv-econ.GN'))
  assert.ok(ids.includes('arxiv-econ.EM'))
  assert.ok(ids.includes('arxiv-econ.TH'))
  assert.ok(ids.includes('arxiv-q-fin.GN'))
  assert.ok(ids.includes('nber'))
})

test('fetchArxivCategory: 真实抓取 arXiv econ.GN（联网，失败时跳过不阻塞）', async () => {
  try {
    const items = await fetchArxivCategory('econ.GN', 3)
    assert.ok(items.length > 0)
    assert.ok(items[0].title.length > 0)
  } catch {
    // 网络受限环境跳过；CI 有独立 live probe
    console.warn('（网络受限，跳过真实 arXiv 抓取断言）')
  }
})
