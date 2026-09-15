import type { IncomingMessage, ServerResponse } from 'node:http'
import { handleExtractRequest } from '../_lib/extractHandler'
import { createOpenAIExtractionClient } from '../_lib/openaiClient'
import { logRequestMetadata } from '../_lib/logging'

/** Generous for a single chat message plus a minimal prior-fields slice —
 * see docs plan Part 3 "Abuse prevention: request body size caps." */
const MAX_BODY_BYTES = 32 * 1024

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        req.destroy()
        reject(new Error('payload_too_large'))
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8')
        resolve(raw.length > 0 ? JSON.parse(raw) : {})
      } catch {
        reject(new Error('invalid_json'))
      }
    })
    req.on('error', reject)
  })
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

/**
 * POST /api/llm/extract — Vercel Node.js function. Stateless: nothing here
 * is persisted server-side (docs plan Part 9 "the backend itself, as
 * designed, should be stateless"). A plain Node http handler (no
 * @vercel/node dependency) so this deploys unmodified while staying easy
 * to unit-test — the actual logic lives in handleExtractRequest, which
 * this file just wires up to a real request/response and a real OpenAI
 * client.
 */
export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const startedAt = Date.now()

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'method_not_allowed' })
    return
  }

  let body: unknown
  try {
    body = await readJsonBody(req)
  } catch {
    sendJson(res, 400, { error: 'invalid_request' })
    return
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    // Missing configuration must never crash the function — the client
    // treats any non-2xx identically to a network failure and falls back
    // to the offline mock automatically.
    sendJson(res, 503, { error: 'llm_backend_unavailable' })
    return
  }

  try {
    const openai = createOpenAIExtractionClient(apiKey, process.env.OPENAI_EXTRACTION_MODEL)
    const result = await handleExtractRequest(body, { openai })
    logRequestMetadata({ route: 'llm/extract', status: result.status, latencyMs: Date.now() - startedAt })
    sendJson(res, result.status, result.body)
  } catch {
    // Defense in depth: handleExtractRequest should never throw, but never
    // let an unexpected error leak a stack trace or message to the client.
    logRequestMetadata({ route: 'llm/extract', status: 500, latencyMs: Date.now() - startedAt })
    sendJson(res, 500, { error: 'internal_error' })
  }
}
