# Daily Report redesign: Kenzy floating assistant, structured AI, simplified form

Drop these files into the project at the same paths. No new npm packages. No database migration.

## Files modified (original locations kept)
| File | What changed |
|---|---|
| `src/components/reports/DailyReportForm.tsx` | Rebuilt as a form-first, single-page layout using the approved 5-section template (Report information, Objectives and results, Activities, Challenges and actions, Plans for tomorrow). Section nav with completion state, collapsible sections, inline validation, sticky Save draft / Submit bar, "+ Add another ..." repeaters, plans start with ONE input. Evidence/photo upload UI and handlers removed. Kenzy applies changes to this form's real state; highlight of changed rows; undo stack. Draft saving, local autosave, offline banner, recipient lookup, submit lock and confirm dialog are preserved. |
| `src/components/reports/DailyReportChat.tsx` | Now the Kenzy chat overlay (full screen on phones, floating panel on desktop, Esc/close button, stays mounted so nothing is lost). Three-stage voice flow: Speak (live words, timer, X cancel) -> Done tick (review/edit) -> Send. States: listening / writing out / thinking. |
| `src/services/narrationParser.ts` | Offline parser now splits compound sentences, extracts quantities/places, never invents objectives (pending work becomes a challenge). Fuzzy duplicate detection (`isSameItem`), merge now returns an undo record + touched ids, field-level `undoMerge`, `describeMerge` wording, activity-to-objective link validation. |
| `src/services/cloud.functions.ts` | AI prompt rewritten to distribute narration across objectives / activities / challenges / plans with a worked example and strict "no invention" rules; JSON schema + validation gain `objectiveId` (only accepted if it matches an existing objective). |
| `src/services/narrationAssistant.ts` | Offline fallback receives the current report (to match existing objectives). |
| `src/hooks/use-voice-capture.ts` | Exports shared helpers (one-microphone-at-a-time guard, recogniser helpers). Behaviour of existing field microphones unchanged. |
| `src/types/index.ts` | Optional `objectiveId` on `DailyActivity` and `NarrationDraftActivity`. Stored in the existing JSON payload; old reports without it still load. |
| `src/styles.css` | Appended styles for buttons, pills, nav, action bar, highlight, Kenzy dock/bubble/avatar/panel. Nothing existing removed. |
| `src/test/assistant-features.test.ts` | Updated for the new rules and new tests (the Christmas example, duplicates, linking, undo). |

## New files
- `src/assets/kenzy.webp` - the supplied mascot, background made transparent (artwork unchanged, only cropped by CSS).
- `src/components/reports/KenzyMascot.tsx` - floating mascot, greeting bubble, avatar.
- `src/components/reports/ReportFormParts.tsx` - shared form building blocks.
- `src/hooks/use-live-dictation.ts` - live dictation hook.

## Configuration
No database or environment changes. Existing `GEMINI_API_KEY` / `GROQ_API_KEY` setup is reused.

## Behaviour notes and limits
- **Live transcription:** the Gemini/Groq providers transcribe a finished recording and cannot stream. Live words come from the browser's built-in speech recognition (Chrome, Edge, Safari). Where the browser has none (e.g. Firefox), the app records and shows the text after the tick, and says so. After the tick, a signed-in user's audio is also sent to the server provider; if that succeeds its text replaces the live one, otherwise the live words are kept. On some Android phones live words may not run while recording; the app shows a note and still transcribes.
- **Undo** reverses only Kenzy's changes, field by field. Rows Kenzy added and the employee later edited are kept.
- **Objectives are never invented.** Pending work becomes a challenge; an objective is updated only when it already exists and matches. Because submission still requires at least one objective (existing rule), an employee with no objective must add one by hand.
- **Evidence:** the upload UI is gone, but `attachments` of an existing report are passed through unchanged on every save, and the detail view still shows them.
- Per-field microphones remain on the main text fields only (not on small detail fields like place or quantity).

## Template review: overlapping fields (kept, not removed)
- Objective "Result achieved" vs activity "Result or outcome" vs activity "How many?" overlap. They are kept for supervisor and export compatibility; activity details are collapsed by default and activities can be linked to an objective so results are not retyped.
- Challenge "What did you do about it?" and "This problem is solved" overlap lightly; kept.
- Plan "Resources" and "Approval" are rarely used; now behind an optional disclosure.

## Testing status (honest)
Done in this environment: unit tests for the parser/merge/undo logic (24 pass, run through a small harness because vitest is not installed here), a partial TypeScript check of the new files with stubbed libraries (no errors in the logic files), and a visual check of the mascot, bubble and avatar CSS on desktop and phone widths.
NOT done: `npm run build`, full `tsc`, vitest, and live runs of the form, microphone and AI providers. The project's dependencies could not be installed here (no network). Please run `npm install && npx tsc --noEmit && npm test && npm run build` and try the checklist in the brief before release.

## Update 2: Kenzy shows a preview first, and understands dictation that reads the form labels aloud

Problem reported: when a statement read the form's labels aloud ("Objective assigned ... was it finished yes ... activities performed ... how many ..."), everything landed in Activities with some words missing. Cause: that output came from the **offline fallback parser** (it copies sentences into Activities and knew nothing about labels), and the AI prompt did not know about label-style dictation either.

| File | Change |
|---|---|
| `src/components/reports/DailyReportChat.tsx` | Kenzy no longer writes into the form by herself. She shows how she understood the message, field by field, with **Fill form**, **Try again**, **Edit my words** and **Discard**. Only Fill form changes the report. Review and Undo appear after filling, as before. |
| `src/services/cloud.functions.ts` | AI prompt now explains that staff read the form labels aloud (each label and which field it fills), speech-to-text repairs ("cup cat pc" = CapCut PC), self-corrections ("sorry, one video"), and "no / skip / none" answers. Includes the real example from the bug report. "Objective assigned" now counts as a stated objective. |
| `src/services/narrationParser.ts` | New `parseLabelledNarration`: the offline parser now uses spoken form labels to fill the right fields (objective, finished, result achieved, activity, platform, how many, outcome, time, challenge, action, plan). Needs at least 3 different labels, and ordinary words like "time" or "details" only count as labels at the start of a sentence, so normal narration is parsed exactly as before. |
| `src/services/narrationAssistant.ts` | When the AI fails and the offline parser is used, the reason is now written to the browser console (`[Kenzy] ...`). |
| `src/test/assistant-features.test.ts` | 3 new tests (the exact bug sentence, a "not finished" example, and ordinary words not being mistaken for labels). All 27 tests pass in the harness described below. |

How to tell whether the AI or the offline parser prepared a draft: the small line under Kenzy's message says "Prepared with Gemini/Groq" (AI) or "The offline parser prepared this draft instead" (fallback, shown in amber). If you keep seeing the fallback, the AI call is failing: check the browser console for `[Kenzy]` and the server log for lines starting `[report-ai]`, then check `GEMINI_API_KEY`, `GROQ_API_KEY`, and the model names (`REPORT_AI_MODEL`, `GROQ_REPORT_MODEL`).

Tested here: all 27 tests (24 existing + 3 new) pass through a small harness (vitest is not installed here), and the chat component and parser type-check apart from errors caused by stubbed libraries. NOT tested: the live Gemini/Groq calls (no keys or network here), `npm run build`, and the new buttons in a browser. Please try the buttons and one real dictation before release.

---

## Mobile fix and chat refresh (Kenzy)

- **Mascot was off-screen on phones.** The invisible screen-reader text inside the section-nav chips (`.sr-only`, absolutely positioned) was not clipped by the scrolling nav, so it stuck out to the right and made phone browsers widen the page to about 693px. The fixed bottom-right mascot was pinned to that wider page, so you had to scroll right to find it. Fixed in `src/styles.css` (`.pp-nav` and `.pp-nav-chip` are now `position: relative`, plus `overflow-x: clip` on `html`/`body` as a safety net).
- **Mascot and chat render into `document.body`** (React portals), so they are always an overlay on the screen corner and no parent can move them. On phones the mascot sits just above the sticky Save/Submit bar and follows that bar's real height.
- **Chat look:** blue header, soft-blue replies from Kenzy (the yellow warning style is gone), solid-blue messages from the employee, blue buttons and focus rings inside the chat. Light and dark mode.
- **Messages sit at the bottom**, right above the input, and each new message is added underneath the last. A very tall reply scrolls to its first line.
- The greeting skips titles, so "Dr. Tariq" is greeted as "Tariq".
