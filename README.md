# Plants & Pure Staff Reporting — redesign handoff

This archive contains only the files modified for the daily-report redesign, preserving their original project paths.

## Included changes

- Made the structured daily-report form the primary interface on “Add Daily Report”.
- Replaced the embedded chat-first assistant with a floating Kenzy assistant that introduces herself, stays available without obstructing the form, reviews the form, applies AI-organised updates, reports what changed, and supports undo.
- Added typed and voice narration support with progressive browser-recognition transcript updates where supported.
- Added explicit voice start, cancel (`X`), finish/review (`✓`), and send controls; the transcript remains editable before AI processing.
- Kept narration distribution connected to the existing objectives, activities, outcomes, challenges, tomorrow plans, resources, and approvals fields through the existing parser/merge services.
- Removed evidence/photo/file-upload controls from daily-report creation while retaining legacy attachment data in save/autosave payloads for compatibility with existing records.
- Kept authentication, recipient resolution, draft saving, local autosave/offline state, Supabase persistence, approvals, notifications, weekly reports, history, and saved-record compatibility in place.
- Kept quantities optional in the activity completion indicator and form validation.

## Validation

- `npm run build`: passed after the redesign.
- Focused assistant/routing tests: 17 passed.
- Full suite: 36 passed, 1 pre-existing failure in `src/test/reporting-rules.test.ts` concerning manager/CEO review permissions.
- `npx tsc --noEmit`: the redesign files add no reported diagnostics; the baseline project still reports 19 errors in existing push/export/config files (`src/lib/push.server.ts`, `src/lib/pushClient.ts`, `src/utils/exportUtils.ts`, `vite.config.ts`).
- Obsolete evidence-upload references were scanned and are absent from the redesigned report components/styles.

## Preview and environment notes

A local Vite preview was started from the project root on port `4173` after a successful production build; the dev server is also available on port `5173`. The sandbox preview route and `/manus-routes.json` return HTTP 200. The preview browser has no authenticated Supabase session/configuration, so it stays on the existing session-loading shell until valid project Supabase environment variables and a staff session are supplied. No production database writes were performed.

The supplied `schema.sql` remains the source of truth for Supabase configuration; configure the existing variables documented in the project’s setup documentation before testing authenticated save, submit, approval, notification, and AI provider flows.
