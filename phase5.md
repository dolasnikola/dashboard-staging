# FAZA 4C: Skaliranje za 50+ klijenata

## Datum: 2026-03-25

## Sta je uradjeno

### 1. Database indeksi (produkcija)
10 indeksa kreirano na svim core tabelama:

- `campaign_data` — 3 indeksa (client_id, client+platform+month, client+date)
- `budgets` — 1 indeks (client+platform+month)
- `flight_days` — 1 indeks (client+month)
- `ga4_kpi_data` — 1 indeks (client+month)
- `user_client_access` — 2 indeksa (user_id, client_id) — poboljsava RLS performance
- `sync_log` — 1 indeks (started_at DESC)

Migracija: `supabase/migrations/20260325000001_core_indexes.sql`

### 2. Server-side agregacija za homepage
Zamenjen bulk prefetch (svi campaign redovi u memoriju) sa jednim SQL pozivom.

**Pre:** `prefetchHomepageData()` ucitava SVE campaign_data redove (hiljade) u `_cache.campaignData`, ClientCard iterira svaki red da izracuna spend/impressions/clicks.

**Posle:** `fetchHomepageSummary(month)` poziva RPC `get_homepage_summary` koji vraca agregirane metrike po klijentu/platformi. ClientCard cita gotove brojeve iz `_cache.homepageSummary`.

- RPC funkcija: `get_homepage_summary(p_month text)`
- Migracija: `supabase/migrations/20260325000002_homepage_summary_rpc.sql`

### Izmenjeni fajlovi
| Fajl | Izmena |
|------|--------|
| `src/lib/cache.js` | Dodat `homepageSummary` cache + `getHomepageSummary()` getter |
| `src/lib/db.js` | Novi `fetchHomepageSummary()`, stari `prefetchHomepageData()` je legacy alias |
| `src/components/home/ClientCard.jsx` | Cita summary umesto iteriranja raw redova |
| `src/stores/appStore.js` | `initDashboard()` koristi `fetchHomepageSummary()` |
| `CLAUDE.md` | Azuriran za FAZA 4C |

### Rezultat
- Homepage load: hiljade redova → 7 agregiranih redova (1 RPC poziv)
- RAM na homepage: stotine MB → par KB
- Query performance: full table scan → index scan

---

---

## P1: Frontend optimizacija + sync paralelizacija (DONE — 2026-03-25)

### React memoizacija
- `PlatformView.jsx` — sva agregacija (getFilteredData, aggregateByCampaign, getDailyTotals, chart data) wrappovana u `useMemo` sa deps `[clientId, platform, activeDateRange, customDateFrom, customDateTo]`
- `OverviewTab.jsx` — dupla petlja spojena u jednu + cela kalkulacija u `useMemo`
- `ClientCard.jsx` — `React.memo()` wrapper
- `MetricCard.jsx` — `React.memo()` wrapper
- `CampaignTable.jsx` — `React.memo()` wrapper

### Sync paralelizacija
- `supabase/functions/sync-sheets/index.ts` — sekvencijalni for loop zamenjen sa `Promise.all` batch processing (5 sheet-ova paralelno)
- Dodat try/catch po sheet-u da jedan fail ne blokira ceo batch

### Code splitting
- `ClientDetail.jsx` — static import za `generator.js` zamenjen sa dynamic `import()`
- jsPDF + report engine izdvojeni u poseban chunk (`generator-*.js`, 444KB)
- Glavni bundle smanjen sa 1,119KB na 675KB (~40% manje)

### Izmenjeni fajlovi
| Fajl | Izmena |
|------|--------|
| `src/components/client/PlatformView.jsx` | useMemo za sve agregacije |
| `src/components/client/OverviewTab.jsx` | useMemo + jedna petlja |
| `src/components/home/ClientCard.jsx` | React.memo() |
| `src/components/client/MetricCard.jsx` | React.memo() |
| `src/components/client/CampaignTable.jsx` | React.memo() |
| `src/components/client/ClientDetail.jsx` | dynamic import za report generator |
| `supabase/functions/sync-sheets/index.ts` | batch parallel sync |

---

---

## P2: Virtualizacija tabela + Cache TTL (DONE — 2026-03-25)

### Virtualizacija CampaignTable
- Instaliran `@tanstack/react-virtual` (~5KB gzipped)
- `CampaignTable.jsx` — tabele sa >50 redova koriste virtualizovani render (samo vidljivi redovi u DOM-u)
- Tabele sa <=50 redova koriste obican render (brze za mali dataset)
- Sticky header na virtualizovanoj tabeli
- Max height 600px sa scroll-om

### Cache TTL + LRU eviction
- `cache.js` — dodati `CACHE_TTL_MS` (5 min) i `MAX_CACHED_CLIENTS` (5)
- `isClientCacheValid(clientId)` — proverava da li je cache stariji od 5 min
- `touchClient(clientId)` — osvezava TTL + LRU poziciju, evictuje najstariji klijent kad ima >5
- `clearClientCache(clientId)` — cisti sve cache za jednog klijenta
- `prefetchClientData()` u `db.js` — preskace fetch ako je cache svez, koristi `touchClient` umesto rucnog `_cache._prefetched = true`

### Izmenjeni fajlovi
| Fajl | Izmena |
|------|--------|
| `src/components/client/CampaignTable.jsx` | Virtualizacija za 50+ redova |
| `src/lib/cache.js` | TTL, LRU, clearClientCache, isClientCacheValid, touchClient |
| `src/lib/db.js` | Integracija TTL/LRU u prefetchClientData |
| `package.json` | +@tanstack/react-virtual |

---

## Naredne faze

### FAZA 4D: AI insights & alerts
- Anomaly detection (naglo povecanje CPA, pad CTR)
- Budget pacing upozorenja (overspend/underspend)
- Automatski email/notifikacija za account managere

### FAZA 4E: Direktne API integracije
- Google Ads API umesto Google Sheets CSV (kad Sheets postane bottleneck)
- Meta Marketing API
- DV360 API
- GA4 Data API

### FAZA 5: Multi-tenant scaling
- Vercel Edge Functions za kesiranje i rate limiting
- Supabase materialized views za mesecne rollup-ove
- Paginacija homepage grid-a (20 klijenata po stranici)
- Core schema migracije (8 tabela koje postoje samo u produkciji)
