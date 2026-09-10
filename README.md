# Business + AI Agents Starter

This workspace contains a starter dashboard and architecture plan for a fully automated lead-generation system that:

1. Finds businesses from Google Maps that likely have no website.
2. Scans and qualifies them as potential customers.
3. Sends outreach emails and asks if they need a website.
4. Performs follow-up until the lead replies or is marked dead.
5. Tracks every agent action in a live dashboard.

## What is included

- A modern web dashboard UI in `dashboard/`
- A clear system architecture and implementation plan in `agents/agent-specs.md`

## Recommended stack

### Core flow
- Google Maps Places API / Places Details API
- Supabase (Postgres + auth + storage)
- n8n or Temporal for workflow orchestration
- OpenAI or Anthropic for AI enrichment and scoring
- Resend or SendGrid for email sending
- Redis / Upstash for queueing and retries
- Vercel or Railway for deployment

### Optional but recommended
- Sentry for error monitoring
- Langfuse or Helicone for LLM observability
- Make.com or Zapier for quick integrations

## Suggested architecture

### 1) Discovery agent
Searches Google Maps for businesses using categories such as restaurants, clinics, agencies, salons, shops, auto services, etc., and filters ones without a website or weak online presence.

### 2) Company scanner
Collects business name, category, location, phone, reviews, opening hours, social links, and website presence, then packages a company profile.

### 3) Qualification agent
Assigns a lead score using rules such as:
- category fit,
- local relevance,
- size of business,
- recent reviews,
- website absence,
- engagement signals.

### 4) Outreach agent
Sends personalized email campaigns asking if the business needs a website / redesign / online presence boost.

### 5) Follow-up agent
If there is no response after N days, it sends new emails with different angles and tracks reply status.

### 6) CRM / dashboard agent
Updates the dashboard, move leads through stages, and logs all actions.

## Data flow

Google Maps -> Company Scanner -> Lead Score -> Outreach Email -> Follow-up -> CRM Dashboard

## Recommended DB schema

### leads
- id
- company_name
- category
- address
- city
- phone
- website
- email
- score
- status
- source
- created_at
- updated_at

### events
- id
- lead_id
- agent_name
- type
- payload
- created_at

### outreach_logs
- id
- lead_id
- email_template
- sent_at
- opened_at
- replied_at
- outcome

## MVP version

If you want to get moving fast, build this first:

1. Collect businesses from Google Maps Places API
2. Save results into Supabase
3. Run a scoring script using OpenAI or rules
4. Send one outreach email using Resend
5. Store every event in Postgres
6. Show everything in the dashboard

## Production-grade version

For a fully automatic system, add:

- retries and rate limits,
- domain warming for email sending,
- unsubscribe handling,
- spam detection and bounce handling,
- webhook callbacks from email provider,
- cron jobs or Temporal workflows,
- lead routing to sales follow-up if a reply arrives.

## Quick start

1. Open `dashboard/index.html` in a browser for the UI prototype.
2. Review `agents/agent-specs.md` for the agent architecture.
3. Then wire the dashboard to Supabase / API.

## Recommended deployment

- Frontend: Vercel
- Backend/API: Railway or Fly.io
- Database: Supabase
- Email: Resend
- Worker jobs: Railway workers or Temporal

## Next steps

- Connect the dashboard to real data
- Add Google Maps API search endpoint
- Add a qualification engine
- Add outbound email templates
- Add follow-up scheduler
- Add Slack or Telegram notifications for high-value leads

## Notes

This is a practical starter, not a final production system. For full automation, you will still need:

- Google Maps API billing and quotas
- a verified email sending domain
- a proper CRM / lead database
- rate limiting and anti-spam safeguards
