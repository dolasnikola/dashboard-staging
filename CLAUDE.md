# Performance Marketing Dashboard

## Overview
Multi-tenant performance marketing dashboard for a digital agency (dolasads.com).
Serves multiple clients (NLB Komercijalna banka, Urban Garden, Krka Terme). Serbian language UI.
Data stored in Supabase (PostgreSQL) with role-based access control.
Currently in FAZA 1 of a 4-phase scaling plan (approved March 2026).

## Architecture
- `index.html` — HTML markup. Links to external CSS/JS files.
- `style.css` — All styles. Uses CSS custom properties for theming. DM Sans + DM Serif Display fonts.
- `supabase.js` — Supabase client init. Uses `sb` as the global client variable (not `supabase`, which conflicts with the CDN library name on `window.supabase`).
- `db.js` — Data access layer. Wraps Supabase queries with an in-memory pre-fetch cache. Reads are synchronous (from cache), writes are async (to Supabase). Handles pagination for >1000 rows. Deduplicates CSV rows before cache/DB write. Includes `runDiagnostics()` for troubleshooting.
- `data.js` — Constants (PLATFORM_NAMES, METRIC_LABELS, NLB_PRODUCTS), formatting (`fmt`, `fmtMetric`), CSV parsing (`parseCSV`, `detectPlatform`, `mapRow`), notifications. `CLIENTS` is `let` — loaded dynamically from Supabase via `initDashboard()`.
- `views.js` — All rendering: homepage cards, client detail, platform tabs, Chart.js charts, sparklines, MoM comparison, GA4 KPI view, NLB product breakdown, admin panel.
- `app.js` — Hash routing (`#/clientId`, `#/admin`), date range filtering, data aggregation, modals (import/budget/sheets), Google Sheets sync (`syncOneSheet`, `syncAllSheets`, `syncGA4Sheet`), admin CRUD actions.
- `auth.js` — Supabase Auth (email/password login, session management, role-based UI gating, logout). Uses `sb.auth` methods. `applyRolePermissions()` controls button visibility per role.
- `migrate.js` — One-time localStorage → Supabase migration script. Run `migrateToSupabase()` in browser console.
- `reports/krka.js` — Krka monthly PDF report generator. Fetches CSV data, generates multi-page PDF with AI narratives via Cloudflare Worker.
- `supabase-migration.sql` — Complete database schema (8 tables), RLS policies, helper functions, triggers, seed data for 3 clients + sheet links.
- `creatives/<client>/` — Ad creative images organized by client and platform.
- `worker/` — Cloudflare Worker for AI report narratives (calls Claude API).
- `AppsScripts/` — Google Ads Script for automated data export to Google Sheets.

## Script Loading Order
Scripts must load in this exact order (each depends on the previous):
1. Chart.js 4.4.1 (CDN, in `<head>`)
2. `@supabase/supabase-js` v2 (CDN, in `<head>`)
3. `supabase.js` — creates `sb` client instance
4. `db.js` — data access layer + cache (uses `sb`)
5. `data.js` — depends on db.js functions; provides formatting, CSV parsing
6. `views.js` — depends on data.js globals; references app.js functions (called later, not at parse time)
7. `app.js` — depends on data.js + views.js globals; sets up modals, drop zone, routing
8. `auth.js` — depends on sb + data.js + views.js; runs session check at end (auto-login)
9. `migrate.js` — depends on sb + db.js functions
10. jsPDF + jsPDF-AutoTable (CDN)
11. `reports/krka.js` — depends on data.js + views.js + jsPDF

## Data Flow
```
Google Sheets (CSV published) → fetchSheetCSV() → parseCSV() → detectPlatform() → mapRow()
  → dbSaveCampaignData() → [deduplicate → cache update + Supabase DELETE/INSERT]
  → renderHomepage() / renderPlatformView()
```
- On login: `checkSession()` → `unlockDashboard()` → `initDashboard()`:
  - `fetchClients()` from Supabase → populate `CLIENTS`
  - `prefetchHomepageData()` loads all campaign_data + budgets into cache (with pagination)
  - `dbGetSheetLinks()` loads sheet URLs into cache
  - `renderHomepage()` renders client cards from cache
  - Auto-sync: `syncAllSheets()` after 1s, `syncGA4Sheet()` after 2s
  - `_initDone` guard prevents duplicate initialization
- On client open: `prefetchClientData(id)` → clears + refetches client data from Supabase → render from cache
- `syncAllSheets()` has `_syncInProgress` guard — renders homepage once after all syncs complete (not per-sheet)

## Auth & Roles
- **Supabase Auth** with email/password (replaces old SHA-256 hash check)
- **Roles:** admin (all access), account_manager (assigned clients), viewer (read-only)
- **Row-Level Security (RLS)** on all 8 tables
- User profiles auto-created via `handle_new_user()` database trigger on signup
- Role stored in `user_profiles.role`, checked via `get_user_role()` SQL function
- Client access controlled via `user_client_access` table + `has_client_access()` SQL function
- Viewer role hides Import CSV, Budget, and Sheets Sync buttons

## Admin Panel
- Accessible only to `admin` role via "Admin" button in header (route: `#/admin`)
- Displays all users from `user_profiles` table in a table
- **Role management:** dropdown to change user role (viewer / account_manager / admin). Admin's own role is locked.
- **Client access:** checkbox per client per user. Controls `user_client_access` table. Admins show all checked + disabled (RLS grants full access).
- Both `account_manager` and `viewer` roles require explicit client access via checkboxes
- Functions: `dbGetAllUsers()`, `dbGetAllClientAccess()`, `dbUpdateUserRole()`, `dbSetClientAccess()` in db.js
- UI: `openAdmin()`, `renderAdminPanel()` in views.js; `changeUserRole()`, `toggleClientAccess()` in app.js

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
- **Anon key** in `supabase.js` (public, starts with `sb_publishable_`)
- **Never use service_role key** in frontend code
- First admin user must be created in Supabase Auth dashboard, then role set via SQL:
  ```sql
  INSERT INTO user_profiles (id, email, full_name, role)
  SELECT id, email, 'Name', 'admin' FROM auth.users WHERE email = 'your@email.com';
  ```

## Adding a New Client
1. Insert client config into `clients` table in Supabase
2. Add sheet URLs to `sheet_links` table
3. Add client ID to `preferredOrder` array in `db.js` `fetchClients()` for display ordering
4. For PDF reports: add report JS file in `reports/` folder (see `reports/krka.js` as template). Add CSV URLs to `MONTHLY_SHEET_URLS` and creative config to `CREATIVES_CONFIG`
5. Place creative images in `creatives/<client>/`
6. Assign users access via `user_client_access` table

## Migration from localStorage
Run `migrateToSupabase()` in browser console (must be logged in as admin).
Reads pmDashboard, ga4_kpi_data, and pmSheetLinks from localStorage and writes to Supabase.

## Known Issues / In Progress
- GA4 KPI sync: Sheet headers are in Serbian (`Mesec`, `Proizvod`) — `syncGA4Sheet()` handles both Serbian and English column names
- `syncAllSheets()` excludes `_ga4` keys (GA4 has separate sync via `syncGA4Sheet()`)
- Debug logging active in `db.js` (`[prefetchHomepage]`, `[dbSave]`) — remove after stabilization
- Client display order maintained via hardcoded `preferredOrder` in `fetchClients()` — will add `sort_order` DB column later
- Budgets show 0 until set via Budget modal (old localStorage budgets need `migrateToSupabase()` or manual entry)

## Resolved Issues
- **2x data duplication bug (fixed 2026-03-20):** `openClient()` had a race condition — `_routingInProgress` flag was released before async work finished, so `hashchange` event triggered a parallel `openClient` call. Two `prefetchClientData()` calls ran simultaneously, both pushing the same Supabase data into cache = 2x numbers. Fix: `_routingInProgress` now spans entire async `openClient` (try/finally in views.js), `handleHashChange` no longer manages the flag (app.js), and `prefetchClientData` has a per-client guard + cache clear moved after fetch completes (db.js).

## Diagnostics
- Run `runDiagnostics()` in browser console (F12) to check: auth session, user role, table access, sheet links, cache state, HTTPS protocol, CDN status
- CDN fallback detection in `index.html` — shows error page if Chart.js or Supabase fails to load
- HTTP protocol warning logged to console if not HTTPS (Supabase requires HTTPS on production)

## Gotchas
- No modules — all JS files use plain `<script>` tags with global functions
- Inline onclick handlers in HTML reference global functions — don't rename them
- Google Sheets must be "Published to the web" as CSV for data fetching to work
- **Supabase client is `sb`, NOT `supabase`** — `window.supabase` is the CDN library
- db.js uses pre-fetch cache — data loaded into memory, reads are synchronous
- Supabase anon key is public by design — RLS policies are the security boundary
- Supabase default query limit is 1000 rows — db.js uses pagination loops for larger datasets
- `saveCampaignData()`, `setBudget()`, `setFlightDays()` are async — must be awaited
- CLIENTS is `let` (not `const`) — loaded dynamically from Supabase on login
- **CSV deduplication** — Google Ads CSV can have duplicate rows (same date+campaign). `dbSaveCampaignData()` deduplicates by aggregating before writing to cache and Supabase
- **Hosting must be HTTPS** — Supabase API calls fail on HTTP due to mixed-content blocking
- **User role defaults to `viewer`** — new users created via Supabase Auth trigger get `viewer` role. Must manually set to `admin` via SQL for full access

## Scaling Roadmap (Approved March 2026)
- **FAZA 1 (current):** Supabase (PostgreSQL + Auth + RLS) replaces localStorage
- **FAZA 2:** Data pipeline — Edge Function cron syncs Sheets → Supabase every 30 min
- **FAZA 3:** React + Vite + Tailwind frontend on Vercel
- **FAZA 4:** Direct API integrations, automated reporting, white-label, AI insights
