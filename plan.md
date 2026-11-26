# Plants & Pure Staff Reporting Upgrade Plan

## Scope

Extend the existing React/TanStack Start + Supabase staff reporting application without changing its authentication provider, persistence model, report fields, approval workflow, exports, or deployment configuration.

## Implementation approach

1. **Audit and interface corrections** — keep the current authentication experience, remove any duplicate email confirmation input, and use `Enter Password` / `Enter your password` on sign-in while preserving registration password confirmation. Document that Supabase email confirmation is controlled in the Supabase Authentication dashboard.
2. **Personal activity intelligence** — derive employee-specific suggestions from their own persisted `daily_reports` history. Rank by a recency-weighted frequency score, show them as selectable chips in the existing Activities section, allow dismissal, and use selected suggestions to prefill activity tasks. No AI call is used for this feature.
3. **Natural narration assistant** — add a prominent narration composer to the existing daily form. It supports typed or pasted narration, browser-native speech recognition when available, and a manual fallback. Processing maps only explicitly mentioned facts into the existing objectives, activities, challenges, and tomorrow-plan fields. Results always return to the editable form for employee review.
4. **Secure AI boundary** — add authenticated TanStack server functions that call the configured Groq OpenAI-compatible service using server-only runtime credentials. Validate narration length and parsed JSON, return a clear error on provider failure, and fall back to a deterministic local parser so manual reporting remains available. No API key is exposed to the browser.
5. **Regression coverage** — add unit tests for suggestion ranking/deduplication and conservative narration parsing, update setup documentation with provider and Supabase configuration notes, and run tests, build, and focused type checks.

## Project structure

- `src/components/reports/DailyReportForm.tsx`: existing daily report form, enhanced with the narration assistant, voice control, review state, and activity suggestions.
- `src/services/activitySuggestions.ts`: pure employee-history ranking and normalization helpers.
- `src/services/narrationAssistant.ts`: safe local narration extraction and server-function client wrapper.
- `src/services/cloud.functions.ts`: authenticated server-side AI and optional speech transcription boundary, preserving existing record functions.
- `src/types/index.ts`: existing report types plus assistant output types.
- `src/test/*`: regression and new feature tests.
- `plan.md` and `TODO.md`: implementation record.

## Design

- **Distinct styles considered:** Operational field notebook — 0.08; Quiet botanical utility — 0.06; Editorial compliance console — 0.04.
- **Chosen direction:** Quiet botanical utility, because it extends the existing Plants & Pure visual language without introducing a new identity.
- **Design movement:** Calm botanical operations software with compact, editorially structured reporting controls.
- **Core principles:** Reduce repeated typing; keep employee ownership visible; make AI assistance transparent and reversible; preserve the established form hierarchy.
- **Color philosophy:** Reuse the existing lime/olive botanical accents for suggestions and success, reserve warm orange for AI actions, and keep warnings/destructive states unchanged.
- **Layout paradigm:** Add a concise assistant panel above the existing structured fields, then retain the existing long-form report sections as the source of truth.
- **Signature elements:** Activity suggestion chips, a quiet “AI draft” review state, and a microphone control with an explicit recording/transcription status.
- **Interaction philosophy:** Suggestions are optional, dismissible, and employee-specific. AI can draft but never submits. Every generated value is editable in the existing controls.
- **Animation:** Use existing fade-up/transition conventions only; no blocking or decorative motion.
- **Typography system:** Keep the current Inter-based system and existing compact labels.
- **Brand essence:** A dependable daily reporting workspace for Plants & Pure teams that turns routine notes into reviewable operational records. Personality: grounded, clear, accountable.
- **Brand voice:** Headings are direct and reassuring. Example lines: “Write your day once.” and “Review the draft before you submit.”
- **Wordmark & logo:** Preserve the existing supplied logo and authentication artwork.
- **Signature brand color:** Existing botanical lime primary, reused for suggestions and completion cues.
