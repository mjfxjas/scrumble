# Scrumble Week 1 Execution Board (Operator Plan)

Date: 2026-02-16  
Scope: Convert strategy into shippable work this week.  
Goal: Improve retention/shareability and create first sponsor-ready GTM assets.

---

## Weekly Outcome Targets (non-negotiable)

1. Ship **winner-card sharing** (manual or automated flow) live.
2. Ship **history/category archive upgrades**.
3. Publish **first weekly recap** page/post.
4. Add **analytics event tracking** and baseline dashboard.
5. Publish **partner/sponsor page + one-page rate card**.

---

## Owners

- **Owner A (You / Jon):** Product, backend, deployment, partnerships
- **Owner B (Optional collaborator):** Copy/design/social assets

If solo: you are Owner A + B and run in sequence.

---

## Sprint Backlog (Priority Ordered)

## P0 — Must ship this week

### 1) Winner-card share system
- **Owner:** A
- **Effort:** 6–10 hrs
- **Dependencies:** existing matchup + result data
- **Deliverable:**
  - share image format (1200x630)
  - per-matchup result card format
  - one-click share CTA from matchup card
- **Definition of done:**
  - user can click share and post a readable winner card
  - card includes matchup, winner, vote split, Scrumble branding

### 2) History page upgrades (filter + category archive)
- **Owner:** A
- **Effort:** 4–6 hrs
- **Dependencies:** history endpoint
- **Deliverable:**
  - filter by category/date
  - stable URLs for category views
- **Definition of done:**
  - `/history` supports category filter + useful archived browsing

### 3) Weekly recap page template
- **Owner:** B (or A)
- **Effort:** 2–4 hrs
- **Dependencies:** history data
- **Deliverable:**
  - `weekly-recap-YYYY-MM-DD` template page
  - includes top winners, closest battle, total votes
- **Definition of done:**
  - first recap published and linkable

### 4) Analytics instrumentation
- **Owner:** A
- **Effort:** 3–5 hrs
- **Dependencies:** frontend events map
- **Deliverable:**
  - event tracking for: `matchup_impression`, `vote_click`, `vote_success`, `comment_open`, `share_click`, `submit_success`
- **Definition of done:**
  - event stream visible in analytics dashboard

### 5) Sponsor/partner page + rate card
- **Owner:** B (or A)
- **Effort:** 3–5 hrs
- **Dependencies:** offer positioning
- **Deliverable:**
  - new page: Partner with Scrumble
  - one-page PDF/MD rate card
- **Definition of done:**
  - sendable link and doc for first outreach

---

## P1 — Should ship if time allows

### 6) Submit flow UX lift
- **Owner:** A
- **Effort:** 1–2 hrs
- **Deliverable:**
  - add review SLA text (e.g. "reviewed within 72h")
- **Definition of done:**
  - expectation set, lower drop-off anxiety

### 7) About page trust layer
- **Owner:** B (or A)
- **Effort:** 1–2 hrs
- **Deliverable:**
  - clearer mission + vote integrity statement
- **Definition of done:**
  - page no longer placeholder-level

---

## Day-by-Day Plan (Week 1)

## Day 1 (Mon)
- Finalize sprint scope
- Implement event tracking map
- Create winner-card design spec

**Output:** event schema + card mock finalized

## Day 2 (Tue)
- Build winner-card generator + share CTA
- QA on mobile + desktop

**Output:** share flow live

## Day 3 (Wed)
- Upgrade history page with category/date filters
- Add route patterns for category archives

**Output:** archive browsing usable and linkable

## Day 4 (Thu)
- Build weekly recap page template
- Publish first weekly recap draft

**Output:** first recap URL ready

## Day 5 (Fri)
- Build partner/sponsor page
- Produce one-page rate card
- Soft outreach to 3 local businesses/creators

**Output:** first outbound packet sent

## Day 6 (Sat)
- QA + bugfix pass
- Performance and mobile polish

**Output:** stable release

## Day 7 (Sun)
- KPI review + channel performance review
- Plan Week 2 based on actual data

**Output:** week review + updated backlog

---

## Exact Deliverables Checklist

- [ ] `share` flow with winner card
- [ ] history/category archive upgrade
- [ ] first weekly recap page published
- [ ] event analytics in place
- [ ] partner page published
- [ ] sponsor rate card finalized
- [ ] 3 outreach messages sent

---

## KPI Scorecard (end of week)

- DAU
- Votes per active user
- Share click-through rate
- Submission count
- Return visitor percentage
- Outreach responses (count)

Weekly pass criteria:
- at least 3/5 core product deliverables shipped
- at least 1 partner conversation started

---

## Risks + Mitigations

1. **Too much scope, no finish**
   - Mitigation: Ship P0 only first; lock P1 behind completion.

2. **Feature ship without distribution**
   - Mitigation: Friday outreach is mandatory deliverable.

3. **No measurable learning**
   - Mitigation: event instrumentation before growth pushes.

---

## Recommended Weekly Cadence (time blocks)

- 90 min build block (core feature)
- 60 min content/creative block
- 30 min QA/ops block
- 30 min distribution/outreach block

Total: 3.5 hours/day minimum focused execution

---

## Week 2 Preview (if Week 1 lands)

- user profile + streak layer
- first sponsor pilot campaign
- leaderboard/index pages for SEO capture
- repeatable weekly recap automation
