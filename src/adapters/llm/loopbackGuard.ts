/**
 * Single source of truth for "is this URL a loopback address." `VITE_OLLAMA_BASE_URL`
 * is a client-readable, user-editable setting — nothing stops it from being
 * pointed at a remote machine or a hosted Ollama-compatible endpoint, which
 * would defeat the "fully local" guarantee even though the code path looks
 * identical. This guard is checked both by `LocalLlmAdapter` (before it ever
 * constructs a request) and by `ollamaClient.ts` itself (the one place
 * `fetch` is ever called from `src/`, as defense in depth) — see
 * `networkSurfaceAudit.test.ts`, which statically verifies that call site is
 * actually gated by this function.
 *
 * Deliberately narrow: only the exact loopback hostnames, not the whole
 * 127.0.0.0/8 range or any other private-network address — a LAN address is
 * not "this machine."
 */
const LOOPBACK_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '::1', '[::1]'])

export function isLoopbackUrl(rawUrl: string): boolean {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return false
  }
  return LOOPBACK_HOSTNAMES.has(url.hostname)
}
