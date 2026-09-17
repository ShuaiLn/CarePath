/// <reference types="node" />
import { describe, it, expect, vi } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { createOllamaExtractionClient } from './adapters/llm/ollamaClient'

/**
 * Regression guard for CarePath's local/offline architecture mandate: the
 * only network activity CarePath may ever perform in production is (a) the
 * single Ollama request from ollamaClient.ts to the configured loopback
 * host/port, gated by loopbackGuard.isLoopbackUrl(), and (b) same-origin
 * static asset loads of the app's own build output. Anything else is a
 * regression.
 *
 * This is a lexical source scan, not a sandbox — see
 * scripts/checkNoExternalNetworkCalls.mjs for the build-output-level
 * complement, which catches anything a dynamically-constructed URL or a
 * non-standard primitive might let slip past this regex-based check.
 */

const SRC_DIR = join(process.cwd(), 'src')

const NETWORK_PRIMITIVE_PATTERNS: RegExp[] = [
  /\bfetch\(/,
  /\bnew XMLHttpRequest\b/,
  /\bnew WebSocket\b/,
  /\bnew EventSource\b/,
  /\bnavigator\.sendBeacon\b/,
]

/** The single file allowed to contain a network-primitive call — it's the
 * one place `fetch` is ever called from src/, and it's loopback-gated (see
 * loopbackGuard.ts and the second test below). */
const ALLOWED_FILES = new Set(['adapters/llm/ollamaClient.ts'])

function walkSourceFiles(dir: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      files.push(...walkSourceFiles(full))
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry)) {
      files.push(full)
    }
  }
  return files
}

describe('network surface audit — source-level', () => {
  it('contains no network-primitive call site anywhere in src/ outside the single allowlisted, loopback-gated file', () => {
    const violations: string[] = []
    for (const file of walkSourceFiles(SRC_DIR)) {
      const relPath = relative(SRC_DIR, file).split(sep).join('/')
      if (ALLOWED_FILES.has(relPath)) continue
      const content = readFileSync(file, 'utf8')
      for (const pattern of NETWORK_PRIMITIVE_PATTERNS) {
        if (pattern.test(content)) {
          violations.push(`${relPath}: matches ${pattern}`)
        }
      }
    }
    expect(violations).toEqual([])
  })

  it('the one allowlisted file still actually contains a network-primitive call — catches a stale allowlist entry', () => {
    const content = readFileSync(join(SRC_DIR, 'adapters/llm/ollamaClient.ts'), 'utf8')
    expect(NETWORK_PRIMITIVE_PATTERNS.some((p) => p.test(content))).toBe(true)
  })

  it('ollamaClient.ts refuses to send a request when its base URL fails isLoopbackUrl() — proves the guard is actually wired up at the one permitted call site, not just present somewhere in the file', async () => {
    const originalFetch = globalThis.fetch
    const fetchSpy = vi.fn()
    globalThis.fetch = fetchSpy
    try {
      const client = createOllamaExtractionClient('https://not-loopback.example.com')
      await expect(client.extract({ message: 'hi', questionId: 'initial', relevantExistingFields: {} })).rejects.toThrow()
      expect(fetchSpy).not.toHaveBeenCalled()
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
