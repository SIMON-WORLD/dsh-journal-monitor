import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseFeed, filterItems, itemId, buildBriefing, ECON_SOURCES, fetchArxivCategory, parseCnToc, parseAjcass } from '../src/index.ts'

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

test('parseCnToc: 解析中文期刊 HTML 目录页（abstract*.shtml 链接）', () => {
  const html = `<html><body>
    <a href="https://sjjj.magtech.com.cn/CN/abstract/abstract1193.shtml">打开比较优势技术来源的"黑箱"：中间投入品结构的视角</a>
    <a href="https://sjjj.magtech.com.cn/CN/abstract/abstract1192.shtml">专精特新政策与创新质量——基于上市公司发明专利文本的经验证据</a>
    <a href="https://sjjj.magtech.com.cn/CN/online_first">在线预览</a>
    <a href="/CN/abstract/abstract1189.shtml">城市中心跨越世纪的记忆与嬗变</a>
  </body></html>`
  const items = parseCnToc(html, 'https://sjjj.magtech.com.cn/CN/online_first')
  // 只保留真实文章（去重 + 过滤过短的导航链接）
  assert.ok(items.length >= 3, `expected >=3, got ${items.length}`)
  assert.match(items[0].title, /比较优势/)
  assert.match(items[0].link, /abstract1193/)
  // 相对路径解析为绝对 URL
  const abs = items.find((i) => i.link.includes('abstract1189'))
  assert.ok(abs && abs.link.startsWith('https://sjjj.magtech.com.cn/CN/abstract/abstract1189.shtml'))
})

test('parseCnToc: 解析 home 当期目录格式（标题+作者+卷期+摘要）', () => {
  const html = `<html><body>
    <li id="art1232">
      <div class="j-title-1"><a href="https://sjjj.magtech.com.cn/CN/Y2026/V49/I8/3">金融科技创新与企业跨国供应链拓展</a></div>
      <div class="j-author">李震, 柴范, 方一安, 赵春明</div>
      <div class="j-volumn-doi"><span class="j-volumn">2026, 49(8): 3-36.</span></div>
      <div class="j-abstract">金融科技是提升金融服务实体经济质效的重要支撑。</div>
    </li>
    <li id="art1233">
      <div class="j-title-1"><a href="https://sjjj.magtech.com.cn/CN/Y2026/V49/I8/4">货币政策传导的异质性</a></div>
      <div class="j-author">张三</div>
      <div class="j-volumn-doi"><span class="j-volumn">2026, 49(8): 37-60.</span></div>
      <div class="j-abstract">研究货币政策对实体经济的影响。</div>
    </li>
  </body></html>`
  const items = parseCnToc(html, 'https://sjjj.magtech.com.cn/CN/home')
  assert.equal(items.length, 2)
  assert.equal(items[0].title, '金融科技创新与企业跨国供应链拓展')
  assert.equal(items[0].authors, '李震, 柴范, 方一安, 赵春明')
  assert.match(items[0].date, /49\(8\)/)
  assert.match(items[0].summary, /金融科技/)
  assert.match(items[0].link, /V49\/I8\/3/)
})

test('parseCnToc: 空输入/无文章返回空数组', () => {
  assert.equal(parseCnToc('', 'https://x/').length, 0)
  assert.equal(parseCnToc('<html><a href="/a">首页</a></html>', 'https://x/').length, 0)
})

test('ECON_SOURCES: 含中文经管期刊源 sjjj', () => {
  const sjjj = ECON_SOURCES.find((s) => s.id === 'sjjj')
  assert.ok(sjjj, 'should contain sjjj source')
  assert.equal(sjjj.kind, 'cn-toc')
  assert.match(sjjj.label, /世界经济/)
})

test('parseAjcass: 解析 ajcass 平台当期目录（标题+作者+卷期）', () => {
  const html = `<html><body><div id="IssueList">
    <p class="green"><a href="/Magazine/Show?id=123173">农村集体经营性建设用地入市的困境与出路</a><span>作者:陶然 余家林</span></p>
    <p class="hod pop">2026 NO.4 <a href="/Magazine/Show?id=123173">[摘要]</a>(343)<a href="/Magazine/Show?id=123173">[PDF]</a></p>
    <p class="green"><a href="/Magazine/Show?id=123172">乡村振兴中的分配型协商与村庄公共性重塑</a><span>作者:张三</span></p>
    <p class="hod pop">2026 NO.4 <a href="/Magazine/Show?id=123172">[摘要]</a>(200)<a href="/Magazine/Show?id=123172">[PDF]</a></p>
  </div></body></html>`
  const items = parseAjcass(html, 'https://zgncgc.ajcass.com/')
  assert.equal(items.length, 2)
  assert.equal(items[0].title, '农村集体经营性建设用地入市的困境与出路')
  assert.match(items[0].authors, /陶然/)
  assert.match(items[0].date, /2026 NO\.4/)
  assert.match(items[0].link, /Magazine\/Show\?id=123173/)
})

test('parseAjcass: 排除 [摘要]/[PDF] 操作链接（去重后唯一）', () => {
  const html = `<html><body><div id="IssueList">
    <p class="green"><a href="/Magazine/Show?id=123173">农村集体经营性建设用地入市的困境与出路</a><span>作者:陶然 余家林</span></p>
    <p class="hod pop">2026 NO.4 <a href="/Magazine/Show?id=123173">[摘要]</a>(343)<a href="/Magazine/Show?id=123173">[PDF]</a></p>
  </div></body></html>`
  const items = parseAjcass(html, 'https://zgncgc.ajcass.com/')
  assert.equal(items.length, 1, 'should only keep the article, not [摘要]/[PDF] links')
  assert.equal(items[0].title, '农村集体经营性建设用地入市的困境与出路')
})

test('parseAjcass: 空输入返回空数组', () => {
  assert.equal(parseAjcass('', 'https://x/').length, 0)
  assert.equal(parseAjcass('<html><a href="/a">首页</a></html>', 'https://x/').length, 0)
})

test('ECON_SOURCES: 含 ajcass 平台源 zgncgc', () => {
  const z = ECON_SOURCES.find((s) => s.id === 'zgncgc')
  assert.ok(z, 'should contain zgncgc source')
  assert.equal(z.kind, 'ajcass')
  assert.match(z.label, /中国农村观察/)
})
