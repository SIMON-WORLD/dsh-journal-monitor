/**
 * dsh-journal-monitor — 经管期刊/工作论文监控推送插件
 *
 * 真插件（非 skill）：RSS/API 抓取 → 关键词过滤 → 推送 → 去重持久化 → 定时调度。
 * 最小闭环：scan → filter(plan) → push(apply) → status(verify) → rollback。
 * 定时：journal_briefing 生成 schedule_create 参数（复用内置 dsh-schedule 协议）。
 * 默认 dry-run：不真正发送推送，只输出将推送内容，配置 webhook 后启用真实推送。
 *
 * v0.2.0 变更：并入 schedule-briefing 的 arXiv 多类目 API 抓取 + 定时简报参数生成。
 * 标准 DSH 插件格式：cordis.patch.yml 挂载 + defineTool 注册。
 * 依赖：Node >= 18（全局 fetch），运行时零第三方依赖。
 */
import { defineTool } from '@deepseek-ai/dsh-tools'
import { readFileSync, mkdirSync, existsSync, appendFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

export const name = 'dsh-journal-monitor'
export const inject = ['tools']

/** 经济学文献源：arXiv 多类目（API）+ NBER RSS + 中文经管期刊（HTML 目录页） */
export const ECON_SOURCES = [
  { id: 'arxiv-econ.GN', kind: 'arxiv', label: 'arXiv 一般经济学' },
  { id: 'arxiv-econ.EM', kind: 'arxiv', label: 'arXiv 计量经济学' },
  { id: 'arxiv-econ.TH', kind: 'arxiv', label: 'arXiv 理论经济学' },
  { id: 'arxiv-q-fin.GN', kind: 'arxiv', label: 'arXiv 量化金融' },
  { id: 'nber', kind: 'rss', label: 'NBER Working Papers', url: 'https://www.nber.org/rss/new.xml' },
  {
    id: 'sjjj',
    kind: 'cn-toc',
    label: '世界经济（中文经管）',
    url: 'https://sjjj.magtech.com.cn/CN/online_first',
  },
  {
    id: 'sjjj-current',
    kind: 'cn-toc',
    label: '世界经济当期目录（含摘要）',
    url: 'https://sjjj.magtech.com.cn/CN/home',
  },
]

/** 内置默认 RSS 源（v0.1.0 兼容：journal_scan 无参调用） */
const DEFAULT_SOURCES = [
  { id: 'nber', label: 'NBER Working Papers', url: 'https://www.nber.org/rss/new.xml' },
  { id: 'arxiv-econ', label: 'arXiv Economics', url: 'http://export.arxiv.org/rss/econ' },
]

/** 状态文件位置：DSH_JOURNAL_STATE 环境变量 > 工作区 .dsh-journal-monitor/state.jsonl */
function stateFile(): string {
  return (
    process.env.DSH_JOURNAL_STATE ||
    join(process.env.DSH_WORKSPACE || process.cwd(), '.dsh-journal-monitor', 'state.jsonl')
  )
}

function readState(): Map<string, string> {
  const map = new Map<string, string>()
  const f = stateFile()
  if (!existsSync(f)) return map
  for (const line of readFileSync(f, 'utf8').split('\n')) {
    if (!line.trim()) continue
    try {
      const rec = JSON.parse(line)
      map.set(rec.id, rec.pushedAt || '')
    } catch {
      // skip malformed lines
    }
  }
  return map
}

function appendState(rec: unknown): void {
  const f = stateFile()
  mkdirSync(dirname(f), { recursive: true })
  appendFileSync(f, JSON.stringify(rec) + '\n', 'utf8')
}

/** 抓取 RSS/Atom 并解析为条目列表（title/link/summary/date）。Node 全局 fetch。 */
async function fetchFeed(url: string, timeoutMs = 20000): Promise<Array<Record<string, string>>> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'user-agent': 'dsh-journal-monitor/0.2' } })
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
    const xml = await res.text()
    return parseFeed(xml)
  } finally {
    clearTimeout(t)
  }
}

/** 极简 XML 解析：按 <item> 或 <entry> 块切分，提取常见字段（无第三方依赖）。 */
export function parseFeed(xml: string): Array<Record<string, string>> {
  const items: Array<Record<string, string>> = []
  const blockRe = /<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi
  let m: RegExpExecArray | null
  while ((m = blockRe.exec(xml)) !== null) {
    const block = m[2]
    const grab = (tag: string): string => {
      const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'i')
      const mm = block.match(re)
      if (!mm) return ''
      return mm[1]
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, ' ')
        .trim()
    }
    const linkRaw = grab('link') || grab('id')
    // Atom 的 link 是属性形式 <link href="..."/> 时上面拿不到，补一个属性提取
    const hrefMatch = block.match(/<link\b[^>]*href="([^"]+)"/i)
    const title = grab('title')
    if (!title && !linkRaw) continue
    items.push({
      title,
      link: linkRaw || (hrefMatch ? hrefMatch[1] : ''),
      summary: grab('description') || grab('summary'),
      date: grab('pubDate') || grab('published') || grab('updated'),
    })
  }
  return items
}

/** 抓取 arXiv 类目（API，支持 econ.GN / econ.EM / econ.TH / q-fin.GN）。 */
export async function fetchArxivCategory(category: string, limit = 10, timeoutMs = 20000): Promise<Array<Record<string, string>>> {
  const url = `http://export.arxiv.org/api/query?search_query=cat:${encodeURIComponent(category)}&sortBy=submittedDate&sortOrder=descending&max_results=${limit}`
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
  if (!res.ok) throw new Error(`arXiv API HTTP ${res.status}`)
  return parseFeed(await res.text())
}

/** 解析中文期刊 HTML 目录页（玛格泰克平台）：支持两种格式——
 * 1) online_first：abstract*.shtml 链接 + 标题
 * 2) home 当期目录：j-title-1（标题）+ j-author（作者）+ j-volumn-doi（卷期页码）+ j-abstract（摘要）
 */
export function parseCnToc(html: string, baseUrl: string): Array<Record<string, string>> {
  const items: Array<Record<string, string>> = []
  const seen = new Set<string>()

  // 格式 2：home 当期目录（更完整：作者/卷期/摘要）
  const fullRe = /<div class="j-title-1">\s*<a href="([^"]+)">([\s\S]*?)<\/a>[\s\S]*?<div class="j-author">([\s\S]*?)<\/div>[\s\S]*?<div class="j-volumn-doi">[\s\S]*?<span class="j-volumn">([\s\S]*?)<\/span>[\s\S]*?<div class="j-abstract">([\s\S]*?)<\/div>/gi
  let fm: RegExpExecArray | null
  while ((fm = fullRe.exec(html)) !== null) {
    const title = fm[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
    if (title.length < 4 || seen.has(title)) continue
    seen.add(title)
    const link = fm[1].startsWith('http') ? fm[1] : new URL(fm[1], baseUrl).href
    items.push({
      title,
      link,
      summary: fm[5].replace(/<[^>]+>/g, '').replace(/&#x0201[cd];/g, '').replace(/&[a-z]+;/g, '').replace(/\s+/g, ' ').trim(),
      date: fm[4].replace(/\s+/g, ' ').trim(),
      authors: fm[3].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(),
    })
  }

  // 格式 1：online_first（abstract*.shtml 链接）
  const re = /<a[^>]*href="([^"]*(?:abstract|article|view|online)[^"]*)"[^>]*>([\s\S]{2,180}?)<\/a>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    const href = m[1]
    const rawTitle = m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
    if (rawTitle.length < 4 || seen.has(rawTitle)) continue
    seen.add(rawTitle)
    const link = href.startsWith('http') ? href : new URL(href, baseUrl).href
    items.push({ title: rawTitle, link, summary: '', date: '', authors: '' })
  }
  return items
}

/** 抓取中文期刊 HTML 目录页。 */
async function fetchCnToc(url: string, timeoutMs = 25000): Promise<Array<Record<string, string>>> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36' },
  })
  if (!res.ok) throw new Error(`CN TOC HTTP ${res.status}`)
  return parseCnToc(await res.text(), url)
}

/** 按源 id 抓取：arXiv 类目（arxiv-*）走 API，cn-toc 走中文 HTML 目录页，其余按 RSS URL。 */
async function fetchSource(src: { id: string; kind?: string; url?: string }, limit: number): Promise<Array<Record<string, string>>> {
  if (src.kind === 'arxiv' || /^arxiv-/.test(src.id)) {
    const cat = src.id.replace(/^arxiv-/, '')
    return fetchArxivCategory(cat, limit)
  }
  if (src.kind === 'cn-toc' && src.url) {
    return (await fetchCnToc(src.url)).slice(0, limit)
  }
  if (src.url) return fetchFeed(src.url)
  return []
}

/** 关键词过滤：标题+摘要小写匹配。 */
export function filterItems(items: Array<Record<string, string>>, keywords: string[]): Array<Record<string, string>> {
  if (!keywords || keywords.length === 0) return items
  const kws = keywords.map((k) => k.toLowerCase().trim()).filter(Boolean)
  return items.filter((it) => {
    const hay = `${it.title} ${it.summary}`.toLowerCase()
    return kws.some((k) => hay.includes(k))
  })
}

/** 计算条目稳定 id（link 或 title hash），用于去重。 */
export function itemId(it: Record<string, string>): string {
  const base = it.link || it.title
  let h = 0
  for (let i = 0; i < base.length; i++) {
    h = (h * 31 + base.charCodeAt(i)) | 0
  }
  return `jm-${h.toString(16)}`
}

/** 构建 schedule_create 参数 + 自包含监控提示词（复用内置 dsh-schedule 协议）。 */
export function buildBriefing(topic: string, intervalDays: number): { every_seconds: number; schedule_prompt: string } {
  const everySeconds = Math.max(300, Math.max(1, Math.floor(intervalDays)) * 86400)
  const sourceIds = ECON_SOURCES.map((s) => s.id).join('、')
  const prompt = [
    `[经济文献简报] 主题：${topic}`,
    `监控源：${sourceIds}`,
    `步骤：1) 对每个源调用 journal_scan 拉取最近文献；2) 用 journal_filter 按主题关键词过滤；3) 用 journal_push 推送（dry-run 或 webhook）；4) 用 journal_status 查看去重记录。`,
    `只汇报真实抓取到的条目，不要臆造。`,
  ].join('\n')
  return { every_seconds: everySeconds, schedule_prompt: prompt }
}

/** 推送：默认 dry-run 只打印；配置 barkUrl / feishuUrl 任一才真实发送。 */
async function push(
  items: Array<Record<string, string>>,
  opts: { barkUrl?: string; feishuUrl?: string; dryRun?: boolean },
): Promise<{ pushed: Array<Record<string, string>>; skipped: number; dryRun: boolean }> {
  const state = readState()
  const newItems = items.filter((it) => !state.has(itemId(it)))
  const dryRun = opts.dryRun !== false && !opts.barkUrl && !opts.feishuUrl
  const sent: Array<Record<string, string>> = []
  for (const it of newItems) {
    const id = itemId(it)
    if (dryRun) {
      sent.push(it)
      appendState({ id, title: it.title, link: it.link, pushedAt: new Date().toISOString(), dryRun: true })
      continue
    }
    if (opts.barkUrl) {
      const body = `【${it.title}】\n${it.summary || ''}\n${it.link}`
      const r = await fetch(opts.barkUrl + encodeURIComponent(body), { signal: AbortSignal.timeout(15000) })
      if (!r.ok) throw new Error(`Bark push failed: HTTP ${r.status}`)
    }
    if (opts.feishuUrl) {
      const body = {
        msg_type: 'text',
        content: { text: `【${it.title}】\n${it.link}` },
      }
      const r = await fetch(opts.feishuUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      })
      if (!r.ok) throw new Error(`Feishu push failed: HTTP ${r.status}`)
    }
    appendState({ id, title: it.title, link: it.link, pushedAt: new Date().toISOString() })
    sent.push(it)
  }
  return { pushed: sent, skipped: newItems.length - sent.length, dryRun }
}

export function apply(ctx: any): void {
  ctx.tools.register(
    defineTool({
      name: 'journal_scan',
      description:
        '抓取经管期刊/工作论文源，返回论文条目列表。源：nber（RSS）、arxiv-econ.GN/EM/TH、arxiv-q-fin.GN（API）、任意 RSS/Atom URL（sourceUrl）。不传参数默认抓全部经济源。',
      parameters: {
        source: { type: 'string', description: '源 id：nber / arxiv-econ.GN / arxiv-econ.EM / arxiv-econ.TH / arxiv-q-fin.GN' },
        sourceUrl: { type: 'string', description: '自定义 RSS/Atom URL（可选，优先级高于 source）' },
        limit: { type: 'number', description: '最多返回条数，默认 20' },
      },
      output: {
        schema: {
          type: 'object',
          properties: {
            source: { type: 'string' },
            count: { type: 'number' },
            items: { type: 'array', items: { type: 'object', additionalProperties: true } },
            error: { type: 'string' },
          },
          additionalProperties: false,
        },
        render: (_args: unknown, value: any) => {
          if (value.error) return [{ type: 'text', text: `[journal_scan] ${value.error}` }]
          const lines = (value.items || []).map(
            (it: any, i: number) => `${i + 1}. ${it.title}\n   ${it.link}\n   ${it.date || ''}`,
          )
          return [{ type: 'text', text: `[journal_scan] ${value.source} 抓到 ${value.count} 条\n\n${lines.join('\n')}` }]
        },
      },
      execute: async (args: any) => {
        const limit = args.limit && Number(args.limit) > 0 ? Number(args.limit) : 20
        try {
          if (args.sourceUrl) {
            const items = await fetchFeed(args.sourceUrl)
            return { source: args.sourceUrl, count: items.length, items: items.slice(0, limit) }
          }
          if (args.source) {
            const src = ECON_SOURCES.find((s) => s.id === args.source)
            if (!src) return { error: `unknown source: ${args.source}（可用 ${ECON_SOURCES.map((s) => s.id).join('、')}）` }
            const items = await fetchSource(src, limit)
            return { source: args.source, count: items.length, items: items.slice(0, limit) }
          }
          // 默认抓全部 ECON_SOURCES
          const all: Array<Record<string, string>> = []
          for (const src of ECON_SOURCES) {
            try {
              all.push(...(await fetchSource(src, Math.ceil(limit / ECON_SOURCES.length))))
            } catch {
              // 单个源失败不阻断整体
            }
          }
          return { source: ECON_SOURCES.map((s) => s.id).join(', '), count: all.length, items: all.slice(0, limit) }
        } catch (e) {
          return { error: `fetch failed: ${e instanceof Error ? e.message : String(e)}` }
        }
      },
    }),
  )

  ctx.tools.register(
    defineTool({
      name: 'journal_filter',
      description:
        '按关键词过滤论文条目（标题+摘要小写匹配）。keywords 为空则原样返回。示例：["did", "causal", "labor supply", "china"]。',
      parameters: {
        items: { type: 'array', required: true, description: 'journal_scan 返回的 items' },
        keywords: { type: 'array', required: true, description: '关键词列表，支持子串匹配' },
      },
      output: {
        schema: {
          type: 'object',
          properties: {
            total: { type: 'number' },
            matched: { type: 'number' },
            items: { type: 'array', items: { type: 'object', additionalProperties: true } },
          },
          additionalProperties: false,
        },
        render: (_args: unknown, value: any) => {
          const lines = (value.items || []).map((it: any, i: number) => `${i + 1}. ${it.title}\n   ${it.link}`)
          return [{ type: 'text', text: `[journal_filter] ${value.total} 条中命中 ${value.matched} 条\n\n${lines.join('\n')}` }]
        },
      },
      execute: async (args: any) => {
        const matched = filterItems(args.items || [], args.keywords || [])
        return { total: (args.items || []).length, matched: matched.length, items: matched }
      },
    }),
  )

  ctx.tools.register(
    defineTool({
      name: 'journal_push',
      description:
        '推送论文条目（去重后）。默认 dry-run 只记录不发送；配置环境变量 DSH_BARK_URL 或 DSH_FEISHU_URL 后真实推送。返回 pushed/skipped/dryRun。',
      parameters: {
        items: { type: 'array', required: true, description: '要推送的条目（建议先 journal_filter）' },
        dryRun: { type: 'boolean', description: '强制 dry-run（默认：无 webhook 时为 dry-run）' },
      },
      output: {
        schema: {
          type: 'object',
          properties: {
            pushed: { type: 'number' },
            skipped: { type: 'number' },
            dryRun: { type: 'boolean' },
            titles: { type: 'array', items: { type: 'string' } },
            error: { type: 'string' },
          },
          additionalProperties: false,
        },
        render: (_args: unknown, value: any) => {
          if (value.error) return [{ type: 'text', text: `[journal_push] ${value.error}` }]
          const mode = value.dryRun ? 'DRY-RUN（未发送）' : '已推送'
          return [
            {
              type: 'text',
              text: `[journal_push] ${mode}：新推送 ${value.pushed} 条，去重跳过 ${value.skipped} 条\n\n${(value.titles || []).join('\n')}`,
            },
          ]
        },
      },
      execute: async (args: any) => {
        try {
          const res = await push(args.items || [], {
            barkUrl: process.env.DSH_BARK_URL,
            feishuUrl: process.env.DSH_FEISHU_URL,
            dryRun: args.dryRun !== undefined ? !!args.dryRun : undefined,
          })
          return {
            pushed: res.pushed.length,
            skipped: res.skipped,
            dryRun: res.dryRun,
            titles: res.pushed.map((it) => it.title),
          }
        } catch (e) {
          return { error: `push failed: ${e instanceof Error ? e.message : String(e)}` }
        }
      },
    }),
  )

  ctx.tools.register(
    defineTool({
      name: 'journal_status',
      description: '查看监控状态：已推送记录数、最近 N 条标题（去重依据）。',
      parameters: {
        limit: { type: 'number', description: '最近几条，默认 10' },
      },
      output: {
        schema: {
          type: 'object',
          properties: {
            total: { type: 'number' },
            recent: { type: 'array', items: { type: 'object', additionalProperties: true } },
            stateFile: { type: 'string' },
          },
          additionalProperties: false,
        },
        render: (_args: unknown, value: any) => {
          const lines = (value.recent || []).map((r: any) => `- ${r.title} (${r.pushedAt})`)
          return [
            {
              type: 'text',
              text: `[journal_status] 已记录 ${value.total} 条\n${lines.join('\n')}\nstate: ${value.stateFile}`,
            },
          ]
        },
      },
      execute: async (args: any) => {
        const f = stateFile()
        const state = readState()
        const limit = args.limit && Number(args.limit) > 0 ? Number(args.limit) : 10
        const lines = existsSync(f) ? readFileSync(f, 'utf8').split('\n').filter(Boolean) : []
        const recent = lines
          .slice(-limit)
          .map((l) => {
            try {
              return JSON.parse(l)
            } catch {
              return null
            }
          })
          .filter(Boolean)
        return { total: state.size, recent, stateFile: f }
      },
    }),
  )

  ctx.tools.register(
    defineTool({
      name: 'journal_briefing',
      description:
        '生成定时经济文献简报的 schedule_create 参数 + 自包含监控提示词（复用内置 dsh-schedule 的 schedule_create）。返回 every_seconds + schedule_prompt，可据此建立每日/每周监控。',
      parameters: {
        topic: { type: 'string', required: true, description: '简报主题（如「数字化转型」「货币政策」）' },
        interval_days: { type: 'number', description: '监控间隔天数，默认 1' },
      },
      output: {
        schema: {
          type: 'object',
          properties: {
            every_seconds: { type: 'number' },
            schedule_prompt: { type: 'string' },
            sources: { type: 'array', items: { type: 'string' } },
          },
          additionalProperties: false,
        },
        render: (_args: unknown, value: any) => {
          return [
            {
              type: 'text',
              text: `调用 schedule_create(prompt=<下方提示词>, every_seconds=${value.every_seconds}) 即可建立监控。\n监控源：${(value.sources || []).join('、')}\n\n提示词：\n${value.schedule_prompt}`,
            },
          ]
        },
      },
      execute: async (args: any) => {
        const { every_seconds, schedule_prompt } = buildBriefing(args.topic, args.interval_days ?? 1)
        return { every_seconds, schedule_prompt, sources: ECON_SOURCES.map((s) => s.id) }
      },
    }),
  )
}
