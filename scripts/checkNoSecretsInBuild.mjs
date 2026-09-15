#!/usr/bin/env node
// Fails the build if the production client bundle (dist/) contains an
// OpenAI-shaped API key literal or the server-only env var name. Run after
// `npm run build`. See docs plan Part 8.5 — this is the CI gate for "API
// keys never reach the client"; wire it into CI once this repo has one.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const DIST_DIR = 'dist'
const FORBIDDEN_PATTERNS = [/sk-[A-Za-z0-9_-]{10,}/, /OPENAI_API_KEY/, /GOOGLE_PLACES_API_KEY/]

function walk(dir) {
  const entries = readdirSync(dir)
  const files = []
  for (const entry of entries) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) files.push(...walk(full))
    else files.push(full)
  }
  return files
}

let failed = false
for (const file of walk(DIST_DIR)) {
  const content = readFileSync(file, 'utf8')
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(content)) {
      console.error(`FAIL: ${file} matches forbidden pattern ${pattern}`)
      failed = true
    }
  }
}

if (failed) {
  console.error('Secret/credential-name check FAILED — see above.')
  process.exit(1)
}
console.log('OK: no API key literals or server-only env var names found in dist/.')
