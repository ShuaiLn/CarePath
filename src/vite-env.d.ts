/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_LLM_BACKEND_URL?: string
  readonly VITE_PLACES_BACKEND_URL?: string
  readonly VITE_CMS_BACKEND_URL?: string
  readonly VITE_MEDICATION_BACKEND_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
