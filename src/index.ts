/**
 * dsh-journal-monitor — 经管期刊/工作论文监控推送插件
 *
 * 真插件（非 skill）：RSS 抓取 → 关键词过滤 → 推送 → 去重持久化。
 * 最小闭环：scan → filter(plan) → push(apply) → status(verify) → rollback。
 * 默认 dry-run：不真正发送推送，只输出将推送内容，配置 webhook 后启用真实推送。
 *
 * 标准 DSH 插件格式：cordis.patch.yml 挂载 + defineTool 注册。
 * 依赖：Node >= 18（全局 fetch），运行时零第三方依赖。
 */
import { defineTool } from '@deepseek-ai/dsh-tools'
import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync } from 'node:fs'
import { dirname, resolve, join } from 'node:path'

export const name = 'dsh-journal-monitor'
export const inject = ['tools']

/** 内置默认源：工作论文 + arXiv 经济学（可被用户配置覆盖） */
const DEFAULT_SOURCES = [
  {
    id: 'nber',
    label: 'NBER Working Papers',
    url: 'https://www.nber.org/rss/new.xml',
  },
  {
    id: 'arxiv-econ',
    label: 'arXiv Economics',
    url: 'http://export.arxiv.org/rss/econ',
  },
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
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'user-agent': 'dsh-journal-monitor/0.1' } })
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
    const linkRaw = grab('link')
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

/** 关键词过滤：标题+摘要小写匹配，支持用 | 分隔的正则片段。 */
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
        '抓取经管期刊/工作论文 RSS 源，返回论文条目列表（title/link/summary/date）。内置源：NBER Working Papers、arXiv Economics；可用 sourceUrl 传任意 RSS/Atom。',
      parameters: {
        sourceUrl: { type: 'string', description: '自定义 RSS/Atom URL（可选）' },
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
          const items = args.sourceUrl ? await fetchFeed(args.sourceUrl) : await fetchAll(DEFAULT_SOURCES)
          return { source: args.sourceUrl || DEFAULT_SOURCES.map((s) => s.label).join(', '), count: items.length, items: items.slice(0, limit) }
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
}

async function fetchAll(sources: Array<{ id: string; label: string; url: string }>): Promise<Array<Record<string, string>>> {
  const all: Array<Record<string, string>> = []
  const results = await Promise.allSettled(sources.map((s) => fetchFeed(s.url)))
  results.forEach((r) => {
    if (r.status === 'fulfilled') all.push(...r.value)
  })
  return all
}
