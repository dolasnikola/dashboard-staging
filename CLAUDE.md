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
| `report_configs` | Per-client report configuration (FAZA 4B): platform_labels, metric_cols, sheet_urls, creatives_config, ai_worker_url, ai_prompt_context, gdn_campaign_filter, schedule |
| `report_history` | Generated report log: client_id, report_month, pdf_url, status |

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
- **FAZA 4E:** Direct API integrations (when Google Sheets becomes bottleneck)
