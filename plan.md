# FAZA 5 — Scaling & Advanced Features Plan

> Approved: 2026-03-31
> Prerequisites: FAZA 1-3 (done), FAZA 4A-4F (done), FAZA 4D (in progress)

---

## 1. White-label & Multi-tenant Scaling

### Cilj
Omoguciti klijentima direktan pristup dashboardu sa brendiranim iskustvom.

### Implementacija

#### 1.1 Client Branding Config
- Nova kolona u `clients` tabeli: `branding JSONB`
  ```json
  {
    "logo_url": "/logos/nlb.svg",
    "primary_color": "#003DA5",
    "accent_color": "#FF6B00",
    "font_family": "Inter"
  }
  ```
- `BrandingProvider` React context koji cita branding iz klijenta
- CSS custom properties (`--brand-primary`, `--brand-accent`) se menjaju dinamicki
- Header logo + boje se prilagodjavaju kad je klijent ulogovan

#### 1.2 Client-facing Portal (Read-only)
- Nova rola: `client_user` — vidi samo svoje podatke, nema admin/budget/import opcije
- Login stranica sa klijentskim brendingom (prepoznaje se po email domenu ili invite linku)
- Simplified navigation: samo ClientDetail view za njihov klijent
- RLS vec postoji (`has_client_access`) — samo treba nova rola u frontendu

#### 1.3 Custom Domain per Client (Future)
- Vercel custom domains API
- Wildcard subdomain: `nlb.dashboard.mediahouse.rs`
- Middleware za detekciju domene → automatski branding + klijent filter

### Fajlovi
| Akcija | Fajl |
|--------|------|
| Create | `src/components/layout/BrandingProvider.jsx` |
| Create | `src/lib/branding.js` |
| Modify | `src/components/layout/Header.jsx` — dynamic logo/colors |
| Modify | `src/components/auth/LoginGate.jsx` — branded login |
| Migration | `ALTER TABLE clients ADD COLUMN branding JSONB` |

### Effort: ~1 nedelja
### Prioritet: Srednji — raste sa brojem klijenata

---

## 2. Automated Reporting Pipeline

### Cilj
Automatsko generisanje i slanje PDF izvestaja bez manuelnog rada.

### Implementacija

#### 2.1 Scheduled Report Generation
- Nova Edge Function `generate-report` — poziva `generator.js` logiku server-side
- pg_cron job: 5. u mesecu u 10:00 → generisi izvestaj za prethodni mesec
- PDF se cuva u Supabase Storage (R2 bucket ili Supabase Storage)
- `report_history` tabela (vec postoji) — cuva link do PDF-a, status, timestamp

#### 2.2 Email Delivery
- Supabase Edge Function za slanje emaila (Resend API ili SendGrid)
- Email template sa kratkim summary-jem + PDF attachment
- Konfigurisanje primaoca u `report_configs` tabeli: `recipients JSONB` (email lista)
- Retry logika za neuspele isporuke

#### 2.3 Krka Monthly Scripts Migration
- Prebaciti `meta-report-monthly-krka.js`, `googleAds-report-monthly-krka.js`, `dv360-report-monthly-krka.js` sa Google Sheets na direktan Supabase read
- Report generator cita iz `campaign_data` tabele umesto iz Sheets CSV URL-ova
- Eliminise poslednju zavisnost od Google Sheets-a

#### 2.4 Report Download History UI
- Nova sekcija u ClientDetail: "Izvestaji" tab
- Lista generisanih izvestaja sa datumom, statusom, download linkom
- Admin moze da pokrene manuelno generisanje iz UI-ja

### Fajlovi
| Akcija | Fajl |
|--------|------|
| Create | `supabase/functions/generate-report/index.ts` |
| Create | `supabase/functions/send-report-email/index.ts` |
| Create | `src/components/client/ReportsTab.jsx` |
| Modify | `src/reports/generator.js` — refactor za server-side use |
| Modify | `src/components/client/ClientDetail.jsx` — dodaj Reports tab |
| Modify | `report_configs` tabela — dodaj `recipients` kolonu |
| Migration | Storage bucket + RLS policy |

### Effort: ~2 nedelje
### Prioritet: Visok — direktna ušteda vremena za account managere

---

## 3. Cross-Platform Attribution & Analytics

### Cilj
Unified pogled na performanse preko svih platformi sa mogucnoscu poredjenja.

### Implementacija

#### 3.1 Unified Funnel View
- Nova komponenta `FunnelView.jsx` — prikazuje impression → click → conversion tok
- Agregirano po svim platformama za jednog klijenta
- Horizontalni funnel chart (react-chartjs-2 bar chart ili custom SVG)
- Click na segment filtrira po platformi

#### 3.2 Cross-Platform Comparison
- Nova komponenta `PlatformComparison.jsx`
- Side-by-side metrike: CPC, CTR, CPM, ROAS po platformi
- Bar chart ili radar chart za vizuelno poredjenje
- Tabela sa rangiranjem platformi po efikasnosti

#### 3.3 Custom Dashboards (Advanced)
- `dashboard_configs` tabela: klijent + layout JSON
- Drag & drop widget grid (react-grid-layout biblioteka)
- Widget tipovi: MetricCard, Chart, Table, Funnel, BudgetPacing
- Klijenti mogu da sacuvaju svoj preferred layout

### Fajlovi
| Akcija | Fajl |
|--------|------|
| Create | `src/components/client/FunnelView.jsx` |
| Create | `src/components/client/PlatformComparison.jsx` |
| Create | `src/components/client/CustomDashboard.jsx` |
| Create | `src/lib/funnel.js` — funnel aggregation logic |
| Modify | `src/components/client/OverviewTab.jsx` — integrate funnel |
| Migration | `dashboard_configs` tabela |

### Effort: ~2 nedelje
### Prioritet: Srednji — diferencijacija od konkurencije

---

## 4. Real-time & Streaming

### Cilj
Live data updates bez manuelnog refresha.

### Implementacija

#### 4.1 Supabase Realtime Subscriptions
- Subscribe na `campaign_data` tabelu za INSERT/UPDATE evente
- Automatski refresh cache-a kad stignu novi podaci
- Toast notifikacija: "Novi podaci za NLB (Meta) su dostupni"

#### 4.2 Sync Status Live Indicator
- Realtime subscription na `sync_log` tabelu
- Animated dot u Header-u: zelena (sync OK u poslednjih 24h), crvena (sync failed), siva (nema podataka)
- Tooltip sa poslednjim sync vremenom i statusom

#### 4.3 WebSocket Architecture
```
Supabase Realtime (Postgres Changes)
  → campaign_data INSERT → update _cache → re-render affected components
  → sync_log INSERT → update sync status indicator
  → alerts INSERT → increment notification bell counter
```

### Fajlovi
| Akcija | Fajl |
|--------|------|
| Create | `src/lib/realtime.js` — subscription manager |
| Create | `src/components/ui/SyncStatusIndicator.jsx` |
| Modify | `src/components/layout/Header.jsx` — dodaj indicator |
| Modify | `src/stores/appStore.js` — realtime connection management |
| Modify | `src/lib/cache.js` — cache invalidation on realtime events |

### Effort: ~1 nedelja
### Prioritet: Nizak-Srednji — nice-to-have, dodaje "wow" faktor

---

## 5. Advanced Data Pipeline

### Cilj
Prosiriti pipeline sa novim platformama i optimizovati za rast.

### Implementacija

#### 5.1 TikTok Ads API Integration
- Status: Ceka credentials (od FAZA 4E)
- Edge Function `sync-tiktok/` — isti pattern kao `sync-meta`
- `tiktok_config` tabela: client_id → advertiser_id
- API: `https://business-api.tiktok.com/open_api/v1.3/`
- Fields: campaign_name, impressions, clicks, spend, conversions

#### 5.2 LinkedIn Ads API (za B2B klijente)
- Edge Function `sync-linkedin/`
- `linkedin_config` tabela: client_id → account_id
- OAuth2 flow (LinkedIn marketing API)
- Relevantno kad agencija dobije B2B klijente

#### 5.3 Data Warehouse Layer
- Materialized views za mesecne/kvartalne agregacije
- `campaign_data_monthly` — pre-agregirano po campaign/platform/month
- `campaign_data_quarterly` — za trendove i YoY poredjenje
- Automatski refresh via pg_cron (jednom dnevno posle svih sync-ova)

#### 5.4 Data Retention Policy
- Partition `campaign_data` po mesecu (Postgres table partitioning)
- Podaci stariji od 24 meseca → premesti u `campaign_data_archive`
- Archive tabela u cold storage (Supabase Storage as Parquet files)
- Admin UI za pregled storage usage

### Fajlovi
| Akcija | Fajl |
|--------|------|
| Create | `supabase/functions/sync-tiktok/` (5 files) |
| Create | `supabase/functions/sync-linkedin/` (5 files) |
| Migration | `tiktok_config`, `linkedin_config` tabele |
| Migration | Materialized views + refresh jobs |
| Migration | Table partitioning za campaign_data |

### Effort: ~3 nedelje (TikTok: 1 ned, LinkedIn: 1 ned, DW: 1 ned)
### Prioritet: TikTok Visok (ceka credentials), LinkedIn Nizak, DW Srednji

---

## 6. DevOps & Reliability

### Cilj
Stabilnost i pouzdanost sistema kako raste broj klijenata.

### Implementacija

#### 6.1 Pipeline Health Monitoring
- Dashboard stranica `/admin/monitoring` sa:
  - Sync success rate (poslednjih 7 dana po source-u)
  - Average sync duration trend chart
  - Failed syncs lista sa error porukama
  - Data freshness per client (poslednji datum podataka vs danas)
- Citanje iz `sync_log` tabele sa agregacijama

#### 6.2 Automated Testing
- Vitest za unit testove (vec je Vite projekat)
- Testovi za kriticne funkcije:
  - `parseCSV`, `detectPlatform`, `mapRow` (data.js)
  - `calcPacing` (pacing.js)
  - `getFilteredData`, `aggregateByCampaign` (utils.js)
  - `dbSaveCampaignData` deduplication (db.js)
- Integration testovi za Edge Functions (Deno test runner)
- GitHub Actions CI: `npm test` pre merge-a

#### 6.3 Staging Environment
- Drugi Supabase projekat (`dashboard-staging-dev`)
- Vercel preview deployments (vec radi automatski sa PR-ovima)
- Seed skripta za test podatke
- Environment variables: `VITE_SUPABASE_URL` za switching

#### 6.4 Error Tracking
- Sentry integration (ili Supabase-native logging)
- Frontend error boundary komponente
- Edge Function error reporting
- Weekly error digest email za admina

### Fajlovi
| Akcija | Fajl |
|--------|------|
| Create | `src/components/admin/MonitoringPanel.jsx` |
| Create | `src/tests/` direktorijum + test fajlovi |
| Create | `.github/workflows/test.yml` |
| Create | `scripts/seed-test-data.js` |
| Modify | `src/components/admin/AdminPanel.jsx` — dodaj Monitoring tab |
| Config | `vitest.config.js`, `.env.staging` |

### Effort: ~2 nedelje
### Prioritet: Visok — neophodan za stabilnost sa 10+ klijenata

---

## Preporuceni Redosled Implementacije

| Faza | Stavka | Trajanje | Zavisnosti |
|------|--------|----------|------------|
| 5.1 | Automated Reporting (#2) | 2 ned | FAZA 4B (done) |
| 5.2 | TikTok API (#5.1) | 1 ned | TikTok credentials |
| 5.3 | DevOps Basics (#6.1 + #6.2) | 1 ned | Nema |
| 5.4 | Real-time Indicators (#4.2) | 3 dana | Nema |
| 5.5 | Cross-Platform Comparison (#3.2) | 1 ned | Nema |
| 5.6 | Client Portal (#1.2) | 1 ned | Nema |
| 5.7 | Unified Funnel (#3.1) | 1 ned | #3.2 |
| 5.8 | White-label Branding (#1.1) | 1 ned | #1.2 |
| 5.9 | Data Warehouse (#5.3) | 1 ned | 10+ klijenata |
| 5.10 | Custom Dashboards (#3.3) | 2 ned | #3.1, #3.2 |

---

## Arhitektura posle FAZE 5

```
                    ┌─────────────────────────────────────┐
                    │         Vercel (Frontend)            │
                    │  React + Vite + Tailwind + Zustand   │
                    │  White-label branding per client     │
                    │  Real-time subscriptions             │
                    │  Custom dashboards                   │
                    └──────────────┬───────────────────────┘
                                   │
                    ┌──────────────▼───────────────────────┐
                    │       Supabase (Backend)              │
                    │  PostgreSQL + RLS + Auth              │
                    │  Realtime WebSockets                  │
                    │  Storage (PDF reports)                │
                    │  Edge Functions:                      │
                    │    - sync-meta                        │
                    │    - sync-gemius                      │
                    │    - sync-tiktok (new)                │
                    │    - sync-linkedin (new)              │
                    │    - check-alerts (FAZA 4D)           │
                    │    - generate-report (new)            │
                    │    - send-report-email (new)          │
                    │  pg_cron scheduled jobs               │
                    │  Materialized views (DW layer)        │
                    └──────────────┬───────────────────────┘
                                   │
          ┌────────────────────────┼────────────────────────┐
          │                        │                        │
   ┌──────▼──────┐    ┌──────────▼──────────┐    ┌───────▼───────┐
   │  Apps Scripts │    │  Cloudflare Worker   │    │  External APIs │
   │  Google Ads   │    │  AI Narratives       │    │  Meta API      │
   │  DV360        │    │  (Claude Sonnet)     │    │  Gemius gDE    │
   │  GA4          │    │                      │    │  TikTok API    │
   │  Gemius (fb)  │    │                      │    │  LinkedIn API  │
   └──────────────┘    └──────────────────────┘    └───────────────┘
```
