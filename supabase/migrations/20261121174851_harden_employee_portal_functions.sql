-- Keep trigger-only function out of the callable Data API surface.
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- Public portfolio policies invoke this helper internally.
grant usage on schema private to anon, authenticated;
