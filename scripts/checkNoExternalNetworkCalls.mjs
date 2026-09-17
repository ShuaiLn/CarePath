#!/usr/bin/env node
// Fails the build if the production client bundle (dist/) contains any
// https:// literal, or an http:// literal whose host isn't a loopback
// address (127.0.0.1, localhost, ::1). This is the dist-level complement to
// src/networkSurfaceAudit.test.ts's source-level scan — it catches anything
// that scan's regex patterns might miss after bundling/minification, though
// (like that test) it's a lexical string scan, not a sandbox, and can't
// catch a dynamically-constructed URL. Run after `npm run build`.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const DIST_DIR = 'dist'

const HTTPS_PATTERN = /https:\/\/[^\s"'`)]+/g
const HTTP_BRACKET_PATTERN = /http:\/\/\[([^\]]+)\]/g
const HTTP_PLAIN_PATTERN = /http:\/\/(?!\[)([^\s"'`)/:]+)/g

/**
 * Literals and hosts, verified by inspecting dist/ output, that are
 * known-inert constants baked in by dependencies — never fetched by
 * CarePath or anyone else at runtime. Re-verify this list (grep
 * dist/assets/*.js for the pattern) whenever React/Zod/Tailwind are
 * upgraded, since a version bump can add, remove, or relocate these:
 *   - React's own dev-mode error/warning message links (react.dev/errors,
 *     a historical tinyurl.com short-link, bit.ly below) — inert strings
 *     printed to the console, never fetched by React or by CarePath.
 *   - Zod's JSON Schema `$schema` draft-version identifiers
 *     (json-schema.org below) — inert string values assigned to a
 *     generated schema's `$schema` field, never fetched.
 *     `EXTRACTION_JSON_SCHEMA` (src/adapters/llm/extractionSchema.ts)
 *     doesn't use these, but zod's bundled code includes them regardless.
 *   - Zod's IPv6-format validator, which checks syntax via
 *     `new URL('http://[' + candidate + ']')` — the URL constructor never
 *     performs I/O, so this is a syntax check, not a request (handled
 *     separately below, not via either allowlist).
 *   - Standard W3C XML namespace URIs (SVG/MathML/xlink/xml,
 *     www.w3.org below) — required literal values for namespaced DOM
 *     elements, not network calls.
 *   - Tailwind's standard MIT-license header comment, which it prepends
 *     to its generated CSS output — dead text in a comment, not code.
 */
const KNOWN_INERT_LITERALS = new Set([
  'https://react.dev/errors/',
  'https://tinyurl.com/y2uuvskb',
  'https://json-schema.org/draft/2020-12/schema',
  'https://tailwindcss.com',
])

function isKnownInertLiteral(fullMatch) {
  for (const literal of KNOWN_INERT_LITERALS) {
    if (fullMatch.startsWith(literal)) return true
  }
  return false
}

/** The plain (non-https, non-bracket) http:// pattern below only ever
 * captures a host — it stops at the first `/`, so the same known-inert
 * dependency constants above show up here truncated to just their host.
 * Listed by host rather than full string for that reason. */
const KNOWN_INERT_HTTP_HOSTS = new Set(['www.w3.org', 'json-schema.org', 'bit.ly'])

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

function isLoopbackHost(host) {
  return host === '127.0.0.1' || host === 'localhost' || host === '::1'
}

function isAllowedHttpHost(host) {
  return isLoopbackHost(host) || KNOWN_INERT_HTTP_HOSTS.has(host)
}

let failed = false

for (const file of walk(DIST_DIR)) {
  const content = readFileSync(file, 'utf8')

  for (const match of content.match(HTTPS_PATTERN) ?? []) {
    if (isKnownInertLiteral(match)) continue
    console.error(`FAIL: ${file} contains an https:// literal: ${match}`)
    failed = true
  }

  HTTP_BRACKET_PATTERN.lastIndex = 0
  let bracketMatch
  while ((bracketMatch = HTTP_BRACKET_PATTERN.exec(content)) !== null) {
    // A bracket "host" containing template-interpolation syntax (e.g.
    // zod's IPv6 validator building `http://[${candidate}]` to run through
    // the URL constructor as a syntax check) isn't a literal hardcoded
    // host at all — it's minified source text, not an evaluated string.
    if (/[${}]/.test(bracketMatch[1])) continue
    if (!isLoopbackHost(bracketMatch[1])) {
      console.error(`FAIL: ${file} contains an http:// literal targeting a non-loopback host: ${bracketMatch[0]}`)
      failed = true
    }
  }

  HTTP_PLAIN_PATTERN.lastIndex = 0
  let plainMatch
  while ((plainMatch = HTTP_PLAIN_PATTERN.exec(content)) !== null) {
    if (!isAllowedHttpHost(plainMatch[1])) {
      console.error(`FAIL: ${file} contains an http:// literal targeting a non-loopback host: ${plainMatch[0]}`)
      failed = true
    }
  }
}

if (failed) {
  console.error('Offline-safety check FAILED — see above.')
  process.exit(1)
}
console.log('OK: dist/ contains no https:// literals and no http:// literals targeting a non-loopback host.')
