# Performance Marketing Dashboard

## Overview
Multi-tenant performance marketing dashboard for a digital agency (Media House).
Serves multiple clients (NLB Komercijalna banka, Urban Garden, Krka Terme). Serbian language UI.
Data stored in Supabase (PostgreSQL) with role-based access control.
FAZA 1, FAZA 2, and FAZA 3 complete. 4-phase scaling plan (approved March 2026).

## Architecture (FAZA 3: React + Vite + Tailwind)
Built with React 19, Vite 8, Tailwind CSS v4, Zustand for state management, react-chartjs-2 for charts.

### Entry Points
- `index.html` — Vite entry point with `<div id="root">` and Google Fonts
- `src/main.jsx` — React entry, registers Chart.js components, renders `<App />` in `<BrowserRouter>`
- `src/App.jsx` — Auth gate, React Router routes, modal state, notification

### Routing (React Router v6)
- `/` → `HomePage` (client cards grid)
- `/:clientId` → `ClientDetail` (platform tabs, metrics, charts)
- `/admin` → `AdminPanel` (user management)
- Auth gate: unauthenticated → `<LoginGate />`

### Data Layer (`src/lib/`)
- `supabase.js` — Supabase client init, exports `sb`
- `cache.js` — In-memory `_cache` object + synchronous read functions (dbGetCampaignData, dbGetBudget, dbGetFlightDays, dbGetGA4Data, dbGetAllCampaignDataForPlatform, getHomepageSummary, getSheetLinks, clearCache)
- `db.js` — Async Supabase queries: fetchClients (with preferredOrder), prefetchClientData (per-client guard), fetchHomepageSummary (server-side aggregation via RPC), dbSaveCampaignData (deduplication), admin functions, dbGetLastSync, runDiagnostics (exposed to window)
- `data.js` — Constants (PLATFORM_NAMES, PLATFORM_BADGE, METRIC_LABELS, NLB_PRODUCTS), formatting (fmt, fmtMetric), CSV parsing (parseCSV, detectPlatform, mapRow)
- `utils.js` — Date range helpers (getDateRangeBounds, getMonthsInRange), filtering (getFilteredData), aggregation (aggregateByCampaign, groupByProduct), MoM comparison (getMoMChange returns object, not HTML), getDailyTotals
- `sync.js` — Google Sheets sync (syncOneSheet, syncAllSheets with _syncInProgress guard, syncGA4Sheet), uses callbacks for status updates

### State Management (`src/stores/`)
- `authStore.js` — Zustand: currentUser, currentUserRole, isAuthenticated, isLoading + login(), logout(), checkSession(), setupAuthListener()
- `appStore.js` — Zustand: clients, activeDateRange, customDateFrom/To, notification + initDashboard(), setDateRange(), notify(), refreshClients()

**Key design decision:** Campaign data cache (`_cache`) lives outside Zustand/React state. Thousands of rows in React state = re-render hell. Components read cache via `src/lib/cache.js` functions. Zustand holds only metadata and UI state.

**Homepage uses server-side aggregation (FAZA 4C):** `_cache.homepageSummary` holds pre-aggregated metrics per client/platform/month (from RPC `get_homepage_summary`). ClientCard reads summary, not raw campaign rows. Raw rows are only loaded when user opens a specific client via `prefetchClientData()`.

**Cache TTL + LRU (FAZA 4C):** Client campaign data expires after 5 minutes (`CACHE_TTL_MS`). Max 5 clients cached simultaneously (`MAX_CACHED_CLIENTS`). LRU eviction removes oldest client when limit exceeded. Functions: `isClientCacheValid()`, `touchClient()`, `clearClientCache()` in `cache.js`.

### Components (`src/components/`)
```
auth/LoginGate.jsx          — Email/password login form
layout/Header.jsx           — Sticky header, role-based button visibility
home/HomePage.jsx           — Client cards grid with loading state
home/ClientCard.jsx         — Card with metrics, budget bar, staggered animation
home/LastSyncStatus.jsx     — Async last sync time from sync_log
client/ClientDetail.jsx     — Route container, prefetchClientData on mount
client/DateRangeBar.jsx     — Preset buttons + custom date inputs
client/BudgetOverview.jsx   — Per-platform budget cards with spend bars
client/PlatformTabs.jsx     — Overview + platform tab bar
client/OverviewTab.jsx      — Aggregate metrics + Doughnut + Bar charts
client/PlatformView.jsx     — Metrics cards, sparklines, MoM, campaign table
client/MetricCard.jsx       — Formatted value + MoM change + sparkline
client/CampaignTable.jsx    — Sortable data table
client/GA4View.jsx          — Month selector + KPI table
client/ProductsSection.jsx  — NLB product breakdown cards + line chart
admin/AdminPanel.jsx        — Tabs: Korisnici, Klijenti, Izvestaji
admin/ClientForm.jsx        — Client create/edit form (FAZA 4A)
admin/ReportBuilder.jsx     — Report config CRUD per client (FAZA 4B)
modals/ImportModal.jsx      — CSV drag-and-drop import
modals/BudgetModal.jsx      — Monthly budget inputs per client/platform
modals/SheetsModal.jsx      — Sheet URLs + sync buttons
ui/Notification.jsx         — Toast notification from appStore
```

### Reports (`src/reports/`)
- `generator.js` — Generic report engine (FAZA 4B). Reads config from `report_configs` table, fetches CSV data from configured sheet URLs, generates multi-page PDF with AI narratives via generic Cloudflare Worker. Entry point: `generateReport(clientId)`. Also exports `fetchReportConfig(clientId)`.
- `pdf-utils.js` — Shared PDF utilities: ASCII transliteration, number/currency formatting, CSV parsing, platform data parsers (Search/Meta/GDN), PDF drawing helpers (background, text, tables), creative image cache. Uses `jspdf-autotable` via `applyPlugin(jsPDF)`.
- `krka.js` — Thin wrapper for backward compatibility. Calls `generateReport('krka')` from generator.js.

### Static Assets
- `public/creatives/<client>/` — Ad creative images organized by client and platform

### Cloudflare Worker (`worker/`)
- `worker/src/index.js` — Generic AI narrative generator for monthly reports. Receives campaign data + `clientName` + `promptContext`, returns per-platform narratives in JSON. Uses Claude API (claude-sonnet-4). Strict platform isolation in prompts. Deploy: `cd worker && npx wrangler deploy`
- `worker/wrangler.toml` — Worker config. Secret: `ANTHROPIC_API_KEY` (set via `npx wrangler secret put`)

### Supabase (`supabase/`)
- `supabase/functions/sync-sheets/` — FAZA 2 Edge Function for automated data sync
- `supabase/migrations/` — SQL migrations for sync_log table, RPC functions, pg_cron setup, report engine tables

## Data Flow
```
Google Sheets (CSV published) → fetchSheetCSV() → parseCSV() → detectPlatform() → mapRow()
  → dbSaveCampaignData() → [deduplicate → cache update + Supabase DELETE/INSERT]
  → React components re-read from cache
```
- On login: `checkSession()` → `authStore.loadProfile()` → `appStore.initDashboard()`:
  - `fetchClients()` from Supabase → populate `clients` in store
  - `fetchHomepageSummary(month)` calls RPC `get_homepage_summary` for aggregated metrics + loads budgets into `_cache`
  - `dbGetSheetLinks()` loads sheet URLs into cache
  - React Router renders `HomePage` with client cards from cache
- On client open: React Router renders `ClientDetail` → `prefetchClientData(id)` → components read from cache
- `syncAllSheets()` has `_syncInProgress` guard

## Auth & Roles
- **Supabase Auth** with email/password
- **Roles:** admin (all access), account_manager (assigned clients), viewer (read-only)
- **Row-Level Security (RLS)** on all 8 tables
- User profiles auto-created via `handle_new_user()` database trigger on signup
- Role stored in `user_profiles.role`, checked via `get_user_role()` SQL function
- Client access controlled via `user_client_access` table + `has_client_access()` SQL function
- Viewer role hides Import CSV, Budget, and Sheets Sync buttons (via `currentUserRole` from authStore)

## Admin Panel
- Route: `/admin`, guarded by `currentUserRole === 'admin'`
- User table with role dropdown + client access tags
- Functions: `dbGetAllUsers()`, `dbGetAllClientAccess()`, `dbUpdateUserRole()`, `dbSetClientAccess()` in `src/lib/db.js`

## Database Tables
| Table | Purpose |
|-------|---------|
| `clients` | Client config (name, platforms, setup, currency) |
| `campaign_data` | All ad platform metrics (daily rows per campaign) |
| `budgets` | Monthly budgets per client/platform |
| `flight_days` | Active campaign days per client/month |
| `ga4_kpi_data` | GA4 KPI data (leads, sessions, users per product/month) |
| `user_profiles` | Extends Supabase Auth with role + full_name |
| `user_client_access` | Maps users → clients for account_manager/viewer roles |
| `sheet_links` | Google Sheets CSV URLs per client/platform |
| `local_display_report` | Gemius Local Display metrics per placement/month |
| `report_configs` | Per-client report configuration (FAZA 4B): platform_labels, metric_cols, sheet_urls, creatives_config, ai_worker_url, ai_prompt_context, gdn_campaign_filter, schedule |
| `report_history` | Generated report log: client_id, report_month, pdf_url, status |
| `gemius_config` | Maps dashboard clients to gDE API campaign IDs for automated sync |
| `local_display_dashboard` | Daily Local Display metrics from Gemius gDE API, per placement |

## Supabase Setup
- **Project:** Media House (vorffefuboftlcwteucu.supabase.co)
- **Anon key** in `src/lib/supabase.js` (public, starts with `sb_publishable_`)
- **Never use service_role key** in frontend code
- First admin user must be created in Supabase Auth dashboard, then role set via SQL:
  ```sql
  INSERT INTO user_profiles (id, email, full_name, role)
  SELECT id, email, 'Name', 'admin' FROM auth.users WHERE email = 'your@email.com';
  ```

## Adding a New Client (FAZA 4A — via Admin UI)
1. Admin > Klijenti > + Novi klijent — fill form (ID, name, currency, platforms, sheet URLs)
2. Admin > Korisnici — assign user access
3. For PDF reports: Admin > Izvestaji > + Novi report config — fill sheet URLs, platform labels, AI worker URL, creative paths
4. Place creative images in `public/creatives/<client>/`
5. No code changes or deploys needed — client appears automatically (alphabetical order)

## Build & Deployment
- **Dev server:** `npm run dev` (Vite, port 5173)
- **Build:** `npm run build` → outputs to `dist/`
- **Preview production build:** `npm run preview`
- **Frontend:** Vercel — https://dashboard-seven-sigma-90.vercel.app/
- **GitHub repo:** github.com/dolasnikola/dashboard-staging (private)
- **Supabase:** vorffefuboftlcwteucu.supabase.co
- **Cloudflare Worker:** `report-narratives-api` — generic AI narrative generator for all clients. Source in `worker/src/index.js`. Deploy: `cd worker && npx wrangler deploy`
- **Auto-deploy:** Push to `main` branch → Vercel auto-deploys from `dist/`
- `vercel.json` configured with build command, output directory, and SPA rewrite rule

## Dependencies (package.json)
- react, react-dom, react-router-dom, @supabase/supabase-js, chart.js, react-chartjs-2, zustand, jspdf, jspdf-autotable, @tanstack/react-virtual
- Dev: vite, @vitejs/plugin-react, tailwindcss, @tailwindcss/vite

## FAZA 2: Automated Data Sync (DONE)
Edge Function `sync-sheets` replaces manual Google Sheets sync.

**Architecture:**
```
pg_cron (3 UTC slots: 5:00, 6:00, 7:00) → pg_net HTTP POST → Edge Function
  → checks Belgrade timezone (runs only at 8:00 or 9:00 local time)
  → reads sheet_links from DB → fetches CSV from Google Sheets
  → parseCSV → detectPlatform → mapRow → deduplicate
  → atomic upsert via RPC (DELETE+INSERT in one transaction)
  → logs result to sync_log table
```

**Schedule:** 2x daily at 8:00 and 9:00 Belgrade time (auto-adjusts for CET/CEST).

**Edge Function files:** `supabase/functions/sync-sheets/`
- `index.ts` — entry point, timezone check, orchestration
- `csv.ts` — parseCSV, parseCSVLine (port from data.js)
- `platform.ts` — detectPlatform, mapRow, parseNum (port from data.js)
- `sync-campaigns.ts` — campaign data sync + deduplication
- `sync-ga4.ts` — GA4 KPI sync (Serbian/English column names)
- `types.ts` — TypeScript interfaces

**pg_net timeout:** Default 5s was too short — set to `timeout_milliseconds := 120000` (2 min) in all 3 cron jobs. Fixed 2026-03-21.

**Status: DONE (deployed 2026-03-21)**
- To redeploy: `cd dashboard-staging && supabase functions deploy sync-sheets --no-verify-jwt`

## Known Issues / In Progress
- **Supabase CLI on Windows:** `npx supabase` conflicts with `supabase.js` in project root (Windows Script Host). Use `supabase` directly (installed via scoop/winget) from the project folder.
- GA4 KPI sync: Sheet headers are in Serbian (`Mesec`, `Proizvod`) — sync handles both Serbian and English column names
- Debug logging active in `src/lib/db.js` (`[prefetchHomepage]`, `[dbSave]`) — remove after stabilization
- Client display order is alphabetical (ORDER BY name). `sort_order` column exists but not yet used in UI.
- Budgets show 0 until set via Budget modal
- `sync_log` table has RLS — anon key returns empty array. Frontend reads via authenticated user session. Direct DB access shows all rows.
- Old vanilla JS files removed from repo 2026-03-21 (app.js, auth.js, data.js, db.js, views.js, style.css, supabase.js)

## Gotchas
- **Supabase client is `sb`, NOT `supabase`** — historical naming to avoid CDN conflict
- `src/lib/cache.js` uses pre-fetch cache — data loaded into memory, reads are synchronous
- Cache lives outside React/Zustand state — don't put campaign rows in stores
- Supabase anon key is public by design — RLS policies are the security boundary
- Supabase default query limit is 1000 rows — `src/lib/db.js` uses pagination loops for larger datasets
- `dbSaveCampaignData()`, `dbSetBudget()`, `dbSetFlightDays()` are async — must be awaited
- **CSV deduplication** — Google Ads CSV can have duplicate rows. `dbSaveCampaignData()` deduplicates by aggregating before writing
- **Hosting must be HTTPS** — Supabase API calls fail on HTTP due to mixed-content blocking
- **User role defaults to `viewer`** — new users get `viewer` role via trigger. Must manually set to `admin` via SQL for full access
- `getMoMChange()` returns `{change, isGood, cls, arrow, label}` object (not HTML string) for React rendering
- **Report AI Worker CORS** — `report-narratives-api` worker only allows requests from the Vercel production URL. AI narratives fail on localhost (expected) — generator.js falls back to local text generation. To test AI locally, temporarily set `ALLOWED_ORIGIN` to `*` in wrangler.toml
- **jspdf-autotable** requires explicit `applyPlugin(jsPDF)` — side-effect `import 'jspdf-autotable'` alone does NOT work

## Scaling Roadmap (Approved March 2026)
- **FAZA 1 (DONE):** Supabase (PostgreSQL + Auth + RLS) replaces localStorage. Deployed on Vercel.
- **FAZA 2 (DONE):** Data pipeline — Edge Function syncs Sheets → Supabase at 8:00 + 9:00 daily. Deployed 2026-03-21.
- **FAZA 3 (DONE):** React + Vite + Tailwind frontend. Build verified 2026-03-21.
- **FAZA 4A (DONE):** Client onboarding via Admin UI — no SQL needed. Deployed 2026-03-24.
- **FAZA 4B (DONE):** Generic report engine — config-driven PDF reports, no custom JS per client. Generic AI narrative worker. Deployed 2026-03-24.
- **FAZA 4C (DONE):** Scaling for 50+ clients — DB indexes, server-side aggregation via `get_homepage_summary()` RPC, React memoization (useMemo/React.memo), sync parallelization (batch of 5), table virtualization (@tanstack/react-virtual), code splitting (jsPDF lazy loaded), cache TTL (5min) + LRU eviction (max 5 clients). Deployed 2026-03-25.
- **FAZA 4D:** AI insights & alerts (anomaly detection, budget pacing)
- **FAZA 4E (DONE):** Local Display pipeline — Gemius gDE API direct integration via Edge Function `sync-gemius`. Daily sync replaces monthly email pipeline. Apps Script kept as fallback. Deployed 2026-03-27. TikTok pending credentials.

## FAZA 4E: Local Display Integration (Deployed 2026-03-27)

### Architecture (Current — gDE API)
```
pg_cron (3x daily) → Edge Function "sync-gemius" → gDE API → Supabase → Dashboard
```
**Direct API integration replaces email pipeline.** Daily sync instead of monthly.

### Architecture (Legacy — Apps Script fallback)
```
Gemius XLSX → Gmail → Apps Script → Supabase REST API (service_role) → Dashboard
```

### Two-Table Design
| Table | Purpose | Source |
|-------|---------|--------|
| `local_display_dashboard` | Daily placement-level data → Dashboard tab + trend chart | ✅ gDE API (Edge Function) |
| `local_display_report` | Monthly aggregated data → PDF reports | ✅ Auto-rollup from daily data (RPC) |

### Database (`local_display_dashboard` — daily)
- **Columns:** client_id, campaign, publisher, format, type, date, month, impressions, clicks, ctr, actions, spend
- **RLS:** SELECT via `has_client_access(client_id)`
- **UNIQUE constraint:** `(client_id, campaign, publisher, format, type, date)`
- **Upsert:** Atomic DELETE+INSERT via `upsert_local_display_daily` RPC
- **Rollup:** `rollup_local_display_monthly` RPC aggregates daily → `local_display_report`

### Database (`local_display_report` — monthly)
- **Columns:** client_id, campaign, publisher, format, type, month, impressions, clicks, ctr, actions
- **RLS:** SELECT via `has_client_access(client_id)`, INSERT/DELETE open (service_role bypasses anyway)
- **UNIQUE constraint:** `(client_id, campaign, publisher, format, type, month)`
- **Populated by:** rollup RPC (from daily data) OR Apps Script (legacy fallback)

### Apps Script (`scripts/gemius-to-supabase.js`)
- Searches Gmail for Gemius emails (`from:no-reply@gde.gemius.com`)
- Detects client from subject keywords via `CLIENT_MAP`
- Parses XLSX by uploading to Drive as Google Sheet (Drive API v2), reads data, deletes temp file
- **Header detection:** Scans first 30 rows for row containing both "Placement" AND "Imp" in same row
- **Placement parsing:** `LD/Blic / 320x100 / Product` → publisher: Blic, format: 320x100, type: Product
- **Skips:** "Total for" rows (summary rows), rows without valid placement
- **actions column:** Always empty (Gemius doesn't provide it) — kept for future use
- Writes to Supabase via REST API with `service_role` key (stored in Script Properties)
- **Trigger:** Monthly on day 2 at 08:00-09:00
- **Functions:** `listGemiusEmails` (scout), `inspectHeaders` (debug), `dryRun` (preview), `testImport` / `importGemiusReport` (real import)
- **Apps Script requirements:** Drive API v2 enabled (Services → Drive API → v2), Script Properties: `SUPABASE_URL`, `SUPABASE_KEY` (service_role)

### Frontend
- **Component:** `src/components/client/LocalDisplayView.jsx`
- **Cache:** `_cache.localDisplay` keyed by `ld_${clientId}_${month}`, each row includes `month` field
- **Cache functions:** `dbGetAllLocalDisplay(clientId)`, `dbGetLocalDisplay(clientId, month)` in `cache.js`
- **Tab activation:** Add `local_display` to client's `platforms` array in `clients` table
- **Badge:** Orange (`badge-local` class)
- **UI:** Month selector + 4 summary cards (Impressions, Clicks, CTR, Actions) + Publisher aggregate table + Placement detail table
- **Safety:** Handles empty data gracefully (no crash on undefined month)

### Gemius gDE API Integration (FAZA 4E+ — Deployed 2026-03-27)

#### Architecture
```
pg_cron → Edge Function (sync-gemius) → gDE API (gdeapi.gemius.com) → Supabase
```
**Replaces email pipeline with direct API integration.** Daily sync instead of monthly.

#### gDE API Details
- **Base URL:** `https://gdeapi.gemius.com/`
- **Auth:** Session-based — `OpenSession.php` requires **POST** (form-encoded login/passwd → sessionID). All other endpoints use GET.
- **Response format:** XML
- **Date format:** `YYYYMMDD` (not ISO, not timestamps)
- **Key endpoints:** `OpenSession.php` (POST), `GetCampaignsList.php`, `GetBasicStats.php`, `CloseSession.php` (all GET)
- **GetCampaignsList:** `status` param accepts `current`, `finished`, `waiting` (NOT `all` — must query current+finished separately)
- **GetBasicStats params:** `dimensionIDs=20` (Placement), `indicatorIDs=4,2,120,1` (impressions,clicks,CTR,actions), `timeDivision=Day`
- **Placement names** in API match XLSX format exactly: `LD/Publisher / Format / Type [/ tracking]`
- **CTR** returned as decimal (0.003644), stored as percent (0.36) — multiply by 100

#### Edge Function (`supabase/functions/sync-gemius/`)
| File | Purpose |
|------|---------|
| `index.ts` | Entry point, CORS, timezone check (8:00/9:00 Belgrade), sync_log |
| `auth.ts` | gDE session management (OpenSession/CloseSession) |
| `api.ts` | Campaign list + stats fetching, XML parsing |
| `sync-client.ts` | Per-client sync: API → parse placement → upsert daily + monthly rollup |
| `types.ts` | TypeScript interfaces |

- **Secrets:** `GEMIUS_USERNAME`, `GEMIUS_PASSWORD` (set via `supabase secrets set`)
- **Deploy:** `supabase functions deploy sync-gemius --no-verify-jwt` (or via Supabase MCP tool if Docker unavailable)
- **Manual trigger:** POST to `/functions/v1/sync-gemius` with `{"trigger":"manual"}` or `{"trigger":"manual","client_id":"nlb"}`
- **Backfill:** POST with `{"trigger":"manual","client_id":"nlb","date_from":"20260101","date_to":"20260327"}` — date format YYYYMMDD
- **Schedule:** pg_cron 3 slots (5:00, 6:00, 7:00 UTC), same as sync-sheets
- **Client onboarding:** See `localdisplay.md` for step-by-step instructions

#### Database Tables
| Table | Purpose |
|-------|---------|
| `gemius_config` | Maps client_id → gDE campaign IDs + client name for auto-discovery |
| `local_display_dashboard` | Daily placement-level metrics from gDE API |
| `local_display_report` | Monthly aggregated data (populated by rollup RPC from daily data) |

#### Frontend
- **Component:** `src/components/client/LocalDisplayView.jsx`
- **Daily data cache:** `_cache.localDisplayDaily` keyed by `ldd_${clientId}_${month}`
- **New cache functions:** `dbGetAllLocalDisplayDaily(clientId)`, `dbGetLocalDisplayDaily(clientId, month)`
- **Daily trend chart:** Line chart (impressions + clicks) when daily data exists
- **Fallback:** Still reads from `local_display_report` (monthly) if no daily data

#### Apps Script Fallback
- Original email pipeline (`scripts/gemius-to-supabase.js`) kept as fallback
- Apps Script trigger can be disabled once gDE API sync proves reliable

### Gotchas
- Gemius XLSX has ~14 rows of headers/titles before actual data — parser finds header row dynamically
- Campaign names should avoid Serbian diacritics (Š, Ć, Đ, Ž) to prevent encoding issues in CSV/XLSX pipeline
- `service_role` key in Script Properties — NEVER in frontend code
- **DV360 has insertion_order field** — UNIQUE constraints must account for it (lesson learned: Preferred Deal vs Open Market are different rows with same campaign+date)
- **Always SELECT before DELETE/UPDATE** on production data — log what will be affected before executing
