/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Optional override for the local Ollama daemon's base URL. Defaults to
   * `http://127.0.0.1:11434` (Ollama's standard local address) when unset.
   *
   * LOOPBACK-ONLY: this value is read client-side and is therefore
   * user-editable — nothing at the type level stops it from being pointed
   * at a remote host. `LocalLlmAdapter` validates the hostname against an
   * explicit loopback allowlist (`127.0.0.1`, `localhost`, `::1`) before
   * ever attempting a request (see `src/adapters/llm/loopbackGuard.ts`); a
   * non-loopback value is accepted by this type but rejected at runtime,
   * falling back to the offline mock with no request ever sent.
   */
  readonly VITE_OLLAMA_BASE_URL?: string
  /**
   * Optional override for the Ollama model name (see
   * `src/adapters/llm/ollamaClient.ts`'s DEFAULT_MODEL).
   */
  readonly VITE_OLLAMA_MODEL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
