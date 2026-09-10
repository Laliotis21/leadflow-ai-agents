-- Lock every table against the public anon key.
--
-- Run this in the Supabase SQL editor AFTER SUPABASE_SERVICE_ROLE_KEY is set
-- on Render, otherwise the running service loses access immediately.
--
-- The service-role key bypasses RLS entirely, so no policies are needed for
-- the backend. With RLS enabled and zero policies, anon and authenticated
-- callers can read and write nothing.

alter table public.leads          enable row level security;
alter table public.events         enable row level security;
alter table public.outreach_logs  enable row level security;
alter table public.api_usage      enable row level security;
alter table public.search_cache   enable row level security;

-- Drop any permissive policies left over from the open setup.
do $$
declare
  pol record;
begin
  for pol in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('leads', 'events', 'outreach_logs', 'api_usage', 'search_cache')
  loop
    execute format('drop policy %I on %I.%I', pol.policyname, pol.schemaname, pol.tablename);
  end loop;
end $$;

-- Belt and braces: revoke direct grants from the PostgREST roles.
revoke all on public.leads, public.events, public.outreach_logs,
              public.api_usage, public.search_cache
  from anon, authenticated;

-- Verify: every row below must show rowsecurity = true and zero policies.
-- select tablename, rowsecurity from pg_tables where schemaname = 'public';
-- select tablename, count(*) from pg_policies where schemaname = 'public' group by 1;
