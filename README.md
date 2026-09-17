# CarePath AI

A healthcare navigation web app — **not a diagnosis tool**. It helps a user figure
out how urgent their symptoms are, where to go (ER / Urgent Care / Primary Care),
what specialty might come next, and how to brief a doctor — using deterministic
safety rules for anything care-level-related, with an LLM used only for language
understanding and explanation. See [docs/CarePath_AI_Plan.md](docs/CarePath_AI_Plan.md)
for the full product/technical plan this app implements.

## Stack

React + TypeScript + Vite, Tailwind CSS, Dexie (IndexedDB) for local-first storage,
Vitest for tests.

## Run it

```bash
npm install
npm run dev       # starts the dev server, prints a local URL
```

No API keys are required to run the app, and there is no backend of any kind —
CarePath is a fully local/offline, backend-less static SPA. The LLM adapter
always attempts a real extraction first, via a locally-running Ollama daemon on
this machine (see "Ollama local AI setup" below); every other external
integration (Google Places, CMS pricing/quality data, medication lookups) is
still always a deterministic local mock.

## Using the app

Open the dev server URL in a browser and walk through the four stages shown in
the progress bar at the top:

1. **Symptoms** — describe what's going on in the chat window. CarePath asks
   progressive follow-up questions until it has enough structured information to
   assess you; you can end the conversation once "I'm done" becomes available.
2. **Confirm** — review every symptom/fact it understood (reported / denied /
   unknown) and correct anything before it's used for the assessment. Nothing
   from the chat is used silently — you confirm it first.
3. **Result** — see the resulting care level (e.g. Emergency, Urgent Care,
   Primary Care) with a plain-language explanation, a routing hierarchy, and
   nearby facility suggestions (when the case isn't an emergency).
4. **Visit Summary** — generate a doctor-visit summary to print or bring to your
   appointment, and optionally look up a medication.

All data is stored locally in this browser (IndexedDB via Dexie) — nothing is
sent anywhere except the single extraction call per chat message described
below. Use the **My data** button in the bottom-right corner at any time to
export everything as JSON or permanently delete it.

## Scripts

```bash
npm run dev         # dev server
npm run build       # typecheck + production build
npm run typecheck   # tsc project references, no emit
npm run test        # run the test suite once
npm run test:watch  # watch mode
npm run check:no-secrets-in-build  # fails if dist/ contains an API key or server-only env var name
npm run check:offline-safety       # fails if dist/ contains a non-loopback http(s):// literal
npm run lint        # oxlint
```

## Project layout

```
src/
  types/        Shared domain types (provenance envelope, intake record, engine outcomes, ...)
  engines/      Deterministic, LLM-independent decision logic:
                  redFlagEngine, scopeEngine, careLevelEngine, careRoutingEngine
  intake/       Progressive follow-up question flow (fieldChecklist, conversationEngine)
  adapters/     Pluggable external-data interfaces, each with a typed interface +
                  deterministic mock: llm/ (extraction + explanation, backed by a
                  local Ollama daemon), places/, cms/ (quality + pricing),
                  medication/ (places/cms/medication are mock-only by design — see
                  "Adapters" below)
  summary/      Doctor Visit Summary generation (template-based, not LLM freestyle)
  data/         Dexie (IndexedDB) schema, case repository, export/clear controls
  state/        useCareFlow — orchestrates the end-to-end UI flow
  components/   React UI, organized by screen/feature

scripts/        Repo maintenance scripts, e.g. checkNoSecretsInBuild.mjs,
                  checkNoExternalNetworkCalls.mjs.
```

There is no `api/` directory and no backend of any kind — CarePath is a static SPA.
"Deployment" is just serving the `vite build` output (e.g. `npm run preview`, or any
static file server).

## Ollama local AI setup

CarePath's LLM extraction talks directly from the browser to a locally-running
[Ollama](https://ollama.com) daemon on `127.0.0.1` — there is no CarePath-owned
backend or proxy, and no API key. This is the only network activity CarePath ever
performs; everything else (Google Places, CMS data, medication lookups) is a
deterministic local mock (see "Adapters" below).

1. Install Ollama and pull a model:
   ```bash
   ollama pull llama3.2   # or another small instruction-tuned model of your choice
   ```
2. **Disable Ollama Cloud before starting the daemon.** Ollama supports
   cloud-hosted models and a web-search tool that route requests through Ollama's
   own hosted infrastructure — leaving either enabled would silently reintroduce a
   cloud dependency even though the daemon itself runs locally. Set
   `OLLAMA_NO_CLOUD=1` (or whatever the current equivalent setting is — this has
   changed across Ollama's release history, so check Ollama's own docs) before
   running:
   ```bash
   ollama serve
   ```
3. If CarePath's origin differs from Ollama's default-allowed origins, set
   `OLLAMA_ORIGINS` so Ollama accepts the browser's requests (Ollama allows
   localhost by default). A CORS misconfiguration fails safe — the app falls back
   to the offline mock — but shows a distinguishable console warning so it's not
   confused with Ollama simply being stopped.
4. Optional `.env.local` overrides:
   ```
   VITE_OLLAMA_BASE_URL=http://127.0.0.1:11434   # must be a loopback address — see below
   VITE_OLLAMA_MODEL=llama3.2
   ```

**Loopback-only, enforced at runtime, not just by convention:** `VITE_OLLAMA_BASE_URL`
is a client-readable, user-editable setting, so nothing at the type level stops it
from being pointed at a remote host. `LocalLlmAdapter` validates the configured
hostname against an explicit loopback allowlist (`127.0.0.1`, `localhost`, `::1`)
before ever attempting a request (`src/adapters/llm/loopbackGuard.ts`); a
non-loopback value is rejected at runtime and falls back to the offline mock with
**no request ever sent** — identical behavior to Ollama simply not running.

Any failure — Ollama not running, a non-loopback base URL, the model not pulled,
a timeout, or malformed/invalid output — falls back to the deterministic offline
mock automatically; the app never blocks or errors when Ollama isn't available.
Care-level explanation intentionally stays a fixed, deterministic template (never
an LLM call) — see `docs/CarePath_AI_Plan.md` Section 12 and
`LocalLlmAdapter.explainCareLevel`'s doc comment
(`src/adapters/llm/localLlmAdapter.ts`) for why.

## Adapters

Every external dependency (LLM, Google Places, CMS data, medication lookups) sits
behind a small adapter interface with a deterministic mock implementation.

**LLM extraction (implemented):** see "Ollama local AI setup" above.

**Places / CMS / Medication:** these adapters always return their mock, and — unlike
the LLM adapter — that's the permanent, intended state for at least Places, not a
placeholder awaiting a live integration: live facility search has no true offline
equivalent. Medication and CMS data could honestly be upgraded to a real *bundled*
dataset later (both publish bulk-downloadable data), but never to a live network
call — see `docs/CarePath_AI_Plan.md` Section 12 and each adapter's `index.ts` doc
comment. Swapping in a bundled dataset later requires no changes to callers,
following the same adapter-interface pattern as the LLM adapter above.

## Safety architecture

Governing pattern: **safety rules → structured risk engine → LLM explanation**,
never "symptoms → LLM → probably fine." Concretely:

- The LLM only ever extracts structured fields or explains an already-decided
  result — the `IntakeRecord` type has no field that could express a care level,
  so an LLM response cannot influence the final tier (see
  `src/engines/llmCannotOverrideCareLevel.test.ts`).
- `redFlagEngine.ts` is a deterministic, rule-based check that runs first and
  forces `EMERGENCY` regardless of the weighted score.
- `scopeEngine.ts` routes pediatric, pregnancy, mental health crisis, poisoning,
  trauma, sexual health, post-operative, and immunocompromised cases to
  `OUT_OF_SCOPE` instead of the generic engine.
- `careLevelEngine.ts` returns `INSUFFICIENT_INFORMATION` rather than guessing a
  tier when required inputs are missing.
- Every symptom uses a `reported / denied / unknown` tri-state — "unknown" is
  never silently treated as "denied."
- Every structured fact carries a provenance envelope (`value`, `source`,
  `confirmedByUser`, `capturedAt`) — see `src/types/provenance.ts`.
