-- Plants & Pure Staff Reporting: read-only checks. Safe to run in Supabase -> SQL Editor.
-- The "all managers see all approvals" fix is in the app code; no schema change is required.
-- These queries confirm the DATA is right for it (and for Madam Ursula as the fixed recipient).

-- 1) Everyone who can review: must show role = manager or ceo AND active = true.
--    A manager listed here as 'employee', or active = false, will NOT see approvals.
select p.name, p.email, r.role, p.active
from public.profiles p
left join public.user_roles r on r.user_id = p.id
order by r.role, p.name;

-- 2) Madam Ursula: exactly ONE active row must come back, with role manager or ceo.
select p.id, p.name, p.email, r.role, p.active
from public.profiles p
left join public.user_roles r on r.user_id = p.id
where p.name ilike '%ursula%';

-- 3) Pending submitted reports (should equal what each manager/CEO now sees in Approvals).
select store, count(*) as pending
from public.reporting_records
where store in ('daily_reports', 'weekly_reports') and payload->>'status' = 'submitted'
group by store;

-- ONLY IF query 1 shows a manager with the wrong role, fix it with (replace the email):
-- select public.set_staff_role('manager-email@example.com', 'manager');
