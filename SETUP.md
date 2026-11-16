# Plants & Pure Staff Reporting — go-live (Supabase + Netlify)

1. **Supabase → SQL Editor:** run `01_schema_and_security.sql`, then `02_company_setup.sql`.
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
