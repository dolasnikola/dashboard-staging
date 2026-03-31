# Performance Marketing Dashboard

## Overview
Multi-tenant performance marketing dashboard for a digital agency (Media House).
Serves multiple clients (NLB Komercijalna banka, Urban Garden, Krka Terme). Serbian language UI.
Data stored in Supabase (PostgreSQL) with role-based access control.
**FAZA 1–4 complete** (deployed March 2026). FAZA 5 planning in `plan.md`.

## Architecture (React + Vite + Tailwind)
Built with React 19, Vite 8, Tailwind CSS v4, Zustand for state management, react-chartjs-2 for charts.

### Entry Points
- `index.html` → `src/main.jsx` → `src/App.jsx` (auth gate + React Router)

### Routing (React Router v6)
- `/` → `HomePage` (client cards grid)
- `/:clientId` → `ClientDetail` (platform tabs, metrics, charts)
- `/admin` → `AdminPanel` (user management, client config, reports)

### Data Layer (`src/lib/`)
- `supabase.js` — Supabase client init, exports `sb`
- `cache.js` — In-memory `_cache` object + synchronous read functions. Cache TTL 5min, LRU max 5 clients.
- `db.js` — Async Supabase queries: fetchClients, prefetchClientData, fetchHomepageSummary (RPC), fetchAlerts, dbSaveCampaignData (deduplication), admin functions
- `pacing.js` — Budget pacing calculations: `calcPacing()`, `calcClientPacing()`, flight-days aware
- `data.js` — Constants (PLATFORM_NAMES, PLATFORM_BADGE, METRIC_LABELS), formatting (fmt), CSV parsing
- `utils.js` — Date range helpers, filtering, aggregation, MoM comparison
- `sync.js` — Legacy Google Sheets sync (manual only via SheetsModal)

### State Management (`src/stores/`)
- `authStore.js` — Zustand: currentUser, currentUserRole, login/logout/checkSession
- `appStore.js` — Zustand: clients, activeDateRange, notification + initDashboard()

**Key design:** Campaign data cache (`_cache`) lives outside Zustand/React state — thousands of rows in React state = re-render hell. Components read cache synchronously. Zustand holds only metadata and UI state.

**Homepage aggregation:** `_cache.homepageSummary` holds pre-aggregated metrics per client/platform/month (from RPC `get_homepage_summary`). Raw rows loaded only when user opens a specific client.

### Components (`src/components/`)
```
auth/LoginGate.jsx          — Email/password login form
layout/Header.jsx           — Sticky header, AlertBell, role-based buttons
home/HomePage.jsx           — Client cards grid with loading state
home/ClientCard.jsx         — Card with metrics, budget bar, pacing badge
home/LastSyncStatus.jsx     — Async last sync time from sync_log
client/ClientDetail.jsx     — Route container, prefetchClientData on mount
client/DateRangeBar.jsx     — Preset buttons + custom date inputs
client/BudgetOverview.jsx   — Per-platform budget cards with pacing indicators
client/PlatformTabs.jsx     — Overview + platform tab bar
client/OverviewTab.jsx      — Aggregate metrics + Doughnut + Bar charts
client/PlatformView.jsx     — Metrics cards, sparklines, MoM, campaign table
client/MetricCard.jsx       — Formatted value + MoM change + sparkline
client/CampaignTable.jsx    — Sortable data table
client/LocalDisplayView.jsx — Local Display tab (Gemius data)
client/GA4View.jsx          — Month selector + KPI table
client/ProductsSection.jsx  — NLB product breakdown cards + line chart
admin/AdminPanel.jsx        — Tabs: Korisnici, Klijenti, Izvestaji
admin/ClientForm.jsx        — Client create/edit form
admin/ReportBuilder.jsx     — Report config CRUD per client
modals/ImportModal.jsx      — CSV drag-and-drop import
modals/BudgetModal.jsx      — Monthly budget inputs per client/platform
modals/SheetsModal.jsx      — Sheet URLs + manual sync
ui/AlertBell.jsx            — Notification bell with unread count + dropdown
ui/Notification.jsx         — Toast notification from appStore
```

### Reports (`src/reports/`)
- `generator.js` — Generic report engine: config-driven PDF with AI narratives via Cloudflare Worker
- `pdf-utils.js` — Shared PDF utilities, jspdf-autotable, creative image cache

### Cloudflare Worker (`worker/`)
- `worker/src/index.js` — AI narrative generator using Claude API (claude-sonnet-4). Deploy: `cd worker && npx wrangler deploy`

### Supabase Edge Functions (`supabase/functions/`)
- `sync-meta/` — Meta Marketing API → Supabase (pg_cron 3x daily)
- `sync-gemius/` — Gemius gDE API → Supabase (pg_cron 3x daily)
- `check-alerts/` — Budget pacing + anomaly detection + sync failure alerts (pg_cron daily at 10:00 Belgrade)
- `sync-sheets/` — Legacy Google Sheets sync (disabled, code kept)

### Apps Scripts (`scripts/`)
- `googleAds-to-supabase.js` — Google Ads → Supabase (daily, lookback 3 days)
- `dv360-to-supabase.js` — DV360 Gmail CSV → Supabase (daily, Krka filter)
- `nlb-ga4-to-supabase.js` — GA4 Data API → Supabase (monthly)
- `gemius-to-supabase.js` — Gemius email XLSX → Supabase (fallback for sync-gemius)

## Data Flow (Direct Pipeline)
```
Meta:        pg_cron → Edge Function "sync-meta" → Meta Marketing API → Supabase
Google Ads:  Google Ads Scripts → Apps Script → Supabase REST API (daily + lookback)
DV360:       Gmail CSV → Apps Script → Supabase REST API (daily)
GA4:         GA4 Data API → Apps Script → Supabase REST API (monthly)
Gemius:      pg_cron → Edge Function "sync-gemius" → gDE API → Supabase
Alerts:      pg_cron → Edge Function "check-alerts" → anomaly detection + pacing → alerts table
```
Google Sheets eliminated from daily pipeline. Monthly Krka report scripts still use Sheets.

**On login flow:**
1. `checkSession()` → `authStore.loadProfile()` → `appStore.initDashboard()`
2. `fetchClients()` + `fetchHomepageSummary(month)` + `fetchAlerts()` in parallel
3. Homepage renders client cards from cache

## Auth & Roles
- **Supabase Auth** with email/password
- **Roles:** admin (all access), account_manager (assigned clients), viewer (read-only)
- **RLS** on all tables via `get_user_role()` and `has_client_access()` SQL functions
- New users default to `viewer` role via database trigger

## Database Tables
| Table | Purpose |
|-------|---------|
| `clients` | Client config (name, platforms, currency) |
| `campaign_data` | All ad platform metrics (daily rows per campaign) |
| `budgets` | Monthly budgets per client/platform |
| `flight_days` | Active campaign days per client/month |
| `ga4_kpi_data` | GA4 KPI data per product/month |
| `user_profiles` | Extends Supabase Auth with role + full_name |
| `user_client_access` | Maps users → clients for role-based access |
| `sheet_links` | Google Sheets CSV URLs per client/platform |
| `local_display_dashboard` | Daily Local Display metrics from Gemius gDE API |
| `local_display_report` | Monthly aggregated Local Display data |
| `report_configs` | Per-client report configuration (platform_labels, sheet_urls, AI config) |
| `report_history` | Generated report log |
| `meta_config` | Maps clients → Meta ad account IDs |
| `gemius_config` | Maps clients → gDE API campaign IDs |
| `alerts` | Budget pacing, metric anomaly, and sync failure alerts |
| `alert_configs` | Per-client alert thresholds and enable/disable settings |

## Adding a New Client
1. Admin > Klijenti > + Novi klijent — fill form (ID, name, currency, platforms)
2. Admin > Korisnici — assign user access
3. For PDF reports: Admin > Izvestaji > configure report
4. Place creative images in `public/creatives/<client>/`
5. No code changes or deploys needed

## Build & Deployment
- **Dev:** `npm run dev` (Vite, port 5173)
- **Build:** `npm run build` → `dist/`
- **Frontend:** Vercel — auto-deploys from `main` branch
- **Supabase:** vorffefuboftlcwteucu.supabase.co
- **Worker:** `cd worker && npx wrangler deploy`
- **Edge Functions:** `supabase functions deploy <name> --no-verify-jwt` or via Supabase MCP

## Gotchas
- **Supabase client is `sb`, NOT `supabase`** — historical naming
- Cache lives outside React/Zustand state — don't put campaign rows in stores
- Supabase anon key is public — RLS policies are the security boundary
- Supabase default query limit is 1000 rows — `db.js` uses pagination loops
- `dbSaveCampaignData()`, `dbSetBudget()`, `dbSetFlightDays()` are async — must be awaited
- `getMoMChange()` returns object (not HTML) for React rendering
- **jspdf-autotable** requires explicit `applyPlugin(jsPDF)` — side-effect import alone does NOT work
- **Report AI Worker CORS** — only allows Vercel production URL. Falls back to local text on localhost.
- **Supabase CLI on Windows:** `npx supabase` conflicts with `supabase.js`. Use `supabase` directly or Supabase MCP.
- **DV360 has insertion_order field** — UNIQUE constraints must account for it
- **Always SELECT before DELETE/UPDATE** on production data

## Scaling Roadmap
- **FAZA 1 (DONE):** Supabase replaces localStorage. Deployed on Vercel.
- **FAZA 2 (DONE):** Automated data sync via Edge Function. Deployed 2026-03-21.
- **FAZA 3 (DONE):** React + Vite + Tailwind frontend. Deployed 2026-03-21.
- **FAZA 4A (DONE):** Client onboarding via Admin UI. Deployed 2026-03-24.
- **FAZA 4B (DONE):** Generic report engine + AI narrative worker. Deployed 2026-03-24.
- **FAZA 4C (DONE):** Scaling for 50+ clients — DB indexes, server-side aggregation, React memoization, cache TTL + LRU. Deployed 2026-03-25.
- **FAZA 4D (DONE):** AI insights & alerts — budget pacing, anomaly detection, notification bell, check-alerts Edge Function. Deployed 2026-03-31.
- **FAZA 4E (DONE):** Local Display — Gemius gDE API direct integration. Deployed 2026-03-27.
- **FAZA 4F (DONE):** Direct data pipeline — Google Sheets eliminated. Meta/Gemius via Edge Functions, Google Ads/DV360/GA4 via Apps Scripts to Supabase. Deployed 2026-03-28.
- **FAZA 5:** See `plan.md` — White-label, automated reports, cross-platform analytics, real-time, TikTok/LinkedIn APIs, DevOps.

## FAZA 4D: AI Insights & Alerts (Deployed 2026-03-31)

### Budget Pacing
- `src/lib/pacing.js` — `calcPacing()` per-platform, `calcClientPacing()` aggregate. Flight-days aware.
- Thresholds: >115% overspending (red), <85% underspending (orange), else on_track (green)
- Shows only for `this_month` date range
- `fetchHomepageSummary()` loads `flight_days` for pacing on homepage

### Anomaly Detection
- `detect_metric_anomalies(client, platform, lookback_days, baseline_days)` SQL RPC
- Compares 7-day recent avg vs 30-day baseline for CPC, CTR, Spend, CPM
- Default threshold: 30% deviation (configurable via `alert_configs`)

### Alerts System
- `alerts` table: budget_pacing, metric_anomaly, sync_failure types. 7-day expiry, read/dismissed state.
- `alert_configs` table: per-client thresholds
- `AlertBell.jsx` in Header: unread count badge, dropdown with dismiss/mark-read
- `check-alerts` Edge Function: daily at 10:00 Belgrade, deduplicates within 24h
- Manual trigger: `POST /functions/v1/check-alerts {"trigger":"manual"}`

## FAZA 4E: Local Display (Deployed 2026-03-27)

### Architecture
```
pg_cron → Edge Function "sync-gemius" → gDE API (gdeapi.gemius.com) → Supabase
```

### gDE API Key Details
- Auth: Session-based POST (`OpenSession.php`), all other endpoints GET
- Response: XML. Date format: `YYYYMMDD`
- Stats: `dimensionIDs=20` (Placement), `indicatorIDs=4,2,120,1`, `timeDivision=Day`
- CTR returned as decimal, stored as percent (×100)
- Secrets: `GEMIUS_USERNAME`, `GEMIUS_PASSWORD`
- Backfill: `POST {"trigger":"manual","client_id":"nlb","date_from":"20260101","date_to":"20260327"}`

### Two-Table Design
- `local_display_dashboard` — Daily placement-level data (gDE API). Upsert via `upsert_local_display_daily` RPC.
- `local_display_report` — Monthly aggregated (auto-rollup via `rollup_local_display_monthly` RPC)
- Apps Script fallback (`gemius-to-supabase.js`) kept for monthly email pipeline

## FAZA 4F: Direct Data Pipeline (Deployed 2026-03-28)

### Meta Edge Function (`sync-meta/`)
- API: `graph.facebook.com/v25.0/{account_id}/insights`, level=campaign, time_increment=1
- Conversions extracted from `actions` array (lead, purchase, messaging)
- Secret: `META_ACCESS_TOKEN` (long-lived, ~60 days). Token expiry warning in sync_log.
- RPC: `upsert_campaign_data_by_dates` — date-range scoped DELETE+INSERT

### Apps Scripts → Supabase Direct
- All scripts: DELETE by filters + INSERT in batches of 500, `service_role` key in Script Properties
- Google Ads lookback: last 3 days for conversion lag
- DV360: exclude Farma/Pharm/Septolete, include only "krka terme"
- Monthly Krka report scripts still write to Sheets (migration planned for FAZA 5)
