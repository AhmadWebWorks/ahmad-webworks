# Ahmad WebWorks

Official website and team portal for **Ahmad WebWorks**.

**Website:** https://ahmadwebworks.github.io/

## Website pages

### Public
- Home — `index.html`
- Services — `services.html`
- Portfolio — `portfolio.html`
- About — `about.html`
- Team — `team.html`
- Work With Us — `work-with-us.html`
- Contact — `contact.html`
- Join the Team — `join-team.html`
- Privacy Notice — `privacy.html`

### Account and profile pages
- Team Portal — `portal.html`
- Password Recovery — `password-recovery.html`
- Published Team Member Profile — `team-member.html?slug=<profile-slug>`

## Technology

- HTML, CSS and vanilla JavaScript
- GitHub Pages for static hosting
- Supabase Auth, Postgres, Row Level Security and Edge Functions
- Brevo for transactional application and team emails

## Supabase

Database migration files are in `supabase/migrations/`. Edge Function source and JWT configuration are in `supabase/functions/` and `supabase/config.toml`.

See [Supabase project notes](supabase/README.md) for the one-time Founder bootstrap and required project secrets.

**Never commit** Supabase service-role keys, Brevo API keys, local `.env` files or real user credentials. The repository's `.gitignore` excludes local environment files.
