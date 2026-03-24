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
- `cache.js` — In-memory `_cache` object + synchronous read functions (dbGetCampaignData, dbGetBudget, dbGetFlightDays, dbGetGA4Data, dbGetAllCampaignDataForPlatform, getSheetLinks, clearCache)
- `db.js` — Async Supabase queries: fetchClients (with preferredOrder), prefetchClientData (per-client guard), prefetchHomepageData (pagination), dbSaveCampaignData (deduplication), admin functions, dbGetLastSync, runDiagnostics (exposed to window)
- `data.js` — Constants (PLATFORM_NAMES, PLATFORM_BADGE, METRIC_LABELS, NLB_PRODUCTS), formatting (fmt, fmtMetric), CSV parsing (parseCSV, detectPlatform, mapRow)
- `utils.js` — Date range helpers (getDateRangeBounds, getMonthsInRange), filtering (getFilteredData), aggregation (aggregateByCampaign, groupByProduct), MoM comparison (getMoMChange returns object, not HTML), getDailyTotals
- `sync.js` — Google Sheets sync (syncOneSheet, syncAllSheets with _syncInProgress guard, syncGA4Sheet), uses callbacks for status updates

### State Management (`src/stores/`)
- `authStore.js` — Zustand: currentUser, currentUserRole, isAuthenticated, isLoading + login(), logout(), checkSession(), setupAuthListener()
- `appStore.js` — Zustand: clients, activeDateRange, customDateFrom/To, notification + initDashboard(), setDateRange(), notify(), refreshClients()

**Key design decision:** Campaign data cache (`_cache`) lives outside Zustand/React state. Thousands of rows in React state = re-render hell. Components read cache via `src/lib/cache.js` functions. Zustand holds only metadata and UI state.

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
admin/AdminPanel.jsx        — User table, role dropdown, client access
modals/ImportModal.jsx      — CSV drag-and-drop import
modals/BudgetModal.jsx      — Monthly budget inputs per client/platform
modals/SheetsModal.jsx      — Sheet URLs + sync buttons
ui/Notification.jsx         — Toast notification from appStore
```

### Reports (`src/reports/`)
- `krka.js` — Krka monthly PDF report generator (ES module). Uses jsPDF + jspdf-autotable (npm). Fetches CSV data from dedicated report sheets, generates multi-page PDF with AI narratives via Cloudflare Worker. Called from ClientDetail via `generateMonthlyReport(clientId)`.

### Static Assets
- `public/creatives/<client>/` — Ad creative images organized by client and platform

### Supabase (`supabase/`)
- `supabase/functions/sync-sheets/` — FAZA 2 Edge Function for automated data sync
- `supabase/migrations/` — SQL migrations for sync_log table, RPC functions, pg_cron setup

## Data Flow
```
Google Sheets (CSV published) → fetchSheetCSV() → parseCSV() → detectPlatform() → mapRow()
  → dbSaveCampaignData() → [deduplicate → cache update + Supabase DELETE/INSERT]
  → React components re-read from cache
```
- On login: `checkSession()` → `authStore.loadProfile()` → `appStore.initDashboard()`:
  - `fetchClients()` from Supabase → populate `clients` in store
  - `prefetchHomepageData()` loads all campaign_data + budgets into `_cache` (with pagination)
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

## Supabase Setup
- **Project:** Media House (vorffefuboftlcwteucu.supabase.co)
- **Anon key** in `src/lib/supabase.js` (public, starts with `sb_publishable_`)
- **Never use service_role key** in frontend code
- First admin user must be created in Supabase Auth dashboard, then role set via SQL:
  ```sql
  INSERT INTO user_profiles (id, email, full_name, role)
  SELECT id, email, 'Name', 'admin' FROM auth.users WHERE email = 'your@email.com';
  ```

## Adding a New Client
1. Insert client config into `clients` table in Supabase
2. Add sheet URLs to `sheet_links` table
3. Add client ID to `preferredOrder` array in `src/lib/db.js` `fetchClients()` for display ordering
4. For PDF reports: add report file in `src/reports/` (see `src/reports/krka.js` as template). Add CSV URLs to `MONTHLY_SHEET_URLS` and creative config to `CREATIVES_CONFIG`
5. Place creative images in `public/creatives/<client>/`
6. Assign users access via `user_client_access` table

## Build & Deployment
- **Dev server:** `npm run dev` (Vite, port 5173)
- **Build:** `npm run build` → outputs to `dist/`
- **Preview production build:** `npm run preview`
- **Frontend:** Vercel — https://dashboard-seven-sigma-90.vercel.app/
- **GitHub repo:** github.com/dolasnikola/dashboard-staging (private)
- **Supabase:** vorffefuboftlcwteucu.supabase.co
- **Cloudflare Worker:** Deployed separately for AI report narratives
- **Auto-deploy:** Push to `main` branch → Vercel auto-deploys from `dist/`
- `vercel.json` configured with build command, output directory, and SPA rewrite rule

## Dependencies (package.json)
- react, react-dom, react-router-dom, @supabase/supabase-js, chart.js, react-chartjs-2, zustand, jspdf, jspdf-autotable
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
- Client display order maintained via hardcoded `preferredOrder` in `fetchClients()` — will add `sort_order` DB column later
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

## Scaling Roadmap (Approved March 2026)
- **FAZA 1 (DONE):** Supabase (PostgreSQL + Auth + RLS) replaces localStorage. Deployed on Vercel.
- **FAZA 2 (DONE):** Data pipeline — Edge Function syncs Sheets → Supabase at 8:00 + 9:00 daily. Deployed 2026-03-21.
- **FAZA 3 (DONE):** React + Vite + Tailwind frontend. Build verified 2026-03-21.
- **FAZA 4:** Direct API integrations, automated reporting, white-label, AI insights
