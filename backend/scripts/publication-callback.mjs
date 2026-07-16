import { createHmac } from 'node:crypto'

const status = process.argv[2]
if (!['running', 'succeeded', 'failed'].includes(status)) throw new Error('Invalid publication callback status')
const publicationId = process.env.PUBLICATION_ID
const baseUrl = process.env.CONTENT_PUBLISH_BACKEND_URL?.replace(/\/+$/, '')
const secret = process.env.CONTENT_PUBLISH_CALLBACK_SECRET
if (!publicationId || !baseUrl || !secret) throw new Error('Publication callback is not configured')
const url = new URL(`${baseUrl}/api/content-publication/callback`)
if (url.protocol !== 'https:') throw new Error('Publication callback requires HTTPS')

const body = {
  publicationId,
  status,
  workflowRunId: process.env.GITHUB_RUN_ID || undefined,
  workflowUrl: process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
    ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : undefined,
  sourceSha: process.env.GITHUB_SHA || undefined,
  manifestSha256: process.env.PUBLISHED_MANIFEST_SHA256 || undefined,
  failureReason: status === 'failed' ? 'GitHub Actions publication failed' : undefined,
}
const timestamp = String(Math.floor(Date.now() / 1000))
const message = [timestamp, body.publicationId, body.status, body.workflowRunId ?? '', body.workflowUrl ?? '',
  body.sourceSha ?? '', body.manifestSha256 ?? '', body.failureReason ?? ''].join('\n')
const signature = createHmac('sha256', secret).update(message).digest('hex')
let lastError
for (const delayMs of [0, 1000, 3000]) {
  if (delayMs) await new Promise(resolve => setTimeout(resolve, delayMs))
  try {
    const response = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Publication-Timestamp': timestamp, 'X-Publication-Signature': signature },
      body: JSON.stringify(body),
    })
    if (response.ok) process.exit(0)
    lastError = new Error(`Publication callback failed: ${response.status}`)
  } catch (error) {
    lastError = error
  }
}
throw lastError
