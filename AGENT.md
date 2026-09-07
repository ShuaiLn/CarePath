# CarePath Agent Guide

## Project purpose

CarePath is a healthcare-navigation web app, not a diagnosis tool. It helps users understand what care setting may be appropriate, find facilities, prepare for a visit, and follow clinician-provided instructions.

Read `docs/CarePath_AI_Plan.md` before making product, domain-model, safety, or architecture changes. Treat that document as the product source of truth and keep implementations aligned with it.

## Technology

- React 19 and TypeScript
- Vite
- Tailwind CSS
- Dexie/IndexedDB for local-first persistence
- Vitest and Testing Library
- oxlint

Common commands:

```bash
npm run dev
npm run typecheck
npm run test
npm run lint
npm run build
```

## Project structure

- `src/types/`: shared domain types and provenance envelopes
- `src/engines/`: deterministic safety, care-level, and routing logic
- `src/intake/`: progressive intake and clarification flow
- `src/adapters/`: typed external-service boundaries and local mocks
- `src/summary/`: template-based visit-summary generation
- `src/data/`: Dexie schema, repositories, and data controls
- `src/state/`: end-to-end application flow
- `src/components/`: feature and UI components

## Non-negotiable safety rules

1. Preserve the governing flow: deterministic safety rules -> structured risk engine -> LLM explanation.
2. Never let an LLM select, inject, or override a care level.
3. Run critical red-flag checks before generic scoring. A matched red flag must override the weighted score.
4. Route unsupported scenarios to `OUT_OF_SCOPE`; do not pass them through the generic scoring engine.
5. Return `INSUFFICIENT_INFORMATION` when information is missing, ambiguous, or contradictory. Never manufacture a normal result.
6. Require user confirmation of extracted facts before using them downstream.
7. Preserve `reported`, `denied`, and `unknown` as distinct states. Unknown must never be treated as denied.
8. Keep patient-reported facts, clinician-provided facts, uploaded material, and CarePath-generated content visibly and structurally separate.
9. Preserve clinical hedging exactly. Do not turn phrases such as "might be" or "cannot rule out" into a diagnosis.
10. Do not make diagnostic claims or recommend medication-dose changes.
11. Do not display internal urgency or facility-match scores to users.
12. Do not display LLM self-confidence. Ask a clarifying question when extraction is uncertain. Confidence labels are reserved for source-data completeness.

## Data and privacy rules

- Store important facts in a provenance envelope with value, source, confirmation state, and capture time.
- Keep health data local-first unless a feature explicitly introduces optional cloud sync.
- Preserve export, clear-data, and auto-delete controls when changing persistence.
- Never put AI-provider, Maps, or other private API credentials in browser code. External services must be reached through a backend/serverless proxy.
- Keep third-party data sources distinct; do not merge patient ratings and CMS quality data into a fabricated combined public score.

## Implementation expectations

- Prefer explicit domain types and deterministic, testable functions for safety-relevant behavior.
- Keep external integrations behind typed adapters and maintain deterministic mocks for local development and tests.
- Generate the Doctor Visit Summary from confirmed structured facts and templates, never from an unrestricted LLM summary.
- Keep before-visit and after-visit data models and UI sections separate.
- Follow the existing TypeScript style: ES modules, single quotes, and no semicolons.
- Make focused changes and avoid unrelated refactors.
- Add or update tests whenever engine rules, intake state transitions, provenance behavior, summaries, or persistence behavior change.

## Verification

Run the checks relevant to the change. For a normal code change, use:

```bash
npm run typecheck
npm run test
npm run lint
npm run build
```

Do not describe demonstration heuristics or thresholds as clinically validated. Any production or clinical-accuracy claim requires review against credible clinical guidance by qualified medical professionals, along with appropriate legal and regulatory review.
