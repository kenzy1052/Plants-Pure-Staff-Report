# Plants & Pure Staff Reporting — go-live (Supabase + Netlify)

1. **Supabase → SQL Editor:** the full current schema is in `supabase/schema_dump.sql` (a pg_dump of the live database). To check roles and the report recipient, run `supabase/verify_roles_and_recipient.sql`. Reviewers: every active **manager** and the **CEO** see and can review all submitted reports.
2. **Supabase → Authentication:**
   - Email provider: keep **Confirm email ON**.
   - URL Configuration: Site URL = your Netlify address; Redirect URLs =
     `https://YOUR-SITE/auth` and `https://YOUR-SITE/auth?recovery=1`.
   - Set up custom SMTP (Resend, Brevo…). Built-in email is limited to a few per hour.
3. **Netlify:** import the project from Git. Build `vite build`, publish `dist/client`
   (already in `netlify.toml`). Add the 6 variables from `.env.example`
   (Site configuration → Environment variables). Deploy.
4. Madam Priscilla Yeboah signs up and verifies her email, then in SQL Editor:
   `select public.set_staff_role('her-email', 'ceo');`
5. Staff sign up with the form. Promote managers the same way with `'manager'`.
6. Test: employee sees only their own reports/downloads; manager sees team; CEO sees all.

## Phone alerts (work when the app is closed)
1. Run `04_push_alerts.sql` in Supabase (after 01–03).
2. `npm install`, then run `npx web-push generate-vapid-keys`. Copy the two keys.
3. Add to `.env` (local) and Netlify environment variables:
   `VITE_VAPID_PUBLIC_KEY` (public key), `VAPID_PRIVATE_KEY` (private key, keep secret),
   `VAPID_SUBJECT` (`mailto:` + an email you control).
4. Redeploy. Each staff member taps **Turn on** when asked. iPhones: first add the app to the
   Home Screen (Share → Add to Home Screen), then open it from there.
5. Deadline reminders are sent by the Netlify scheduled function `netlify/functions/send-reminders.mts`
   (every 15 minutes). Check it under Netlify → Functions after deploying.


## Authentication and email confirmation

The application keeps Supabase authentication and does not bypass it. The registration form asks for a password and confirmation password; it does not ask the user to type their email twice. Choose the intended registration behavior in **Supabase → Authentication → Providers → Email**:

- Keep **Confirm email** enabled when every new staff member must verify ownership of their email address. Users must verify before the account can be used, and the Site URL/Redirect URLs above must be correct.
- Disable **Confirm email** only when the organisation intentionally wants immediate sign-in after registration. This is a Supabase dashboard setting, not a client-side workaround.

The sign-in screen uses **Enter Password** / **Enter your password**; registration retains password-creation wording.

## Narration assistant and voice input

The daily report form includes a typed, pasted, or voice narration assistant. Browser speech recognition is used when available. Otherwise the app attempts microphone capture and server transcription; if microphone access, the browser, a provider, or a quota prevents this, the narration remains available for manual editing and manual reporting is not blocked. The assistant never submits a report automatically: extracted activities, pending items, challenges, and next-day plans are placed into the existing editable form for employee review.

AI configuration is optional. The application uses Gemini as the primary report-structuring provider and Groq as its fallback. For voice transcription it uses Groq first and Gemini second. Add the following server environment variables locally and in **Netlify → Site configuration → Environment variables**, then redeploy:

- `GEMINI_API_KEY`: key created through [Google AI Studio](https://aistudio.google.com/apikey).
- `GROQ_API_KEY`: key created at [Groq Console → API Keys](https://console.groq.com/keys).
- `REPORT_AI_PROVIDER`: `gemini` by default. This is a provider preference, not a credential.
- `REPORT_AI_MODEL`: `gemini-3.8-flash` by default. The verified Gemini model supports structured JSON output and audio input.
- `GROQ_REPORT_MODEL`: `llama-3.3-70b-versatile` for report-structuring fallback.
- `REPORT_TRANSCRIPTION_PROVIDER`: `groq` by default.
- `REPORT_TRANSCRIPTION_MODEL`: `whisper-large-v3-turbo` for Groq transcription.
- `GEMINI_TRANSCRIPTION_MODEL`: `gemini-3.5-transcribe` for Gemini transcription fallback.
- `GROQ_API_URL`: `https://api.groq.com/openai/v1`; the implementation includes `/v1` exactly once.

The provider calls are server-only and require an authenticated Supabase employee session. The report endpoint uses Gemini's native JSON structured-output request and Groq's OpenAI-compatible chat endpoint separately. The transcription endpoint uses Groq's multipart audio endpoint and Gemini's native audio `generateContent` request separately; the formats are not mixed. Fallback is real: if the first provider fails for **any** reason (rate limit, quota, outage, timeout, unavailable model, bad/missing key, or invalid/incomplete output) the other provider is tried once. If both fail, the app uses the offline parser and says so on screen. Provider order comes from `REPORT_AI_PROVIDER` (report drafting, default Gemini then Groq) and `REPORT_TRANSCRIPTION_PROVIDER` (speech, default Groq then Gemini). API keys never reach the browser and are redacted from logs and errors.

## Daily report recipient

Every daily report is sent to Madam Ursula; employees cannot change it. The server resolves her from the `profiles` table (the single active profile whose name contains `Ursula`) and stamps the report's `submittedToId`/`submittedToName` and `supervisor_id` on every save, whatever the browser sends. If no profile (or more than one) matches, saving fails with a message naming what to fix. Optional server variables: `REPORT_RECIPIENT_USER_ID` (exact profile id, preferred) or `REPORT_RECIPIENT_NAME`. The recipient must have the `manager` or `ceo` role to review reports.

If both providers fail, the original narration or transcript remains in the form and manual reporting remains available. Never prefix either secret with `VITE_`, commit a real value, or place a provider key in browser code. The current implementation logs only provider, purpose, outcome, latency, and sanitized status metadata; it does not log keys, authorization headers, or narration content.
