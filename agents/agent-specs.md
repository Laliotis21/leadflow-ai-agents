# Agent Specifications

## Overview

This file describes a concrete multi-agent system for lead discovery, qualification, outreach, and follow-up.

## Agent 1 — Discovery Agent

### Purpose
Find businesses in specific regions that appear to be missing a website or have weak online presence.

### Inputs
- target city
- target categories
- radius in km
- business type filters

### Outputs
- list of candidate businesses
- normalized fields
- source metadata

### Example logic
- query Google Maps Places API
- fetch `name`, `formatted_address`, `types`, `rating`, `user_ratings_total`, `website`, `phone_number`, `opening_hours`
- evaluate whether `website` is missing, blank, or suspiciously weak
- exclude already known businesses

### Suggested run frequency
- every 24 hours for each target city

---

## Agent 2 — Business Scanner

### Purpose
Turn raw Google Maps data into a structured company profile.

### Tasks
- standardize addresses
- detect business category
- enrich with social links if available
- estimate company size from review count / footprint
- detect likely intent to buy website services

### Output schema
```json
{
  "company_name": "The Bloom Studio",
  "category": "salon",
  "city": "Athens",
  "address": "Kolonaki 32",
  "phone": "+30 210 1234567",
  "website": null,
  "social_links": ["instagram.com/..."],
  "score": 0.87,
  "status": "new"
}
```

---

## Agent 3 — Qualification Agent

### Purpose
Decide whether the business is a likely customer.

### Signals
- no website
- category matches your service
- local area is in target market
- recent reviews are positive
- business seems active and stable
- social media exists but website is absent

### Example rule scoring
- 0.30 no website
- 0.20 category match
- 0.15 review quality
- 0.15 local relevance
- 0.10 engagement signals
- 0.10 business activity

### Output
- `lead_score`
- `qualified: true/false`
- `reasons`

---

## Agent 4 — Outreach Agent

### Purpose
Send personalized emails with a direct CTA.

### Templates

#### Cold email template
Subject: Quick question for [Business Name]

Hi [Owner Name],

I noticed [Business Name] looks active locally, but I couldn't find a website or a strong online presence.

I help businesses like yours get a clean website, better local discovery, and stronger conversion from Google Maps / search.

Would you be open to a quick 10-minute chat to see if a simple website could help your business?

Best,
[Your Name]

### Behavior
- personalize company name and category
- limit to one CTA
- send only to qualified leads
- respect unsubscribe / opt-out

---

## Agent 5 — Follow-up Agent

### Purpose
Keep leads warm even when they do not reply immediately.

### Logic
- if no response after 3 days: send follow-up 1
- after 7 days: follow-up 2
- after 14 days: follow-up 3
- if still no reply: mark as `nurture` or `dead`

### Follow-up variations
- value-focused angle
- social proof angle
- urgency angle
- simple calendar CTA

---

## Agent 6 — Reply Handler Agent

### Purpose
Handle inbound replies and route them appropriately.

### Tasks
- detect positive, neutral, or negative reply
- extract next action
- update lead stage
- trigger sales handoff if there is interest

### Example outcomes
- `interested` => move to sales queue
- `not now` => add to nurture schedule
- `not interested` => mark `dead`

---

## Agent 7 — Dashboard / CRM Agent

### Purpose
Keep the system observable.

### Responsibilities
- aggregate metrics
- show agent health
- show response rates
- show stage distribution
- show failures / retries

---

## System workflow

1. Discovery Agent queries Google Maps.
2. Business Scanner enriches and normalizes data.
3. Qualification Agent scores each business.
4. Outreach Agent sends email only to qualified leads.
5. Follow-up Agent sends reminders.
6. Reply Handler updates stages.
7. Dashboard Agent displays live status.

---

## Technical implementation suggestions

### Orchestration
Use either:
- n8n for easier visual workflows, or
- Temporal for stronger reliability and retry logic

### Messaging / queue
Use Redis or Upstash for queueing outbound jobs and retries.

### Database
Use Supabase Postgres for:
- leads
- events
- outreach logs
- templates
- campaigns

### AI use cases
- classify whether a business is likely to need website services
- generate tailored email copy
- summarize replies
- detect sentiment

### Email providers
- Resend for developer-friendly sending
- SendGrid for scale

---

## KPI targets

For a healthy funnel, aim for:
- discovery coverage: 500-2000 businesses/day
- qualification rate: 15-30%
- positive reply rate: 5-15%
- booked calls: 1-5% depending on market

---

## Risks to manage

- Google Maps rate limits
- email deliverability issues
- spam / bounce penalties
- false positives in qualification
- duplicates across searches

## Recommended safeguards

- use a verified domain
- throttle outbound volumes
- deduplicate businesses by normalized name + address
- run A/B tests on email subject lines
- monitor spam complaints and bounce rates

---

## Best next implementation order

1. Build the dashboard UI
2. Add leads table and events log
3. Add Google Maps ingestion endpoint
4. Add qualification scoring
5. Add email sending
6. Add follow-up scheduler
7. Add reply handling
8. Add live monitoring and alerting
