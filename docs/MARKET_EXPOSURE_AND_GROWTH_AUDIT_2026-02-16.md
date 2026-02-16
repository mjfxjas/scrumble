# Scrumble Audit: Product + Marketing Exposure Plan

Date: 2026-02-16  
Site reviewed: https://scrumble.cc  
Repo reviewed: `/Users/jon/projects/scrumble`

---

## 1) Executive Summary

Scrumble already has a strong core loop:
- local identity
- low-friction voting
- social-friendly matchup format

Right now it looks like a polished prototype with real potential, but it is missing the pieces that turn interest into growth:
- clear user identity/login (for retention, trust, anti-abuse)
- distribution engine (creator/community loops)
- outcome pages that can rank in search and be shared as "proof"
- business-facing package (sponsor + featured matchup + city insights)

### Strong opinion
If you want this to become a real local media product, focus first on:
1. **Retention mechanics** (daily habit + streak + profile)
2. **Share mechanics** (winner cards + weekly recap links)
3. **Local distribution partnerships** (newsletters, creators, venue co-promos)

Do **not** overbuild backend complexity before those three are working.

---

## 2) Current State (What’s Good)

## Product strengths
- Clear concept: "2 things, vote on 1"
- Fast interaction, no heavy onboarding
- Good visual identity and local flavor copy
- Multi-matchup feed with comments and share hooks
- Submission flow exists (UGC intake)
- History page exists (social proof archive)

## Technical strengths
- AWS-first architecture is practical/cost-effective for this type of app
- S3 + CloudFront + Lambda + DynamoDB setup is lean
- Admin controls exist and appear useful for curation velocity
- Deployment automation (`autodeploy.sh`) is in place

## Brand strengths
- Chattanooga-local language and identity are strong
- Domain and visual style are distinct and memorable

---

## 3) Gaps Blocking Growth (Highest Priority)

## A) Retention gap
Current loop is mostly session-level. There’s no strong reason to come back daily except novelty.

### What to add
- Daily streak tracker
- "You voted with X% of Chattanooga" reinforcement
- Weekly recap email/notification (top winners + close battles)

## B) Shareability gap
There is a share link, but not enough social payload around it.

### What to add
- Auto-generated matchup result cards (OG image endpoint)
- "I voted ___" quick-share button with prefilled copy
- Weekly “Top 5 wins” share page

## C) Search surface gap
Main page SEO is decent, but long-tail discoverability is weak without dedicated index pages.

### What to add
- Topic hubs: `/best-tacos-chattanooga`, `/best-coffee-chattanooga`, `/northshore-vs-southside`
- City trend pages with archived matchups and winners
- Internal linking from home + history to ranking pages

## D) Trust + data quality gap
No visible anti-abuse transparency or strong identity model for votes.

### What to add
- Basic account options (Google/email magic link) later
- "How votes are protected" explainer page
- Device-only anti-abuse is okay for MVP, but needs next-step controls

---

## 4) Product Improvements (Impact x Effort)

## High impact / low-medium effort (do first)
1. **Winner card generator**
   - Output: shareable image + permalink
   - Why: turns each matchup into content distribution

2. **Weekly recap page + newsletter**
   - "This week Chattanooga picked..."
   - Why: retention + social proof

3. **Category leaderboards**
   - Food, coffee, nightlife, neighborhoods
   - Why: makes data useful and linkable

4. **Submission incentives**
   - "Your matchup went live" notification
   - Why: UGC loop + return visits

5. **CTA cleanup**
   - One dominant primary CTA per screen (Vote / Submit)
   - Why: better conversion clarity

## Medium effort / high impact (next)
1. **User profiles + streaks**
2. **Creator mode** (local influencers can host matchup sets)
3. **Business pages** ("wins, appearances, trends")
4. **Sponsor inventory manager**

## Overkill right now
- Native mobile app
- Heavy ML recommendation stack
- Complex moderation tooling before traffic justifies it

---

## 5) Marketing / Exposure Plan (How to Grow)

## Positioning
Scrumble should be framed as:
> "Chattanooga’s daily local vote + bragboard"

Not Yelp replacement. Not reviews. It’s local pulse + fun competition.

## Distribution channels to prioritize

### 1) Local social + community loops
- Reddit (r/Chattanooga): weekly "results + next faceoff"
- Facebook local groups: one smart post/week, not spam
- IG/TikTok: short clips of close matchups and upsets

### 2) Local media partnerships
- Nooga Today / local newsletters / radio morning hosts
- Weekly "Scrumble Pick" embedded widget

### 3) Business amplification loop
- Give winners a "Winner badge" embed/share asset
- Offer losers rematch week (sponsor-able)

### 4) Street-level growth
- QR posters in partner coffee shops/bars
- Event mode at local festivals (live vote screens)

---

## 6) Monetization Plan (Realistic)

## Phase 1 (small revenue, fast)
- Sponsored matchup slot: $50–$200 each
- Weekly category sponsor: $250–$500

## Phase 2 (repeatable local media package)
- "Featured business week" bundle:
  - featured matchup
  - social mention
  - winner card assets
  - simple insights report

## Phase 3 (data product)
- Local trend reports by category (monthly)
- "What Chattanooga prefers" sponsor decks

### Important
Do not monetize too hard before trust + traffic baseline.  
Get repeat users first, then sell inventory.

---

## 7) 30 / 60 / 90 Day Execution Plan

## Days 0–30 (Ship growth primitives)
- Build and ship winner-card share endpoint
- Add weekly recap page and publish every Friday
- Create 3 category leaderboard pages
- Launch 1 local creator and 3 local business pilot partners

## Days 31–60 (Compound distribution)
- Add "submitted by" attribution and notifications
- Stand up basic email capture + recap list
- Run first sponsor pilot package (2–3 paying slots)
- Publish first "State of Chattanooga Picks" blog/report

## Days 61–90 (Convert attention to business)
- Formalize sponsor kit + rate card
- Launch business profile pages (wins, stats, matchups)
- Add stronger anti-abuse/identity layer
- Expand from Chattanooga core to adjacent area tests

---

## 8) Site/Repo-Specific Recommendations

## Immediate website improvements
1. **Make About page more specific**
   - Include mission, methodology, and trust statement.
2. **Upgrade History page into shareable archives**
   - Filters by category/date + permalinkable results.
3. **Improve submit flow confirmation**
   - Add expectation: "review in X days".
4. **Add creator + business CTA blocks**
   - "Partner with Scrumble" page.

## Code/product improvements from current implementation
1. Add analytics events in `main.js`:
   - impression, vote_click, vote_success, comment_open, share_click, submit_success
2. Add server-side rate-limiting strategy for vote endpoint.
3. Add OG image generation endpoint for matchup/result sharing.
4. Add static pre-rendered category pages using history data.
5. Add canonical links and richer metadata on all subpages (`submit`, `history`, `about`, `jobs`).

---

## 9) KPI Dashboard You Should Track Weekly

- DAU / WAU
- Votes per active user
- Matchup completion rate
- Share click-through rate
- Submission-to-publish rate
- Returning users (D1, D7, D30)
- Sponsor revenue per 1k visits

---

## 10) Practical Go-To-Market Offer You Can Pitch

### "Scrumble Local Pulse Package"
- 1 sponsored matchup/week
- 1 winner card + social mention
- monthly performance snapshot
- optional rematch event

This gives you an immediate monetization story while still building product traction.

---

## 11) Next 10 Actions (No-Fluff Checklist)

1. Ship winner-card share image flow
2. Turn history into filterable category archives
3. Publish first weekly recap page
4. Add analytics event tracking map
5. Add partner/business page on site
6. Create one-page sponsor rate card
7. Run 1 Reddit + 1 FB + 1 IG weekly cadence
8. Recruit 3 local partners for pilot
9. Capture emails for weekly roundup
10. Review metrics every Sunday and cut low-yield channels

---

## Final Take

Scrumble can win as a **local media + engagement product** if you keep it:
- local-first
- fast to interact with
- highly shareable
- operationally simple

The opportunity is not just voting; it’s building a recurring local attention channel that businesses will eventually pay to be part of.
