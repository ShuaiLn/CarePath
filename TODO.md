# CarePath AI — Implementation TODO

Snapshot taken 2026-09-08 by reading the actual code + running `npm run typecheck` and
`npm run test` (13 test files, 285 tests, all passing; typecheck clean). This is a snapshot,
not a live-updating doc — re-check against the code before trusting an item as still open.
Phase numbers match `docs/CarePath_AI_Plan.md` Part 7.

## Status snapshot

- **Phase 1 (OpenAI extraction backend, P0) is implemented and tested.** This is the only
  real external integration wired up so far.
- **Places, Medication, CMS quality, and pricing adapters are still 100% mock** — Phases 2–5
  have not started (their `index.ts` factories only ever return the mock).

## Phase 1 — OpenAI extraction backend (P0) — done, a few loose ends remain

- [x] `ExtractionContext`/`ExtractionResult` contract (`src/adapters/llm/types.ts`) — minimized
      payload, `extractionMode`, structured `clarification` (never free text)
- [x] `RemoteLlmAdapter` — timeout/`AbortController`, relative-path fetch, response
      allowlist/sanitization, fallback to `MockLlmAdapter` on any failure
- [x] `api/llm/extract.ts` + `api/_lib/*` — zod schema validation, field allowlisting, one
      bounded retry on 5xx, metadata-only logging
- [x] `src/intake/clarificationTemplates.ts` — deterministic `(field, reason) → sentence` table
- [x] `selectRelevantContext` in `conversationEngine.ts` — data minimization vs. sending the
      full `IntakeRecord` every turn
- [x] `MockLlmAdapter` updated to the new contract; `explainCareLevel` stays a deterministic
      template (no OpenAI call, per the plan's revised recommendation)
- [x] `scripts/checkNoSecretsInBuild.mjs`
- [x] Test coverage: `remoteLlmAdapter.test.ts`, `clarificationTemplates.test.ts`,
      `api/_lib/*.test.ts`, `api/llm/extract.test.ts`
- [ ] Wire `npm run check:no-secrets-in-build` into actual CI — no `.github/workflows` exists
      yet
- [ ] Verify the Vercel project actually deploys/runs `/api/llm/extract` for real — there's no
      `vercel.json` and no `vercel` CLI dependency yet; this has only been unit-tested against
      a fake OpenAI client, never run via `vercel dev` or a live deployment
- [ ] Ship the user-facing disclosure that symptom text now goes to a third-party AI provider
      (plan Part 9 / Part 10.8 item 5) — no such text found anywhere in `src/components`
- [ ] Re-verify the `DEFAULT_MODEL` in `api/_lib/openaiClient.ts` and OpenAI's current
      healthcare-usage-policy posture against live docs before any production use

## Phase 2 — Real facility search (Google Places, identity only) + geolocation (P1)

- [ ] `src/adapters/places/remotePlacesAdapter.ts` (same fallback-to-mock shape as
      `RemoteLlmAdapter`)
- [ ] `api/places/search.ts` (server-side, `GOOGLE_PLACES_API_KEY`)
- [ ] Decouple `MockPlacesAdapter` from `getCmsAdapter()` — return identity fields only
- [ ] `FacilityCard.costEstimate` type: `CostEstimate` → `CostEstimate | null`; guard the null
      case in `FacilityCard.tsx`
- [ ] `src/facilities/buildFacilityCard.ts` composer — calls Places/Quality/Pricing adapters in
      parallel, defaults any unconfigured one to `null`
- [ ] `FacilityList.tsx` calls the composer instead of `getPlacesAdapter()` directly; passes
      geolocation coordinates into the query
- [ ] Browser geolocation + ZIP fallback UI/geocoding
- [ ] Tests: `remotePlacesAdapter.test.ts`, composer null-handling, "Not available yet" render

## Phase 3 — Medication data (RxNorm + DailyMed) (P1)

- [ ] `src/adapters/medication/remoteMedicationAdapter.ts`
- [ ] `api/medication/lookup.ts` (RxCUI resolution → DailyMed label text; optional grounded
      OpenAI plain-language rewrite reusing Phase 1's client — never originates new facts)
- [ ] Tests: fallback behavior + a runtime check that no dosage-recommendation-shaped field is
      ever present in the response

## Phase 4 — Facility quality data (CMS) (P1/P2)

- [ ] `src/adapters/quality/types.ts` (`FacilityQualityAdapter`, split out of today's
      `CmsAdapter`)
- [ ] `src/adapters/quality/remoteFacilityQualityAdapter.ts`; rename `MockCmsAdapter` →
      `MockFacilityQualityAdapter` (drop the cost method)
- [ ] `api/quality/lookup.ts`
- [ ] Confirm current CMS Provider Data Catalog dataset IDs/endpoints (marked UNVERIFIED in
      the plan)
- [ ] Tests: adapter fallback, "not available" preserved for thin-coverage care types

## Phase 5 — Pricing improvements (P2)

- [ ] `src/adapters/pricing/types.ts` (`PricingAdapter`, split out of today's `CmsAdapter`)
- [ ] `src/adapters/pricing/remotePricingAdapter.ts` (CMS Medicare-average blend, or a licensed
      aggregator later)
- [ ] Rename the cost half of `MockCmsAdapter` → `mockPricingAdapter.ts`
- [ ] Tests: UI never renders a single-number cost claim — only a range/confidence label or
      "Not available yet"

## Cross-cutting / not tied to a single phase

- [ ] Auto-delete / data-retention setting — `docs/CarePath_AI_Plan.md` Section 12 lists this
      as a stated MVP requirement; only manual Export/Clear exist today
      (`src/data/dataControls.ts`)
- [ ] IP-based rate limiting once any backend is publicly deployed — no auth exists anywhere,
      so an unmetered proxy to a paid API is a direct cost-abuse vector
- [ ] Legal/compliance (HIPAA/FTC/FDA) review before handling real patient data — not an
      engineering task, flagging so it isn't forgotten
- [ ] Deprioritized/optional: OpenAI-polished `explainCareLevel` via a `CareExplanationInput`
      DTO, openFDA supplementary data, drug-interaction checking, streaming UX polish
