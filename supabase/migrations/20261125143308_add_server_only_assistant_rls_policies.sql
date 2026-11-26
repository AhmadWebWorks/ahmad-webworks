-- Recovered server-only RLS policies for the assistant backend.
-- Reconstructed from the live Supabase policy catalog; no public/anon/authenticated
-- access is granted. The matching version is already recorded as applied in production.

create policy "Assistant backend manages sources"
  on public.assistant_sources for all to service_role
  using (true) with check (true);

create policy "Assistant backend manages knowledge"
  on public.assistant_knowledge for all to service_role
  using (true) with check (true);

create policy "Assistant backend manages sessions"
  on public.assistant_sessions for all to service_role
  using (true) with check (true);

create policy "Assistant backend manages messages"
  on public.assistant_messages for all to service_role
  using (true) with check (true);

create policy "Assistant backend manages leads"
  on public.assistant_leads for all to service_role
  using (true) with check (true);

create policy "Assistant backend manages feedback"
  on public.assistant_feedback for all to service_role
  using (true) with check (true);
