# CarePath AI — Implementation TODO

Snapshot taken 2026-09-14, after migrating the LLM extraction path from an OpenAI/Vercel
serverless backend to a fully local/offline architecture (Ollama, browser-direct to the local
daemon, no CarePath-owned backend of any kind). `npm run typecheck` and `npm run test` both pass
(275 tests). This is a snapshot, not a live-updating doc — re-check against the code before
trusting an item as still open. Phase numbers below match `docs/CarePath_AI_Plan.md` Part 7,
**except** that the live-network plans those phases originally described for Places/Medication/CMS
have been struck as incompatible with the local/offline architecture mandate — see the note at the
top of each phase.

## Status snapshot

- **CarePath is now a backend-less static SPA.** There is no CarePath-owned server or serverless
  platform anywhere in the stack — `api/`, `tsconfig.api.json`, `RemoteLlmAdapter`, and every
  Vercel/OpenAI reference have been removed. Production "deployment" is just serving the
  `vite build` output (e.g. `npm run preview`) locally.
- **Phase 1 (local LLM extraction, P0) is implemented and tested.** `LocalLlmAdapter`
  (`src/adapters/llm/localLlmAdapter.ts`) calls a locally-running Ollama daemon directly from the
  browser at `VITE_OLLAMA_BASE_URL` (default `http://127.0.0.1:11434`) — no API key, no proxy.
  This is the only network activity CarePath ever performs, and it's restricted to loopback at
  runtime (`loopbackGuard.ts`): a non-loopback `VITE_OLLAMA_BASE_URL` is rejected before any
  request is attempted and falls back to the offline mock, same as Ollama being unreachable.
- **Places, Medication, and CMS quality/pricing adapters are still 100% mock** — this was already
  true and offline-safe before the migration, and no change is required for offline-safety itself.
  What changed is the *plan*: Phases 2–5 below no longer describe adding live cloud API calls for
  these (that would reintroduce exactly the network dependency this migration removed). They
  instead describe an optional, out-of-scope-for-now upgrade path to a **bundled static dataset**
  behind the same adapter interfaces, where that's honestly feasible (Medication, CMS) — Places
  live facility search has no true offline equivalent and the mock is intended to stay a
  permanent, honestly-labeled placeholder (see adapter doc comments and
  `docs/CarePath_AI_Plan.md` Section 12).

## Phase 1 — Local LLM extraction via Ollama (P0) — done, a few loose ends remain

- [x] `ExtractionContext`/`ExtractionResult` contract (`src/adapters/llm/types.ts`) — minimized
      payload, `extractionMode: 'local-llm' | 'local-fallback'`, structured `clarification` (never
      free text)
- [x] `LocalLlmAdapter` — loopback-only base URL validation (checked once at construction, before
      any request is ever attempted), timeout/`AbortController`, response allowlist/sanitization,
      fallback to `MockLlmAdapter` on any failure (non-loopback URL, connection refused, model not
      pulled, timeout, malformed output, schema validation failure)
- [x] `ollamaClient.ts` — `POST <baseUrl>/api/chat`, structured-output `format` field, one bounded
      retry on network error, one bounded retry on 5xx, never on 4xx; repeats the loopback check as
      defense in depth (it's the one place `fetch` is ever called from `src/`)
- [x] `extractionSchema.ts` (zod `rawExtractionSchema` + the `format` JSON Schema) and
      `extractionMapping.ts` (`mapToIntake`, the reported→denied downgrade guard) — moved from the
      former `api/_lib/` verbatim, now run client-side, no behavior change
- [x] `src/intake/clarificationTemplates.ts` — deterministic `(field, reason) → sentence` table
- [x] `selectRelevantContext` in `conversationEngine.ts` — data minimization vs. sending the
      full `IntakeRecord` every turn
- [x] `MockLlmAdapter` — `explainCareLevel` stays a deterministic template (no Ollama call); this
      is now a settled architectural decision (see `docs/CarePath_AI_Plan.md` Section 12), not a
      deferred item
- [x] `scripts/checkNoSecretsInBuild.mjs` — kept as a general secret-literal regression guard
- [x] `src/networkSurfaceAudit.test.ts` + `scripts/checkNoExternalNetworkCalls.mjs` — source- and
      dist-level checks that the only network-primitive call site in `src/` is
      `ollamaClient.ts`, loopback-gated
- [x] Test coverage: `ollamaClient.test.ts`, `loopbackGuard.test.ts`, `localLlmAdapter.test.ts`,
      `extractionMapping.test.ts`, `clarificationTemplates.test.ts`
- [ ] Wire `npm run check:no-secrets-in-build` and `npm run check:offline-safety` into actual CI —
      no `.github/workflows` exists yet
- [ ] Manual smoke test against a real `ollama serve` (with `OLLAMA_NO_CLOUD=1` or the current
      equivalent set) + a pulled model — unit tests mock `fetch` and don't exercise a live daemon
- [ ] Re-verify `ollamaClient.ts`'s `DEFAULT_MODEL` and the exact `format`/structured-output API
      surface against Ollama's current docs — both are explicitly flagged as placeholders in the
      code, same spirit as the old `OPENAI_EXTRACTION_MODEL` UNVERIFIED note
- [ ] Ship user-facing copy explaining that symptom text is processed by a locally-running AI
      model on this device (not sent anywhere) — no such text found in `src/components` yet; the
      substance of the original disclosure requirement changes now that there's no third-party AI
      provider, but users should still know a model is involved

## Phase 2 — Facility search (Places) (P1)

**Reframed:** the original plan called for a live Google Places integration
(`remotePlacesAdapter.ts` + `api/places/search.ts` + `GOOGLE_PLACES_API_KEY`) — struck entirely,
incompatible with the offline mandate. Live facility search (open-now status, real-time distance,
current ratings) has no true offline equivalent; `MockPlacesAdapter` is intended to stay a
permanent, honestly-labeled placeholder (see `src/adapters/places/index.ts`'s doc comment). Only
the parts of the original phase that don't require a network call remain:

- [ ] Decouple `MockPlacesAdapter` from `getCmsAdapter()` — return identity fields only
- [ ] `FacilityCard.costEstimate` type: `CostEstimate` → `CostEstimate | null`; guard the null
      case in `FacilityCard.tsx`
- [ ] `src/facilities/buildFacilityCard.ts` composer — calls Places/Quality/Pricing adapters in
      parallel, defaults any unconfigured one to `null`; works identically whether each adapter is
      backed by the mock or a future bundled dataset
- [ ] `FacilityList.tsx` calls the composer instead of `getPlacesAdapter()` directly
- [ ] Tests: composer null-handling, "Not available yet" render

**Out of scope / needs a product decision before any further work:** browser geolocation +
ZIP-code lookup UI. Browser-native `navigator.geolocation` doesn't call out to CarePath's own
network surface and is fine; a ZIP-to-coordinates *lookup*, if added, would need to be backed by a
bundled offline ZIP/coordinate dataset (same pattern as the Medication/CMS bundled-dataset idea
below) — a live geocoding API is out of scope for the same reason live Places search is.

An optional, materially-different future enhancement (not started, not scoped here): bundle a
static regional facility directory with an explicit "as of &lt;date&gt;, verify before visiting"
disclaimer — never presented as live search.

## Phase 3 — Medication data (P1)

**Reframed:** the original plan called for a live RxNorm + DailyMed backend proxy
(`remoteMedicationAdapter.ts` + `api/medication/lookup.ts`, with an optional OpenAI plain-language
rewrite) — struck, no backend and no cloud LLM exist anymore. RxNorm and DailyMed both publish
bulk-downloadable data files, so a **bundled static dataset** is realistic here, unlike Places:

- [ ] A local, periodically-refreshed JSON/SQLite snapshot curated from RxNorm + DailyMed bulk
      downloads, bundled with the app (no network fetch at runtime)
- [ ] `src/adapters/medication/bundledMedicationAdapter.ts` (or similar) implementing the existing
      `MedicationAdapter` interface, reading only from the bundled snapshot — same interface as
      today's mock, so callers need no changes
- [ ] If a plain-language rewrite of label text is ever wanted, it would need to go through the
      same local Ollama path as extraction (never a cloud model) and must never originate new
      facts, dosage recommendations, or anything not present in the bundled source text
- [ ] Tests: "not available" behavior when a drug isn't in the bundled dataset, plus a runtime
      check that no dosage-recommendation-shaped field is ever present in the response

## Phase 4 — Facility quality data (CMS) (P1/P2)

**Reframed:** the original plan called for a live backend proxy (`remoteFacilityQualityAdapter.ts`
+ `api/quality/lookup.ts`) — struck. The CMS Provider Data Catalog is bulk-downloadable
(data.cms.gov CSV/JSON exports), so a **bundled static dataset** is realistic here too:

- [ ] `src/adapters/quality/types.ts` (`FacilityQualityAdapter`, split out of today's `CmsAdapter`)
- [ ] A local, periodically-refreshed static snapshot curated from the CMS Provider Data Catalog
      bulk exports, bundled with the app
- [ ] `src/adapters/quality/bundledFacilityQualityAdapter.ts` (or similar); rename
      `MockCmsAdapter` → `MockFacilityQualityAdapter` (drop the cost method)
- [ ] Confirm current CMS Provider Data Catalog dataset IDs/export URLs (marked UNVERIFIED in the
      plan) — needed to build/refresh the bundled snapshot, not for a live API integration
- [ ] Tests: "not available" preserved for thin-coverage care types

## Phase 5 — Pricing improvements (P2)

**Reframed:** the original plan's "licensed aggregator" live-network framing is out of scope for
this architecture unless revisited as an explicit, separate opt-in decision later. The CMS
Hospital Price Transparency data is bulk-downloadable, so the same bundled-dataset pattern as
Phase 4 applies:

- [ ] `src/adapters/pricing/types.ts` (`PricingAdapter`, split out of today's `CmsAdapter`)
- [ ] A bundled static snapshot (CMS Medicare-average blend) behind a
      `bundledPricingAdapter.ts`-style adapter — same interface, no network fetch
- [ ] Rename the cost half of `MockCmsAdapter` → `mockPricingAdapter.ts`
- [ ] Tests: UI never renders a single-number cost claim — only a range/confidence label or
      "Not available yet"

## Cross-cutting / not tied to a single phase

- [ ] Auto-delete / data-retention setting — `docs/CarePath_AI_Plan.md` Section 12 lists this
      as a stated MVP requirement; only manual Export/Clear exist today
      (`src/data/dataControls.ts`)
- [ ] Legal/compliance (HIPAA/FTC/FDA) review before handling real patient data — not an
      engineering task, flagging so it isn't forgotten
- [ ] Deprioritized/optional, and would each need their own offline-feasibility review before
      being scoped (openFDA and RxNorm/DailyMed-adjacent ideas are themselves live APIs, so any of
      these would follow the same "bundled snapshot, not a live call" pattern as Phases 3–5, or be
      dropped): openFDA supplementary data, drug-interaction checking, streaming UX polish
