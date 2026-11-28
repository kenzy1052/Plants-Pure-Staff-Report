# Plants & Pure Staff Reporting — go-live (Supabase + Netlify)

1. **Supabase → SQL Editor:** the full current schema is in `supabase/schema_dump.sql` (a pg_dump of the live database). To check roles and the report recipient, run `supabase/verify_roles_and_recipient.sql`. Reviewers: every active **manager** and the **CEO** see and can review all submitted reports.
2. **Supabase → Authentication:**
   - Email provider: keep **Confirm email ON**.
   - URL Configuration: Site URL = your Netlify address; Redirect URLs =
     `https://YOUR-SITE/auth` and `https://YOUR-SITE/auth?recovery=1`.
   - Set up custom SMTP (Resend, Brevo…). Built-in email is limited to a few per hour.
3. **Netlify:** import the project from Git. Build `vite build`, publish `dist/client`
   (already in `netlify.toml`). Add the variables from `.env.example`
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

AI configuration is optional. Report drafting tries **Gemini, then Groq, then DeepSeek**; voice transcription tries **Groq, then Gemini** (DeepSeek has no speech API). A provider is used only if its key is set, and if one fails for any reason (no credit, rate limit, retired model, outage, bad output) the next one answers. Add these server variables locally and in **Netlify → Site configuration → Environment variables**, then redeploy:

| Variable | Default | Notes |
|---|---|---|
| `GEMINI_API_KEY` | | From [Google AI Studio](https://aistudio.google.com/apikey). **Use a project with no billing account linked** (see below). |
| `GROQ_API_KEY` | | From [Groq Console → API Keys](https://console.groq.com/keys). Free tier. |
| `DEEPSEEK_API_KEY` | | Optional. From [platform.deepseek.com](https://platform.deepseek.com). Pay-as-you-go, very cheap. |
| `REPORT_AI_PROVIDER` | `gemini` | One name or a list, e.g. `gemini,deepseek,groq`. Unlisted providers follow in the default order. |
| `REPORT_AI_MODEL` | `gemini-3.1-flash-lite` | Stable, free-tier, accepts audio. |
| `GROQ_REPORT_MODEL` | `openai/gpt-oss-120b` | `llama-3.3-70b-versatile` was shut down by Groq on 16 Aug 2026. |
| `DEEPSEEK_REPORT_MODEL` | `deepseek-flash` | The old `deepseek-chat` id is retired. |
| `REPORT_TRANSCRIPTION_PROVIDER` | `groq` | |
| `REPORT_TRANSCRIPTION_MODEL` | `whisper-large-v3-turbo` | Groq speech-to-text. |
| `GEMINI_TRANSCRIPTION_MODEL` | `gemini-3.1-flash-lite` | Gemini has no separate transcription model; a Flash model with audio input is used. |
| `GROQ_API_URL` | `https://api.groq.com/openai/v1` | `/v1` exactly once. |
| `DEEPSEEK_API_URL` | `https://api.deepseek.com` | No `/v1`. |

**Why Gemini can say "402 prepayment credits are depleted".** The Gemini free tier only applies to projects that are *not* linked to a Google billing account. Once a project is linked (for example by enabling billing or Prepay in AI Studio), it is treated as a paid project and every request returns 402 when the prepaid balance is $0. Fix: in AI Studio → API keys / Projects, either unlink billing from that project, or create a **new project with no billing** and create the key there. Rate limits are per project, not per key.

Model names change. If a provider reports "model does not exist", check the provider's model list and set the matching variable above; no code change is needed.

The provider calls are server-only and require an authenticated Supabase employee session. Gemini uses its native JSON structured-output request; Groq and DeepSeek use OpenAI-compatible chat endpoints (Groq with JSON schema, DeepSeek with JSON mode). Transcription uses Groq's multipart audio endpoint and Gemini's native audio `generateContent`; the formats are not mixed. If every provider fails, the app uses the offline parser and says so on screen. API keys never reach the browser and are redacted from logs and errors.

## Daily report recipient

Every daily report is sent to Madam Ursula; employees cannot change it. The server resolves her from the `profiles` table (the single active profile whose name contains `Ursula`) and stamps the report's `submittedToId`/`submittedToName` and `supervisor_id` on every save, whatever the browser sends. If no profile (or more than one) matches, saving fails with a message naming what to fix. Optional server variables: `REPORT_RECIPIENT_USER_ID` (exact profile id, preferred) or `REPORT_RECIPIENT_NAME`. The recipient must have the `manager` or `ceo` role to review reports.

If both providers fail, the original narration or transcript remains in the form and manual reporting remains available. Never prefix either secret with `VITE_`, commit a real value, or place a provider key in browser code. The current implementation logs only provider, purpose, outcome, latency, and sanitized status metadata; it does not log keys, authorization headers, or narration content.
