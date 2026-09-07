# CarePath AI — Product & Technical Plan

## 1. Overview

**CarePath AI** — *Your AI-powered healthcare navigator.*

CarePath AI is a web app that helps people figure out what to do when they don't know what to
do about a health concern. It is **not a diagnosis tool**. Its core philosophy is:

> "I don't know what to do next."

CarePath AI exists to solve six concrete problems people have when something feels wrong:

1. I don't know how serious my symptoms are.
2. I don't know whether to go to the ER, Urgent Care, or a regular primary care visit.
3. I don't know what specialty or type of doctor to see.
4. I don't know how to accurately describe my symptoms to a doctor.
5. I don't know where nearby to find an appropriate doctor or clinic.
6. I don't know roughly how much treatment or evaluation will cost.

A typical interaction starts with something like:

> "My stomach has been hurting for 3 days."

CarePath AI turns that into a structured, safety-checked path through the healthcare system —
before, during, and after a visit.

---

## 2. End-to-End Flow

CarePath AI is organized around a visit, with a strict separation between what happens
**before** the visit and what happens **after** it:

```
        BEFORE VISIT
Symptoms
   ↓
AI Intake
   ↓
Care-Level Assessment
   ↓
Care Routing
   ↓
Facility Search
   ↓
Doctor Visit Summary
   ↓
────────────────────
       VISIT
────────────────────
   ↓
Doctor / Clinic
   ↓
────────────────────
      AFTER VISIT
────────────────────
   ↓
After Visit Input
   ↓
Medication Explanation
   ↓
Care Plan
   ↓
Follow-up Tracking
```

The guiding product principle, which should never be violated by UI or data design:

> **Before visit = "What I need my doctor to know."**
> **After visit = "What my doctor told me and what I need to do next."**

These two halves must never be merged into a single summary. A patient-reported symptom and a
clinician's diagnosis are different kinds of facts with different provenance, and the product
must keep them visually and structurally distinct (see Section 9).

**Any stage in this flow can terminate in `INSUFFICIENT_INFORMATION` or `OUT_OF_SCOPE`** instead
of being forced to produce a normal-looking result. See Section 10 for the rule and required
copy, and Section 11 for the scope boundaries that trigger it.

---

## 3. Step 1 — Understand (Symptom Intake)

The user starts with free-form natural language, not a form:

> "My stomach has been hurting for 3 days."

The AI then asks progressive follow-up questions rather than presenting a dozen fields at once.
Internally, the conversation is distilled into a structured intake record:

| Field | Example |
|---|---|
| Chief complaint | Abdominal pain |
| Location | Lower-right abdomen |
| Onset | 3 days ago |
| Duration | Continuous / intermittent |
| Severity | 6/10 |
| Trend | Getting worse |
| Character | Sharp / dull / burning |
| Associated symptoms | Nausea, fever |
| Age | 19 |
| Relevant sex/pregnancy information | When medically relevant |
| Medical conditions | Diabetes |
| Current medications | Metformin |
| Allergies | Penicillin |
| Recent procedures/injuries | None |
| Vital signs | Optional |
| Risk factors | Immunocompromised, etc. |

### Mandatory confirmation step

Before any of this structured data is used downstream, CarePath AI shows the user:

> "Here's what I understood."

...and requires explicit confirmation. This step exists because:

> **AI misunderstanding ≠ medical fact.**

### Provenance, not bare values

Every extracted field is stored with full provenance metadata (see Section 9's provenance
envelope) — not as a bare value — so the rest of the system always knows where a fact came from
and whether the user confirmed it.

### No numeric AI confidence

CarePath AI **never shows a numeric confidence score** for how well it understood the user.
LLM-reported confidence isn't well-calibrated, and a displayed percentage implies a precision
the extraction doesn't have. Instead, low-confidence extraction produces a **clarifying
question**:

> "I'm not sure I understood this correctly — can you confirm...?"

This rule is repeated in Section 9 as it also governs the data model.

---

## 4. Step 2 — Care-Level Assessment

*(Renamed from "Urgency + Risk Assessment.")*

### Internal scoring, external categories

Internally, a weighted engine still computes a 0–100 **Urgency Score** from structured risk
factors:

| Factor | Example |
|---|---|
| Symptom severity | Pain 2/10 vs. 9/10 |
| Duration | 2 hours / 3 days / 2 weeks |
| Progression | Improving / stable / rapidly worsening |
| Red-flag symptoms | Chest pain, severe breathing difficulty, fainting, etc. |
| Age | Pediatric or advanced age may raise risk |
| Existing conditions | Heart disease, diabetes, immune suppression, etc. |
| Medications | Anticoagulants, etc. may affect risk |
| Associated symptoms | Fever, vomiting, bleeding, confusion, etc. |
| Functional impact | Ability to walk, eat, drink, do normal activities |
| Recent events | Surgery, injury, pregnancy-related context, etc. |

```
User input
   ↓
Extract factors
   ↓
Check critical red flags
   ↓
YES ─────────→ 🔴 Emergency care now
   ↓ NO
Calculate weighted urgency score
   ↓
Map score → Recommended Care Level
```

**This numeric score is never shown to the user.** Showing "Urgency Score: 54/100" implies a
false medical precision, and any threshold (e.g., 59 vs. 60) creates an arbitrary cliff between
care tiers that isn't clinically justified. The UI exposes only one of four categorical
**Recommended Care Levels**, derived from the internal score:

| Internal score (never shown) | Recommended Care Level |
|---|---|
| 🟢 0–39 | Self-care & monitor, with escalation guidance |
| 🟡 40–59 | Schedule medical care soon |
| 🟠 60–79 | Same-day urgent evaluation |
| 🔴 80–100 | Emergency care now |

...plus a fifth possible outcome:

> **`INSUFFICIENT_INFORMATION`** — "I don't have enough information to recommend a care setting
> safely. A healthcare professional can help assess this."

This is used instead of forcing a tier when the input is too sparse or ambiguous to safely
support one (see Section 10).

### Critical Red-Flag Override

Medical risk cannot rely solely on a weighted average. A young patient with no pre-existing
conditions and a short symptom duration might score only 35% overall — but if they report:

> "I have severe difficulty breathing."

...that cannot be shown as green just because the weighted average is low. A **deterministic,
rule-based Critical Red-Flag Override** checks for conditions like severe breathing difficulty
first, and if present, forces `🔴 Emergency care now` regardless of the weighted score.

### AI's scoped role

The AI is responsible for exactly three things in this step, and nothing more:

1. **Natural-language understanding** — extracting structured factors from what the user says.
2. **Follow-up questioning** — asking for missing information (e.g., "Any fever, vomiting,
   bleeding, or fainting?").
3. **Explaining the result in plain language** — e.g., "Your recommended care level is elevated
   mainly because: symptoms have lasted 3 days, pain is worsening, severity is 6/10."

**The AI never picks the care level itself.** The final category is always produced by the
deterministic risk engine operating on structured factors, not by an LLM guessing a color.

### Why this split matters

The FDA's January 2026 final Clinical Decision Support guidance makes clear that
patient/caregiver-facing software can still fall under FDA medical device regulation regardless
of a "not medical advice" disclaimer. Architecting the system as

> Safety rules → structured risk engine → LLM explanation

(rather than "symptoms → LLM → probably green") is both a safety requirement and a defensible
regulatory posture. See Section 13 for the condensed compliance list.

### Emergency-case UX rule

When the outcome is `🔴 Emergency care now`, CarePath AI does **not** show cost comparisons,
star ratings, or a list of facilities to weigh. It shows only:

> "Seek emergency care now."

and, where relevant, dynamically generated escalation guidance such as "Symptoms getting rapidly
worse? Seek emergency help."

---

## 5. Step 2.5 — Care Routing Hierarchy

*(Renamed from "Specialty Routing" — care setting and specialty are different questions and
must never be conflated. A specialty name should never read as "book this now.")*

Routing is always presented as an explicit **three-level hierarchy**, always in this order:

1. **Care setting** — Emergency Department / Urgent Care / Primary care soon / Self-care.
2. **Best starting provider** — e.g., Primary Care Physician.
3. **Possible downstream specialty** — explicitly framed as *"later, depending on evaluation"*
   (e.g., Gastroenterology) — **never the headline.**

For example, chest pain must surface **Care setting: Emergency Department** as the headline —
never "Cardiology" — because the immediate decision a user needs is where to go, not which
specialist eventually reads the chart.

### Symptom-category mapping

| Problem type | Recommended starting point | Potential downstream specialty |
|---|---|---|
| General / unclear symptoms | Primary Care / Family Medicine | Depends on findings |
| Abdominal / digestive | Primary Care / Urgent Care | Gastroenterology |
| Chest / heart-related | Emergency Department when concerning | Cardiology |
| Breathing / lungs | Primary Care / Urgent Care | Pulmonology |
| Persistent headache / nerve problems | Primary Care / Emergency Department depending on red flags | Neurology |
| Bone / joint injury | Urgent Care | Orthopedics / Sports Medicine |
| Skin | Primary Care | Dermatology |
| Urinary problems | Primary Care / Urgent Care | Urology |
| Gynecologic symptoms | Primary Care / Urgent Care | OB-GYN |
| Eye | Urgent Care, depending on symptoms | Ophthalmology |
| Ear / nose / throat | Primary Care / Urgent Care | ENT |
| Hormonal / thyroid / diabetes | Primary Care | Endocrinology |
| Autoimmune / inflammatory joint issues | Primary Care | Rheumatology |
| Allergies | Primary Care / Urgent Care | Allergy & Immunology |
| Child | Pediatric urgent/primary care | Pediatrics / pediatric specialty |

### Output format

Never output a bare specialty name like "Gastroenterology." Always output the full hierarchy
with reasoning, e.g.:

> **Care setting:** Urgent Care
> **Best starting point:** Primary Care
> **Possible downstream specialty:** Gastroenterology, if symptoms persist or a referral is made
> **Why:** Your main symptoms involve persistent digestive/abdominal symptoms.
> **Urgency:** Within [timeframe] based on the assessment.

This lets the user understand *why*, not just *what*.

---

## 6. Step 3 — Where Should I Go? (Facility Search & Cost)

### Minimal facility card

Facility cards intentionally show only a minimal set of fields by default:

- **Name**
- **Care type**
- **Distance**
- **Open now / hours**
- **Relevant services**
- **Patient rating**

CMS quality data sits behind a **"View quality details"** expandable — it is not shown on the
card by default. Overloading the card with Google rating, CMS quality, ED metrics, distance,
cost, and a match score simultaneously makes it unreadable and implies a false equivalence
between data sources that measure very different things (patient experience vs. institutional
quality).

Google Maps data (rating, reviews, distance, hours, photos) and CMS Provider Data / Care Compare
data (ED metrics, patient experience, readmission, safety — from the CMS Provider Data Catalog,
covering 4,000+ Medicare-certified hospitals) are kept as clearly separate, clearly labeled
sources — never merged into one number.

Note also that most hospitals only have a single Google Place ID for the whole facility, not one
per department (e.g., there is usually no independent "UCLA Gastroenterology Department" listing
distinct from "UCLA Medical Center"). CarePath AI shows **hospital-level rating** plus
**department availability** — it does not fabricate a department-specific rating. If
specialty-specific quality metrics become available from another source in the future, they can
be surfaced separately.

### Internal ranking heuristic ("CarePath Match")

An internal-only ranking heuristic, informally called **CarePath Match**, is used purely to
**order results and select which alternatives to surface**. Example weighting:

| Factor | Weight |
|---|---|
| Correct specialty | 30% |
| Appropriate care level | 25% |
| Distance | 15% |
| CMS quality information available | 15% |
| Patient reviews | 5% |
| Availability / hours | 10% |

**The composite number is never shown to the user** — it has the same false-precision problem as
the urgency score, since the weights are an unvalidated product heuristic, not a clinical or
statistical model. Instead, each card shows a short, qualitative **"Why this location may fit"**
list, e.g.:

- Has emergency services
- 2.4 miles away
- Open now
- Relevant department available
- CMS quality data available

This communicates the same reasoning the score would have encoded, without implying unwarranted
precision.

### Cost: Estimated Cost Range, not a single number

Real medical costs depend on insurance, in-network/out-of-network status, deductible, copay, CPT
code, hospital facility fee, physician fee, and which tests/imaging/labs are performed. CarePath
AI never claims "Cost prediction: $247." Instead it shows:

> **Estimated self-pay visit range: $180–$420**

sourced from CMS Hospital Price Transparency machine-readable pricing files (gross charges,
discounted cash prices, payer-specific negotiated charges — a requirement CMS continues to
enforce and update as of 2026).

The range is shown with a **data-completeness confidence label**:

> Confidence: Low / Medium / High

This label is about how complete the underlying pricing data is for that facility — not an AI
self-assessment — which is why it's kept even though numeric AI confidence is banned elsewhere
(see Section 4 and Section 9).

For uninsured/self-pay users, CarePath AI prompts:

> "Ask the provider for a Good Faith Estimate."

CMS guidance confirms self-pay/uninsured patients can request a CMS-backed Good Faith Estimate
from providers in many circumstances.

---

## 7. Step 4 — Doctor Visit Summary (Before Visit)

### Purpose

The Doctor Visit Summary is not a transcript summary of the CarePath conversation. Its purpose
is narrowly practical:

> "When I get to the exam room, how do I quickly and accurately tell the doctor what's going
> on?"

### Data flow

```
User conversation
        ↓
Structured symptom profile
        ↓
Care-level assessment
        ↓
Care routing
        ↓
Doctor Visit Summary
```

The summary is generated from a **template applied to structured facts**, not by asking an LLM
to freely summarize the conversation:

```
Conversation → structured facts → template → summary   ✅
Conversation → LLM freestyle summary                    ❌
```

This is deliberately less "clever" and far more reliable — the summary can never say something
the structured intake data doesn't support.

### Prominent top-of-page disclaimer

Every Doctor Visit Summary carries a banner at the **top of the page** (not a footer note):

> "Prepared from information entered by the patient. Not reviewed by a healthcare professional."

### Patient-facing language, not chart-style terms

Clinical-chart terminology is replaced with patient-facing language so the document reads as a
patient-prepared note, never an EHR/clinical-chart lookalike that a patient or doctor might
mistake for a professional document:

| Chart-style term | Patient-facing term |
|---|---|
| Chief Complaint | **Why I'm seeking care** |
| Associated Symptoms | **Other symptoms I reported** |
| Assessment | **CarePath navigation result** |

### The five sections

**1. Why I'm seeking care**

- Chief complaint: Lower-right abdominal pain
- Started: 3 days ago
- Severity: 6/10
- Progression: Getting worse

**2. Other symptoms I reported**

Uses a strict **Reported / Denied / Unknown** tri-state — never plain yes/no — because the
distinction matters medically:

- **Reported:** Nausea
- **Denied** (only symptoms the user explicitly said they don't have): No vomiting, No fever
- **Unknown:** Blood in stool — *Not asked / not provided*

Any field the user was never asked about, or didn't answer, renders as **"Not provided."** The
system never invents an answer the user didn't give — e.g., it must never write "No previous
abdominal surgery" unless the user was actually asked and said no.

**3. Relevant context**

Only information the user explicitly provided:

- Medical conditions: Diabetes
- Current medications: Metformin 500 mg
- Known allergies: Penicillin
- Recent events: No recent injury reported

**4. CarePath navigation result**

Kept in its own clearly labeled region, never mixed with patient-reported facts:

> **CarePath Navigation Assessment**
> Recommended care level: 🟡 Schedule medical care soon
> Suggested starting point: Primary Care
> Possible downstream specialty: Gastroenterology
>
> *CarePath's navigation assessment is not a diagnosis.*

This keeps a hard visual line between "this is what the patient reported" and "this is a
software-generated recommendation," so a clinician skimming the page can't confuse the two.

**5. Questions for my doctor**

Generated from **information gaps**, not diagnostic speculation. Good examples:

- "Should I have any tests based on these symptoms?"
- "Are there activities or foods I should avoid until this improves?"
- "What changes would mean I should seek urgent care?"

This section must never generate suspected-condition phrasing like "Could this be appendicitis?"
— that would be the AI speculating about a diagnosis, which is out of scope.

### Actions

- **Copy | Download PDF | Show Doctor**
- Entry point button: *"Prepare for My Visit"*
- Return-from-visit entry point: *"I've Seen a Doctor"* → *"What happened during your visit?"* →
  enters the After Visit flow (Section 8)

---

## 8. Step 5 — Medication Follow-up & After Visit

### Medication Q&A (pre-visit and ongoing)

When a user reports a prescription (e.g., "My doctor prescribed amoxicillin 500 mg"), CarePath
AI can answer:

- What is it?
- What is it commonly used for?
- Common side effects
- Questions to ask your pharmacist

This is grounded in **RxNorm** (standardized medication identifiers/API) and **DailyMed**
(current FDA label data) — never LLM memory — because pulling drug information from a model's
training data is far less reliable than authoritative NLM sources.

**Hard rule: the AI never alters or recommends dosing.** It never says "you should take two
pills a day" unless it is accurately restating what's on the actual prescription label.

### After Visit (a separate feature from the Doctor Visit Summary)

Naming options under consideration: **"Visit Follow-Up,"** **"After Visit Summary,"** or **"My
Care Plan."**

After the visit, the user can enter what happened — e.g., "The doctor said it might be gastritis
and prescribed omeprazole" — or, in the future, upload discharge instructions, upload a
prescription, photograph a medication label, or manually fill in what the doctor said. This
generates:

**What happened at my visit**

- Doctor's assessment: *Possible gastritis* — reported by patient
- Medication prescribed: Omeprazole
- Tests ordered: None reported
- Follow-up: Return if symptoms persist

**Medication explanation**

- What is this medication?
- How is it commonly used?
- Common side effects
- Important warnings
- Questions for pharmacist

### Source-type tagging (provenance)

Every fact captured in the After Visit flow carries an explicit **source-type tag**:

- `patient_reported`
- `uploaded_document`
- `medication_label`
- `clinician_document`
- `CarePath_generated`

### Preserving clinical hedging

A doctor's hedged language — e.g., "can't rule out gastritis" — **must be preserved as-is**, not
flattened into a confident assertion like "diagnosed gastritis" when CarePath restates it. This
is a hard product rule: uncertainty expressed by a clinician is itself clinically meaningful
information, and resolving it into false certainty when the patient re-enters it would be
actively misleading. The UI and any generation templates must carry hedged phrases through
unchanged rather than "cleaning them up."

---

## 9. Data Model

### Case and visit hierarchy

```
cases
├── symptom_reports
├── urgency_assessments
├── specialty_recommendations
└── visit_summaries

visits
├── prescriptions
├── tests
├── follow_up_instructions
└── after_visit_summaries
```

A `case` represents one health issue end-to-end:

```json
{
  "case_id": "abc123",
  "chief_complaint": "Abdominal pain",
  "created_at": "...",
  "status": "pre_visit"
}
```

A `visit` represents one clinical encounter tied to a case:

```json
{
  "visit_id": "...",
  "case_id": "abc123",
  "visit_date": "...",
  "provider": "...",
  "patient_reported_assessment": "...",
  "status": "completed"
}
```

Splitting `prescriptions`, `tests`, `follow_up_instructions`, and `after_visit_summaries` into
their own records (rather than one large free-text summary field) keeps each fact individually
taggable, queryable, and provenance-tracked.

### The provenance envelope

Every important structured field in the system — not just After Visit facts — must carry a
provenance envelope rather than a bare value:

```json
{
  "value": "...",
  "source": "...",
  "confirmedByUser": true,
  "capturedAt": "...",
  "confidence": "..."
}
```

- `value` — the actual data.
- `source` — where it came from (e.g., `patient_reported`, `uploaded_document`,
  `medication_label`, `clinician_document`, `CarePath_generated`).
- `confirmedByUser` — whether the user has explicitly confirmed this value (see the Step 1
  confirmation step, Section 3).
- `capturedAt` — timestamp.
- `confidence` — **reserved for data-completeness cases** (e.g., the cost-estimate confidence
  label in Section 6) — **never used to display an AI's self-assessed confidence in its own
  extraction or reasoning.** That rule is set in Section 4 and Section 3 and applies globally: if
  the AI is uncertain about something it extracted or inferred, the correct product response is
  a clarifying question to the user, not a number.

### Display defaults

- **AI-generated content and direct user input** default to **expanded**.
- **Uploaded documents, objective facts, and labels** default to **collapsed** (expandable on
  demand).

---

## 10. Engine Outcomes & Unknown-State Handling

Every decision engine in the product — care-level assessment, care routing, and facility
ranking — must support two outcomes in addition to its normal tiers:

- **`INSUFFICIENT_INFORMATION`** — the input doesn't safely support any of the normal outcomes
  (too sparse, too ambiguous, or contradictory).
- **`OUT_OF_SCOPE`** — the input falls into a category CarePath AI is not designed to assess
  (see Section 11).

Each outcome has defined, human-deferring user-facing copy, for example:

> "I don't have enough information to recommend a care setting safely. A healthcare professional
> can help assess this."

The engine must never be forced to pick a normal category (a care level, a specialty, a ranked
facility) when the input doesn't safely support one. Silently guessing in these cases is a
safety risk; an explicit "I don't know, here's what to do instead" is not a failure state — it's
a required outcome.

---

## 11. Scope Boundaries

CarePath AI's MVP has an explicit, stated scope. This is not an exhaustive clinical exclusion
list — it's the set of categories the generic care-level engine is not designed to reason about
safely, and that should route straight to a human-deferring outcome instead.

### Supported scenarios (MVP)

General adult symptom intake and navigation across common, non-specialized complaints (e.g.,
abdominal pain, headache, respiratory symptoms, skin issues, musculoskeletal injury,
urinary/gynecologic symptoms, allergies) as covered by the Step 2.5 routing table.

### Out-of-scope / automatic-escalation scenarios

The following categories are **not scored by the generic care-level engine**. They are called
out by name and route directly to an `OUT_OF_SCOPE` outcome with guidance to seek professional
care:

- Pediatric patients
- Pregnancy-related symptoms
- Mental health crisis
- Poisoning
- Trauma
- Sexual health
- Post-operative complications
- Immunocompromised patients

For example, pregnancy-related symptoms are routed directly to "seek professional care" rather
than being scored by the generic engine, because the generic weighting model was never designed
or validated for the risk profile these categories carry.

---

## 12. Architecture

### Governing pattern

```
Safety rules → structured risk engine → LLM explanation
```

...never:

```
Symptoms → LLM → "probably green"
```

The LLM's role throughout the product is limited to natural-language understanding, follow-up
questioning, and plain-language explanation — never final safety-relevant decisions. Those are
always produced by deterministic rules and a structured risk engine operating on extracted
factors.

### Browser / backend split

```
Browser
│
├── IndexedDB
│   health history
│   assessments
│
└── Backend / Serverless
    ├── AI
    ├── Google Places
    ├── CMS
    ├── pricing
    └── medication APIs
```

Health history is local-first, but the app is never structured as "Browser → Everything." AI
provider keys and Google Maps private API credentials must never live client-side — a
backend/serverless layer proxies all external API calls (AI, Google Places, CMS, pricing,
medication APIs) so provider keys and Maps credentials stay server-side and properly restricted.

### MVP storage: IndexedDB + Dexie

For a browser-first web app, MVP storage is **IndexedDB + Dexie**, not SQLite — IndexedDB is
browser-native, offline-capable, and well suited to local-first apps without requiring a server
database. Local tables include:

```
users
sessions
symptoms
assessments
visit_summaries
medications
saved_facilities
```

### Future optional cloud sync

```
Browser
   ↓
Local DB
   ↓
optional sync
   ↓
Supabase PostgreSQL
```

There is **no requirement to migrate old local data** when cloud sync is introduced — old local
data can simply remain device-only while new data syncs going forward.

**Migration difficulty estimates:**

- **~3–4/10** — local schema → Postgres schema → auth → API/RLS → new data syncs to the cloud,
  with old local data left on-device. Not requiring history migration keeps this tractable.
- **~6.5–8/10** — full bidirectional local ↔ cloud sync with conflict resolution. This is
  explicitly **out of scope for v1.**

### Local data lifecycle controls

Local-first is **not automatically safe** — a shared computer or browser profile means
"on-device" data isn't private by default unless the product gives users real controls over it.
CarePath AI must ship:

- **"Clear my health data"**
- **"Export my data"**
- An optional **auto-delete** setting
- Precise, device-scoped copy: **"Data is stored in this browser on this device"** — not the
  vaguer "stays on your device," which implies a guarantee the architecture doesn't actually
  provide (e.g., it says nothing about other browsers, other devices, or other profiles on the
  same device).

---

## 13. Safety & Compliance Constraints

*(Condensed from a longer regulatory discussion — this is an actionable checklist for v1, not a
substitute for legal review.)*

- No diagnostic claims.
- No medication dosage changes or recommendations by the AI.
- Deterministic handling of critical red flags (Critical Red-Flag Override, Section 4) —
  never left to LLM judgment alone.
- Transparent provenance on every fact (Section 9's provenance envelope).
- Explicit uncertainty is handled by **asking the user a clarifying question**, never by
  displaying a confidence score (Sections 3, 4, 9).
- User confirmation is required before acting on extracted facts ("Here's what I understood,"
  Section 3).
- Privacy controls: clear data, export data, delete data (Section 12).

Regulatory context to keep in mind, kept brief here and not expanded further in v1 docs:

- The FDA's January 2026 final Clinical Decision Support guidance means patient/caregiver-facing
  software can be a regulated medical device regardless of a "not medical advice" disclaimer
  (see Section 4).
- A health app is not automatically covered by HIPAA — HHS guidance is that a direct-to-consumer
  app that isn't a covered entity or business associate generally isn't automatically subject to
  HIPAA Rules just because the data is health-related.
- That does **not** mean health data can be handled carelessly: the FTC's Health Breach
  Notification Rule already covers many non-HIPAA health apps and personal-health-record-type
  products, including breach notification obligations.

**A full HIPAA/FTC/FDA legal review is a required pre-production step — it is out of scope for
this v1 planning document**, which focuses on product and architecture decisions that keep that
future review tractable (deterministic safety rules, provenance, no diagnostic claims, local-
first privacy posture).

---

## 14. Roadmap Priorities

- **Now:** local-first storage (IndexedDB + Dexie), no server database required for MVP.
- **Later:** optional cloud sync (Supabase or another backend), added without requiring
  migration of existing local data.
- **Before any production/clinical claim:** the MVP care-level thresholds (Section 4) are a
  demonstration product rule, not a validated clinical threshold — they must be reviewed and
  validated against credible clinical guidelines by qualified medical professionals before the
  product makes any claim of clinical accuracy.

---

## 15. Attribution

Developed by Ning Lu, Nathan Yao.
