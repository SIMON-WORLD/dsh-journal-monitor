import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { push, itemId } from '../src/index.ts'

/** 启动本地 mock 服务器，记录收到的请求。 */
function startMock() {
  const received = []
  const server = createServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      received.push({ method: req.method, url: req.url, body })
      res.writeHead(200, { 'content-type': 'text/plain' })
      res.end('ok')
    })
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port
      resolve({ server, port, received })
    })
  })
}

const tmpState = () => {
  const dir = mkdtempSync(join(tmpdir(), 'jm-test-'))
  return { dir, file: join(dir, 'state.jsonl') }
}

test('push: dry-run 不发请求且记录状态（去重依据）', async () => {
  const { server, port, received } = await startMock()
  const { dir, file } = tmpState()
  try {
    process.env.DSH_JOURNAL_STATE = file
    const items = [{ title: 'A', link: 'https://x/1', summary: '' }]
    // dryRun 强制 + 有 barkUrl 也必须是 dry-run（dryRun 优先级最高）
    const r1 = await push(items, { barkUrl: `http://127.0.0.1:${port}/`, dryRun: true })
    assert.equal(r1.dryRun, true)
    assert.equal(r1.pushed.length, 1)
    assert.equal(received.length, 0, 'dry-run 不应发请求')
    // 同一条再推 → 去重，不再处理（pushed=0，未新增请求）
    const r2 = await push(items, { dryRun: true })
    assert.equal(r2.pushed.length, 0, '重复条目不应再次推送')
    assert.equal(received.length, 0, 'dry-run 全程不发请求')
  } finally {
    server.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('push: barkUrl 真实发送 GET 请求（Bark 是 URL 拼接式）', async () => {
  const { server, port, received } = await startMock()
  const { dir, file } = tmpState()
  try {
    process.env.DSH_JOURNAL_STATE = file
    const items = [{ title: 'Bark Test Paper', link: 'https://x/2', summary: '' }]
    const r = await push(items, { barkUrl: `http://127.0.0.1:${port}/bark/` })
    assert.equal(r.dryRun, false)
    assert.equal(r.pushed.length, 1)
    assert.equal(received.length, 1)
    assert.equal(received[0].method, 'GET')
    assert.match(received[0].url, /bark\//)
    assert.match(decodeURIComponent(received[0].url), /Bark Test Paper/)
  } finally {
    server.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('push: feishuUrl 真实发送 POST JSON', async () => {
  const { server, port, received } = await startMock()
  const { dir, file } = tmpState()
  try {
    process.env.DSH_JOURNAL_STATE = file
    const items = [{ title: 'Feishu Test', link: 'https://x/3', summary: '' }]
    const r = await push(items, { feishuUrl: `http://127.0.0.1:${port}/feishu` })
    assert.equal(r.dryRun, false)
    assert.equal(r.pushed.length, 1)
    assert.equal(received.length, 1)
    assert.equal(received[0].method, 'POST')
    assert.match(received[0].body, /Feishu Test/)
    assert.match(received[0].body, /msg_type/)
  } finally {
    server.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('push: 真实推送后再次推送去重（状态持久化生效）', async () => {
  const { server, port, received } = await startMock()
  const { dir, file } = tmpState()
  try {
    process.env.DSH_JOURNAL_STATE = file
    const items = [{ title: 'Dedup Test', link: 'https://x/4', summary: '' }]
    await push(items, { feishuUrl: `http://127.0.0.1:${port}/feishu` })
    assert.equal(received.length, 1)
    // 同一条再推（同一状态文件）→ 去重，不再发请求
    const r2 = await push(items, { feishuUrl: `http://127.0.0.1:${port}/feishu` })
    assert.equal(r2.pushed.length, 0, '去重后不应重复推送')
    assert.equal(received.length, 1, '去重后不应重复发请求')
  } finally {
    server.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('itemId: link 相同去重稳定', () => {
  const a = { title: 'X', link: 'https://nber.org/papers/w1', summary: '' }
  const b = { title: 'X (copy)', link: 'https://nber.org/papers/w1', summary: '' }
  assert.equal(itemId(a), itemId(b))
})
