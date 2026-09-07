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

No API keys are required — every external integration (LLM, Google Places, CMS
pricing/quality data, RxNorm/DailyMed) runs against a deterministic local mock by
default. See "Adapters" below for how to point them at a real backend later.

## Scripts

```bash
npm run dev         # dev server
npm run build       # typecheck + production build
npm run typecheck   # tsc project references, no emit
npm run test        # run the test suite once
npm run test:watch  # watch mode
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
```

## Adapters and API keys

Every external dependency (LLM, Google Places, CMS data, medication lookups) sits
behind a small adapter interface with a deterministic mock implementation, so the
app runs fully offline with no keys configured. To point an adapter at a real
backend proxy later (API keys must stay server-side — see
[docs/CarePath_AI_Plan.md](docs/CarePath_AI_Plan.md) Section 12), set the
corresponding env var in a `.env.local` file:

```
VITE_LLM_BACKEND_URL=https://your-backend/api
VITE_PLACES_BACKEND_URL=https://your-backend/api
VITE_CMS_BACKEND_URL=https://your-backend/api
VITE_MEDICATION_BACKEND_URL=https://your-backend/api
```

Currently only the LLM adapter (`src/adapters/llm/index.ts`) actually reads its env
var and falls back to the mock on any network failure; the others are wired for a
real backend but still default to their mocks — swapping them in requires no
changes to callers.

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
