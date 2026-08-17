#!/usr/bin/env node
/**
 * probe-schedule.mjs — 定时调度协议端到端探针（门禁：journal_briefing ↔ dsh-schedule 真实协议）
 *
 * 用法：node scripts/probe-schedule.mjs
 * 验证项（用真实 @deepseek-ai/dsh-schedule 的 createEveryScheduleRecord，非 mock）：
 *   1. journal_briefing 生成的 every_seconds 能通过 dsh-schedule 的真实校验（safe int ≥300）
 *   2. 生成的 schedule_prompt 非空（dsh-schedule 的 invalid_prompt 校验）
 *   3. 多日间隔（7 天）同样通过
 *   4. 非法输入（<300）被 dsh-schedule 正确拒绝（验证探针本身不误报）
 * 退出码：0 = 全过；1 = 任一失败
 */
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

const req = createRequire(import.meta.url)
const schedule = await import(pathToFileURL(req.resolve('@deepseek-ai/dsh-schedule')).href)
const m = await import(new URL('../lib/index.js', import.meta.url).href)

const { createEveryScheduleRecord, MIN_EVERY_INTERVAL_SECONDS, ScheduleInputError } = schedule
const { buildBriefing } = m

let failures = 0
const report = (ok, msg) => {
  console.log(`${ok ? '✓' : '✗'} ${msg}`)
  if (!ok) failures++
}

console.log(`dsh-schedule 真实校验：MIN_EVERY_INTERVAL_SECONDS = ${MIN_EVERY_INTERVAL_SECONDS}`)
report(MIN_EVERY_INTERVAL_SECONDS === 300, `协议下限 300 秒（实际 ${MIN_EVERY_INTERVAL_SECONDS}）`)

// 场景 1：每日简报
const daily = buildBriefing('中国贸易与全球价值链', 1)
try {
  const rec = createEveryScheduleRecord('test-1', daily.schedule_prompt, daily.every_seconds, Date.now())
  report(rec.kind === 'every' && rec.everySeconds === 86400, `每日简报通过真实协议：every_seconds=${rec.everySeconds}`)
  report(rec.prompt.includes('journal_scan'), `schedule_prompt 含监控指令（journal_scan）`)
} catch (e) {
  report(false, `每日简报被拒绝：${e instanceof Error ? e.message : String(e)}`)
}

// 场景 2：每周简报（7 天）
const weekly = buildBriefing('货币政策', 7)
try {
  const rec = createEveryScheduleRecord('test-2', weekly.schedule_prompt, weekly.every_seconds, Date.now())
  report(rec.everySeconds === 7 * 86400, `每周简报通过：every_seconds=${rec.everySeconds}（7 天）`)
} catch (e) {
  report(false, `每周简报被拒绝：${e instanceof Error ? e.message : String(e)}`)
}

// 场景 3：协议拒绝非法值（验证探针本身严格）
try {
  createEveryScheduleRecord('test-3', 'x', 100, Date.now())
  report(false, '非法 every_seconds(100) 未被拒绝——探针失效')
} catch (e) {
  report(/frequency_too_high|every_seconds must be at least/.test(e.message), `非法值被真实协议拒绝（${e instanceof Error ? e.message : String(e)}）`)
}

// 场景 4：空 prompt 被拒绝
try {
  createEveryScheduleRecord('test-4', '   ', 86400, Date.now())
  report(false, '空 prompt 未被拒绝')
} catch (e) {
  report(e.name === 'ScheduleInputError' && /non-empty after trimming/.test(e.message), `空 prompt 被真实协议拒绝（${e instanceof Error ? e.message : String(e)}）`)
}

if (failures > 0) {
  console.error(`\n✗ ${failures} 项失败`)
  process.exit(1)
}
console.log('\n✓ 定时调度协议端到端探针全部通过（真实 dsh-schedule API）')
process.exit(0)
