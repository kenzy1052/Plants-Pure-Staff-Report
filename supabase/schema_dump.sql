--
-- PostgreSQL database dump
--

\restrict LgBCHkpr8U2rKzu6idyfK5CYt9VWj2XI9E4XNddtfXd9Kg43cMIKxBdVleJaR6g

-- Dumped from database version 17.11
-- Dumped by pg_dump version 18.7

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: pg_database_owner
--

CREATE SCHEMA public;


ALTER SCHEMA public OWNER TO pg_database_owner;

--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: pg_database_owner
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: app_role; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.app_role AS ENUM (
    'ceo',
    'manager',
    'employee'
);


ALTER TYPE public.app_role OWNER TO postgres;

--
-- Name: has_role(uuid, public.app_role); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;


ALTER FUNCTION public.has_role(_user_id uuid, _role public.app_role) OWNER TO postgres;

--
-- Name: is_active_staff(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.is_active_staff() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (select 1 from public.profiles where id = auth.uid() and active)
$$;


ALTER FUNCTION public.is_active_staff() OWNER TO postgres;

--
-- Name: provision_reporting_user(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.provision_reporting_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  m        jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  sup      uuid;
  sup_name text;
  nm       text  := btrim(coalesce(m->>'name', ''));
  code     text  := 'PP-' || lpad(nextval('public.staff_code_seq')::text, 3, '0');
begin
  -- supervisor must be an active CEO/manager; anything else is ignored
  begin
    select p.id, coalesce(nullif(p.name, ''), p.email) into sup, sup_name
      from public.profiles p join public.user_roles r on r.user_id = p.id
     where p.id = (m->>'supervisor_id')::uuid and p.active and r.role in ('ceo', 'manager');
  exception when others then sup := null; end;

  insert into public.profiles (id, email, name, phone, employee_code, department, role_title, supervisor_id, active)
  values (new.id, lower(coalesce(new.email, '')), nm, btrim(coalesce(m->>'phone', '')), code,
          btrim(coalesce(m->>'department', '')), btrim(coalesce(m->>'role_title', '')), sup, true)
  on conflict (id) do nothing;

  insert into public.user_roles (user_id, role) values (new.id, 'employee')
  on conflict (user_id) do nothing;

  -- if the CEO had already added this person on the Employees screen, merge that entry
  update public.reporting_records
     set id = new.id::text,
         payload = payload || jsonb_build_object('id', new.id::text, 'employeeId', code)
   where store = 'employees' and id <> new.id::text and lower(payload->>'email') = lower(coalesce(new.email, ''))
     and not exists (select 1 from public.reporting_records x where x.store = 'employees' and x.id = new.id::text);
  return new;
end $$;


ALTER FUNCTION public.provision_reporting_user() OWNER TO postgres;

--
-- Name: set_staff_role(text, public.app_role); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.set_staff_role(p_email text, p_role public.app_role) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare uid uuid;
begin
  select id into uid from public.profiles where lower(email) = lower(btrim(p_email));
  if uid is null then raise exception 'No account with email % — they must sign up first.', p_email; end if;
  if p_role <> 'ceo'
     and exists (select 1 from public.user_roles where user_id = uid and role = 'ceo')
     and not exists (select 1 from public.user_roles r join public.profiles f on f.id = r.user_id
                      where r.role = 'ceo' and f.active and f.id <> uid) then
    raise exception 'Cannot remove the last CEO.';
  end if;
  update public.user_roles set role = p_role where user_id = uid;
  return p_email || ' is now ' || p_role::text;
end $$;


ALTER FUNCTION public.set_staff_role(p_email text, p_role public.app_role) OWNER TO postgres;

--
-- Name: signup_options(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.signup_options() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select jsonb_build_object(
    'departments', coalesce((select jsonb_agg(name order by name) from public.departments), '[]'::jsonb),
    'designations', coalesce((select jsonb_agg(jsonb_build_object('title', payload->>'title', 'department', payload->>'department') order by payload->>'title')
                                from public.reporting_records
                               where store = 'roles' and coalesce((payload->>'active')::boolean, true)), '[]'::jsonb),
    'supervisors', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', coalesce(nullif(p.name, ''), p.email), 'title', p.role_title) order by p.name)
                               from public.profiles p join public.user_roles r on r.user_id = p.id
                              where p.active and r.role in ('ceo', 'manager')), '[]'::jsonb)
  )
$$;


ALTER FUNCTION public.signup_options() OWNER TO postgres;

--
-- Name: sync_employee_record(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.sync_employee_record() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  p         jsonb := new.payload;
  pid       uuid;
  sup_ref   text := nullif(btrim(coalesce(p->>'supervisorId', '')), '');
  sup_name  text := nullif(btrim(coalesce(p->>'supervisorName', '')), '');
  sup_uuid  uuid;
  is_active boolean := coalesce(p->>'status', 'active') = 'active';
begin
  if new.store <> 'employees' then return new; end if;
  begin pid := (p->>'id')::uuid; exception when others then pid := null; end;
  if pid is null or not exists (select 1 from public.profiles where id = pid) then return new; end if;

  if sup_ref is not null then
    select p2.id into sup_uuid from public.profiles p2 join public.user_roles r on r.user_id = p2.id
     where p2.id::text = sup_ref and p2.active and r.role in ('ceo', 'manager');
  end if;
  if sup_uuid is null and sup_name is not null
     and (select count(*) from public.profiles p2 join public.user_roles r on r.user_id = p2.id
           where lower(p2.name) = lower(sup_name) and p2.active and r.role in ('ceo', 'manager')) = 1 then
    select p2.id into sup_uuid from public.profiles p2 join public.user_roles r on r.user_id = p2.id
     where lower(p2.name) = lower(sup_name) and p2.active and r.role in ('ceo', 'manager');
  end if;

  if not is_active
     and exists (select 1 from public.user_roles where user_id = pid and role = 'ceo')
     and not exists (select 1 from public.user_roles r join public.profiles f on f.id = r.user_id
                      where r.role = 'ceo' and f.active and f.id <> pid) then
    raise exception 'The last active CEO account cannot be deactivated.';
  end if;

  update public.profiles set
    name          = coalesce(nullif(p->>'name', ''), name),
    phone         = coalesce(nullif(p->>'phone', ''), phone),
    employee_code = coalesce(nullif(p->>'employeeId', ''), employee_code),
    department    = coalesce(nullif(p->>'department', ''), department),
    role_title    = coalesce(nullif(p->>'roleTitle', ''), role_title),
    supervisor_id = coalesce(sup_uuid, supervisor_id),
    active        = is_active
   where id = pid;
  return new;
end $$;


ALTER FUNCTION public.sync_employee_record() OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: departments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.departments (
    name text NOT NULL
);


ALTER TABLE public.departments OWNER TO postgres;

--
-- Name: profiles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    name text DEFAULT ''::text NOT NULL,
    email text DEFAULT ''::text NOT NULL,
    phone text DEFAULT ''::text NOT NULL,
    original_id text,
    employee_code text DEFAULT ''::text NOT NULL,
    department text DEFAULT ''::text NOT NULL,
    role_title text DEFAULT ''::text NOT NULL,
    supervisor_id uuid,
    active boolean DEFAULT true NOT NULL
);


ALTER TABLE public.profiles OWNER TO postgres;

--
-- Name: push_subscriptions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.push_subscriptions (
    endpoint text NOT NULL,
    user_id uuid NOT NULL,
    p256dh text NOT NULL,
    auth text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.push_subscriptions OWNER TO postgres;

--
-- Name: reporting_records; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.reporting_records (
    store text NOT NULL,
    id text NOT NULL,
    owner_id uuid NOT NULL,
    supervisor_id uuid,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.reporting_records OWNER TO postgres;

--
-- Name: staff_code_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.staff_code_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.staff_code_seq OWNER TO postgres;

--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_roles (
    user_id uuid NOT NULL,
    role public.app_role DEFAULT 'employee'::public.app_role NOT NULL
);


ALTER TABLE public.user_roles OWNER TO postgres;

--
-- Name: departments departments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_pkey PRIMARY KEY (name);


--
-- Name: profiles profiles_original_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_original_id_key UNIQUE (original_id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: push_subscriptions push_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_pkey PRIMARY KEY (endpoint);


--
-- Name: reporting_records reporting_records_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reporting_records
    ADD CONSTRAINT reporting_records_pkey PRIMARY KEY (store, id);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (user_id);


--
-- Name: push_subscriptions_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX push_subscriptions_user ON public.push_subscriptions USING btree (user_id);


--
-- Name: reporting_owner; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX reporting_owner ON public.reporting_records USING btree (owner_id, store);


--
-- Name: reporting_supervisor; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX reporting_supervisor ON public.reporting_records USING btree (supervisor_id, store);


--
-- Name: reporting_records reporting_employee_sync; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER reporting_employee_sync AFTER INSERT OR UPDATE ON public.reporting_records FOR EACH ROW WHEN ((new.store = 'employees'::text)) EXECUTE FUNCTION public.sync_employee_record();


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: push_subscriptions push_subscriptions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: departments; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

--
-- Name: user_roles own_role; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY own_role ON public.user_roles FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR (public.is_active_staff() AND public.has_role(auth.uid(), 'ceo'::public.app_role))));


--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles profiles_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY profiles_read ON public.profiles FOR SELECT USING (((id = auth.uid()) OR (public.is_active_staff() AND (public.has_role(auth.uid(), 'ceo'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role)))));


--
-- Name: push_subscriptions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: reporting_records reporting_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY reporting_read ON public.reporting_records FOR SELECT USING ((public.is_active_staff() AND ((owner_id = auth.uid()) OR public.has_role(auth.uid(), 'ceo'::public.app_role) OR (public.has_role(auth.uid(), 'manager'::public.app_role) AND ((store = ANY (ARRAY['daily_reports'::text, 'weekly_reports'::text])) OR (supervisor_id = auth.uid()))) OR (store = ANY (ARRAY['roles'::text, 'settings'::text])))));


--
-- Name: reporting_records; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.reporting_records ENABLE ROW LEVEL SECURITY;

--
-- Name: user_roles; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: pg_database_owner
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION has_role(_user_id uuid, _role public.app_role); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.has_role(_user_id uuid, _role public.app_role) FROM PUBLIC;
GRANT ALL ON FUNCTION public.has_role(_user_id uuid, _role public.app_role) TO authenticated;
GRANT ALL ON FUNCTION public.has_role(_user_id uuid, _role public.app_role) TO service_role;


--
-- Name: FUNCTION is_active_staff(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.is_active_staff() FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_active_staff() TO authenticated;
GRANT ALL ON FUNCTION public.is_active_staff() TO service_role;


--
-- Name: FUNCTION provision_reporting_user(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.provision_reporting_user() FROM PUBLIC;
GRANT ALL ON FUNCTION public.provision_reporting_user() TO service_role;


--
-- Name: FUNCTION set_staff_role(p_email text, p_role public.app_role); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.set_staff_role(p_email text, p_role public.app_role) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_staff_role(p_email text, p_role public.app_role) TO service_role;


--
-- Name: FUNCTION signup_options(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.signup_options() FROM PUBLIC;
GRANT ALL ON FUNCTION public.signup_options() TO anon;
GRANT ALL ON FUNCTION public.signup_options() TO authenticated;
GRANT ALL ON FUNCTION public.signup_options() TO service_role;


--
-- Name: FUNCTION sync_employee_record(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.sync_employee_record() FROM PUBLIC;
GRANT ALL ON FUNCTION public.sync_employee_record() TO service_role;


--
-- Name: TABLE departments; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.departments TO service_role;


--
-- Name: TABLE profiles; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.profiles TO service_role;
GRANT SELECT ON TABLE public.profiles TO authenticated;


--
-- Name: TABLE push_subscriptions; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.push_subscriptions TO service_role;


--
-- Name: TABLE reporting_records; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.reporting_records TO service_role;
GRANT SELECT ON TABLE public.reporting_records TO authenticated;


--
-- Name: SEQUENCE staff_code_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.staff_code_seq TO anon;
GRANT ALL ON SEQUENCE public.staff_code_seq TO authenticated;
GRANT ALL ON SEQUENCE public.staff_code_seq TO service_role;


--
-- Name: TABLE user_roles; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.user_roles TO service_role;
GRANT SELECT ON TABLE public.user_roles TO authenticated;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- PostgreSQL database dump complete
--

\unrestrict LgBCHkpr8U2rKzu6idyfK5CYt9VWj2XI9E4XNddtfXd9Kg43cMIKxBdVleJaR6g

