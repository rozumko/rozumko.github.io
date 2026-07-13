#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'

const DEFAULT_BASE_URL = 'https://rozumko-github-io.onrender.com'

function parseArgs(argv) {
  const args = {
    baseUrl: process.env.ROZUMKO_LOAD_BASE_URL || DEFAULT_BASE_URL,
    codes: process.env.ROZUMKO_LOAD_CODES || '',
    codesFile: process.env.ROZUMKO_LOAD_CODES_FILE || '',
    concurrency: Number(process.env.ROZUMKO_LOAD_CONCURRENCY || 10),
    answersPerAttempt: Number(process.env.ROZUMKO_LOAD_ANSWERS_PER_ATTEMPT || 3),
    heartbeatsPerAttempt: Number(process.env.ROZUMKO_LOAD_HEARTBEATS_PER_ATTEMPT || 0),
    validateCodes: process.env.ROZUMKO_LOAD_VALIDATE_CODES === 'true',
    finish: process.env.ROZUMKO_LOAD_FINISH !== 'false',
    thinkMs: Number(process.env.ROZUMKO_LOAD_THINK_MS || 100),
    timeoutMs: Number(process.env.ROZUMKO_LOAD_TIMEOUT_MS || 15000),
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    const next = argv[i + 1]
    if (arg === '--help' || arg === '-h') args.help = true
    else if (arg === '--base-url') { args.baseUrl = next; i += 1 }
    else if (arg === '--codes') { args.codes = next; i += 1 }
    else if (arg === '--codes-file') { args.codesFile = next; i += 1 }
    else if (arg === '--concurrency') { args.concurrency = Number(next); i += 1 }
    else if (arg === '--answers-per-attempt') { args.answersPerAttempt = Number(next); i += 1 }
    else if (arg === '--heartbeats-per-attempt') { args.heartbeatsPerAttempt = Number(next); i += 1 }
    else if (arg === '--validate-codes') args.validateCodes = true
    else if (arg === '--think-ms') { args.thinkMs = Number(next); i += 1 }
    else if (arg === '--timeout-ms') { args.timeoutMs = Number(next); i += 1 }
    else if (arg === '--no-finish') args.finish = false
    else throw new Error(`Unknown argument: ${arg}`)
  }

  args.baseUrl = String(args.baseUrl || '').replace(/\/+$/, '')
  return args
}

function printHelp() {
  console.log(`Usage:
  node scripts/load-test-attempt-flow.mjs --base-url https://staging.example.com --codes-file codes.txt --concurrency 25

Options:
  --base-url URL              Backend URL. Default: ${DEFAULT_BASE_URL}
  --codes A,B,C               Comma or whitespace separated olympiad codes.
  --codes-file PATH           Text file with one or more codes per line.
  --concurrency N             Parallel students. Default: 10.
  --answers-per-attempt N     Questions to answer before finish. Default: 3.
  --heartbeats-per-attempt N  Heartbeats to send per student. Default: 0.
  --validate-codes            Validate every code before exchange.
  --think-ms N                Delay between answers per student. Default: 100.
  --timeout-ms N              Per-request timeout. Default: 15000.
  --no-finish                 Do not call /finish after answers.

Environment variables mirror the option names:
  ROZUMKO_LOAD_BASE_URL
  ROZUMKO_LOAD_CODES
  ROZUMKO_LOAD_CODES_FILE
  ROZUMKO_LOAD_CONCURRENCY
  ROZUMKO_LOAD_ANSWERS_PER_ATTEMPT
  ROZUMKO_LOAD_HEARTBEATS_PER_ATTEMPT
  ROZUMKO_LOAD_VALIDATE_CODES=true
  ROZUMKO_LOAD_THINK_MS
  ROZUMKO_LOAD_TIMEOUT_MS
  ROZUMKO_LOAD_FINISH=false
`)
}

function readCodes(args) {
  const parts = []
  if (args.codes) parts.push(args.codes)
  if (args.codesFile) parts.push(readFileSync(args.codesFile, 'utf8'))

  return parts
    .join('\n')
    .split(/[\s,;]+/)
    .map(code => code.trim())
    .filter(Boolean)
}

function percentile(values, p) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
  return sorted[idx]
}

function makeAnswer(question) {
  const type = question.type || 'choice'
  const options = question.options

  if (type === 'sort' && Array.isArray(options?.items)) {
    return options.items.map((_, index) => index)
  }
  if (type === 'match' && Array.isArray(options?.left)) {
    return options.left.map((_, index) => index)
  }
  if (type === 'input') return 'test'
  if (type === 'sequence') return 0
  return 0
}

async function requestJson(args, path, options = {}) {
  const controller = new AbortController()
  const started = performance.now()
  const timeout = setTimeout(() => controller.abort(), args.timeoutMs)

  try {
    const response = await fetch(`${args.baseUrl}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    })
    const elapsedMs = performance.now() - started
    const text = await response.text()
    const body = text ? safeJson(text) : {}

    if (!response.ok) {
      const message = body?.error || text || response.statusText
      const error = new Error(`${response.status} ${message}`)
      error.status = response.status
      error.elapsedMs = elapsedMs
      throw error
    }

    return { body, elapsedMs, status: response.status }
  } finally {
    clearTimeout(timeout)
  }
}

function safeJson(text) {
  try { return JSON.parse(text) } catch { return null }
}

async function runStudent(args, code, index) {
  const metrics = []
  const startedAt = performance.now()

  if (args.validateCodes) {
    const validated = await requestJson(args, `/api/student/validate-code?code=${encodeURIComponent(code)}`)
    metrics.push({ step: 'validate', elapsedMs: validated.elapsedMs })
  }

  const exchanged = await requestJson(args, '/api/student/exchange-code', {
    method: 'POST',
    body: JSON.stringify({ code }),
  })
  metrics.push({ step: 'exchange', elapsedMs: exchanged.elapsedMs })

  const { attemptId, attemptToken, questions = [] } = exchanged.body
  if (!attemptId || !attemptToken) throw new Error('exchange-code response missing attemptId or attemptToken')

  for (let i = 0; i < args.heartbeatsPerAttempt; i += 1) {
    const heartbeat = await requestJson(args, `/api/attempt/${attemptId}/heartbeat`, {
      method: 'POST',
      headers: { 'X-Attempt-Token': attemptToken },
      body: JSON.stringify({}),
    })
    metrics.push({ step: 'heartbeat', elapsedMs: heartbeat.elapsedMs })
  }

  const answerCount = Math.min(args.answersPerAttempt, questions.length)
  for (let i = 0; i < answerCount; i += 1) {
    if (args.thinkMs > 0) await delay(args.thinkMs)
    const question = questions[i]
    const answered = await requestJson(args, `/api/attempt/${attemptId}/answer`, {
      method: 'POST',
      headers: { 'X-Attempt-Token': attemptToken },
      body: JSON.stringify({
        questionId: question.id,
        answer: makeAnswer(question),
      }),
    })
    metrics.push({ step: 'answer', elapsedMs: answered.elapsedMs })
  }

  if (args.finish) {
    const finished = await requestJson(args, `/api/attempt/${attemptId}/finish`, {
      method: 'POST',
      headers: { 'X-Attempt-Token': attemptToken },
      body: JSON.stringify({}),
    })
    metrics.push({ step: 'finish', elapsedMs: finished.elapsedMs })
  }

  return {
    code,
    index,
    ok: true,
    totalMs: performance.now() - startedAt,
    metrics,
  }
}

async function runPool(args, codes) {
  const queue = codes.map((code, index) => ({ code, index }))
  const results = []

  async function worker() {
    while (queue.length > 0) {
      const item = queue.shift()
      try {
        results.push(await runStudent(args, item.code, item.index))
        process.stdout.write('.')
      } catch (error) {
        results.push({
          code: item.code,
          index: item.index,
          ok: false,
          error: error.message,
          status: error.status,
          elapsedMs: error.elapsedMs,
        })
        process.stdout.write('x')
      }
    }
  }

  const workerCount = Math.min(args.concurrency, codes.length)
  await Promise.all(Array.from({ length: workerCount }, worker))
  process.stdout.write('\n')
  return results.sort((a, b) => a.index - b.index)
}

function printSummary(results) {
  const ok = results.filter(result => result.ok)
  const failed = results.filter(result => !result.ok)
  const totalMs = ok.map(result => result.totalMs)
  const stepMs = {}

  for (const result of ok) {
    for (const metric of result.metrics) {
      stepMs[metric.step] ||= []
      stepMs[metric.step].push(metric.elapsedMs)
    }
  }

  console.log('\nSummary')
  console.log(`  total: ${results.length}`)
  console.log(`  ok: ${ok.length}`)
  console.log(`  failed: ${failed.length}`)
  console.log(`  total p50/p95/max ms: ${Math.round(percentile(totalMs, 50))}/${Math.round(percentile(totalMs, 95))}/${Math.round(Math.max(0, ...totalMs))}`)

  for (const [step, values] of Object.entries(stepMs)) {
    console.log(`  ${step} p50/p95/max ms: ${Math.round(percentile(values, 50))}/${Math.round(percentile(values, 95))}/${Math.round(Math.max(0, ...values))}`)
  }

  if (failed.length > 0) {
    console.log('\nFailures')
    for (const result of failed.slice(0, 20)) {
      console.log(`  ${result.code}: ${result.error}`)
    }
    if (failed.length > 20) console.log(`  ...${failed.length - 20} more`)
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    printHelp()
    return
  }
  if (!args.baseUrl) throw new Error('Missing --base-url')
  if (!Number.isInteger(args.concurrency) || args.concurrency < 1) throw new Error('--concurrency must be a positive integer')
  if (!Number.isInteger(args.answersPerAttempt) || args.answersPerAttempt < 0) throw new Error('--answers-per-attempt must be a non-negative integer')
  if (!Number.isInteger(args.heartbeatsPerAttempt) || args.heartbeatsPerAttempt < 0) throw new Error('--heartbeats-per-attempt must be a non-negative integer')

  const codes = readCodes(args)
  if (codes.length === 0) throw new Error('Provide test codes with --codes or --codes-file')

  console.log(`Target: ${args.baseUrl}`)
  console.log(`Codes: ${codes.length}`)
  console.log(`Concurrency: ${args.concurrency}`)
  console.log(`Answers per attempt: ${args.answersPerAttempt}`)
  console.log(`Heartbeats per attempt: ${args.heartbeatsPerAttempt}`)
  console.log(`Validate codes: ${args.validateCodes}`)
  console.log(`Finish attempts: ${args.finish}`)
  console.log('')

  const started = performance.now()
  const results = await runPool(args, codes)
  printSummary(results)
  console.log(`\nWall time: ${Math.round(performance.now() - started)} ms`)

  if (results.some(result => !result.ok)) process.exitCode = 1
}

main().catch(error => {
  console.error(error.message)
  process.exitCode = 1
})
