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

No API keys are required to run the app — every external integration (LLM, Google
Places, CMS pricing/quality data, RxNorm/DailyMed) falls back to a deterministic
local mock automatically whenever a real backend/key isn't configured. The LLM
adapter now always attempts a real backend call first (see "Adapters" below); the
others still always use their mock.

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
npm run lint        # oxlint
```

## Project layout

```
src/
  types/        Shared domain types (provenance envelope, intake record, engine outcomes, ...)
  engines/      Deterministic, LLM-independent decision logic:
                  redFlagEngine, scopeEngine, careLevelEngine, careRoutingEngine
  intake/       Progressive follow-up question flow (fieldChecklist, conversationEngine)
  adapters/     Pluggable external integrations, each with a typed interface + mock:
                  llm/ (extraction + explanation), places/ (Google Places), cms/
                  (CMS quality + pricing), medication/ (RxNorm + DailyMed)
  summary/      Doctor Visit Summary generation (template-based, not LLM freestyle)
  data/         Dexie (IndexedDB) schema, case repository, export/clear controls
  state/        useCareFlow — orchestrates the end-to-end UI flow
  components/   React UI, organized by screen/feature

api/            Vercel serverless functions — the only place OPENAI_API_KEY is read.
                  llm/extract.ts is the deployed endpoint; _lib/ holds the request
                  handler, OpenAI client, schema, and logging it's built from
                  (tsconfig.api.json is this folder's separate TS project).
scripts/        Repo maintenance scripts, e.g. checkNoSecretsInBuild.mjs.
```

## Adapters and API keys

Every external dependency (LLM, Google Places, CMS data, medication lookups) sits
behind a small adapter interface with a deterministic mock implementation. API keys
never live in browser code — external services are only ever reached through a
backend/serverless proxy (see [docs/CarePath_AI_Plan.md](docs/CarePath_AI_Plan.md)
Section 12).

**LLM extraction (implemented):** `src/adapters/llm/index.ts` always calls the
backend at `/api/llm/extract` (a same-origin relative path by default — set the
optional `VITE_API_BASE_URL` only if the frontend and backend are ever deployed to
separate origins). Any failure — no backend deployed, missing server-side key,
network error, timeout, or a malformed/invalid response — falls back to the
deterministic offline mock automatically; the app never blocks or errors on a
missing key. Care-level explanation intentionally stays a fixed, deterministic
template (not an LLM call) — see `docs/CarePath_AI_Plan.md` Section 12 and
`RemoteLlmAdapter.explainCareLevel`'s doc comment (`src/adapters/llm/remoteLlmAdapter.ts`)
for why.

To run the real backend locally (e.g. via `vercel dev`), create a `.env.local` with:

```
OPENAI_API_KEY=sk-...           # server-only — never prefix with VITE_
OPENAI_EXTRACTION_MODEL=...     # optional override; see api/_lib/openaiClient.ts
```

Without `OPENAI_API_KEY` set, `/api/llm/extract` returns 503 and the app
transparently uses the offline mock — this is expected, not an error.

**Places / CMS / Medication (not yet implemented):** these adapters still always
return their mock — no real backend or env var is wired up for them yet. Swapping
them in later requires no changes to their callers, following the same pattern as
the LLM adapter above.

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
