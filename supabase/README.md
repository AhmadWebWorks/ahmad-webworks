# Supabase project files

This folder tracks the hosted Supabase schema migrations and Edge Function configuration.

## One-time Founder bootstrap

The hosted project was initially bootstrapped by promoting its first Auth user to the Founder role. That one-time migration contained the hosted Auth user's UUID, so it is intentionally not copied into this public repository.

For a fresh Supabase project:
1. Apply the tracked migrations in version order.
2. Create the Founder Auth user in Supabase Auth.
3. Run the following once in the SQL Editor, replacing the placeholder with that new Auth user's UUID:

```sql
update public.profiles
set role = 'admin',
    account_status = 'active'
where id = '<FOUNDER_AUTH_USER_ID>';
```

Do not commit the actual Auth user UUID or any service-role credentials.

## Edge Functions

- `submit-employee-application`: public, validated application intake; JWT verification is disabled because applicants are anonymous. Database trigger validation, a honeypot and an email cooldown protect submissions.
- `notify-application-status`: public receipt action plus admin-only status notifications and diagnostics. Privileged actions verify the signed-in user inside the function.
- `invite-team-member`: requires a signed-in Founder session at the gateway and checks Founder permissions again inside the function.

Function JWT settings are recorded in `config.toml`. Secrets must be configured in the Supabase project, never committed here.
