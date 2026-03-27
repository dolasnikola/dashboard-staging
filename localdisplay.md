# Local Display — Gemius gDE API Integration

## SQL upiti za pregled podataka

```sql
-- Svi dnevni podaci za klijenta
SELECT * FROM local_display_dashboard WHERE client_id = 'nlb' ORDER BY date DESC, publisher;

-- Sumirano po publisher-u za mesec
SELECT publisher, sum(impressions) as imp, sum(clicks) as clicks,
  round(sum(clicks)::numeric / nullif(sum(impressions),0) * 100, 2) as ctr
FROM local_display_dashboard WHERE client_id = 'nlb' AND month = '2026-03'
GROUP BY publisher ORDER BY imp DESC;

-- Dnevni totali (za trend chart)
SELECT date, sum(impressions) as imp, sum(clicks) as clicks
FROM local_display_dashboard WHERE client_id = 'nlb'
GROUP BY date ORDER BY date;

-- Mesecni rollup (koriste PDF reporti)
SELECT * FROM local_display_report WHERE client_id = 'nlb' ORDER BY impressions DESC;

-- Konfiguracija klijenata
SELECT * FROM gemius_config;

-- Poslednji sync-ovi
SELECT * FROM sync_log WHERE trigger LIKE 'gemius%' ORDER BY created_at DESC LIMIT 10;
```

## Rucni API poziv (backfill ili resync)

```bash
curl -X POST "https://vorffefuboftlcwteucu.supabase.co/functions/v1/sync-gemius" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ANON_KEY" \
  -d '{"trigger":"manual","client_id":"nlb","date_from":"20260301","date_to":"20260327"}'
```

Parametri:
- `trigger`: `"manual"` (preskace timezone check) ili `"cron"` (postuje 8:00/9:00 Belgrade)
- `client_id`: opciono — ako se izostavi, sync-uje sve enabled klijente
- `date_from` / `date_to`: format `YYYYMMDD`, opciono — bez toga povlaci samo jucerasnji dan

## Dodavanje novog klijenta

### Korak 1 — Proveri ime klijenta u Gemius-u

Poznata imena sa gDE naloga (potvrdjeno 2026-03-27):

| gde_client_name | Kampanje |
|---|---|
| Atlantic Grupa | Cockta, Donat, Doncafe, Najlepse zelje |
| Meggle.rs | Meggle Kefir |
| Nlb.rs | NLB Stednja |
| WSO | Wiener Pomoc na putu |
| Yettel | Voyo Best Channel (2 kampanje) |

Ime mora tacno da se poklopi sa imenom u Gemius portalu (case-insensitive).

### Korak 2 — Ubaci u gemius_config

```sql
INSERT INTO gemius_config (client_id, gde_client_name)
VALUES ('yettel', 'Yettel');
```

`client_id` mora da postoji u `clients` tabeli.

### Korak 3 — Dodaj local_display platform klijentu (ako vec nema)

```sql
UPDATE clients SET platforms = array_append(platforms, 'local_display')
WHERE id = 'yettel' AND NOT ('local_display' = ANY(platforms));
```

### Korak 4 — Povuci istorijske podatke

```bash
curl -X POST "https://vorffefuboftlcwteucu.supabase.co/functions/v1/sync-gemius" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ANON_KEY" \
  -d '{"trigger":"manual","client_id":"yettel","date_from":"20260101","date_to":"20260327"}'
```

Od tog momenta, cron automatski povlaci jucerasnje podatke svakog jutra u 8:00.

## Automatski sync

- pg_cron: 3 slota (5:00, 6:00, 7:00 UTC)
- Edge Function proverava beogradsko vreme — radi samo u 8:00 ili 9:00
- Povlaci podatke za jucerasnji dan za sve enabled klijente u `gemius_config`
- Upisuje u `local_display_dashboard` (dnevno) + rollup u `local_display_report` (mesecno)
- Loguje rezultat u `sync_log` tabelu (trigger: `gemius_cron` ili `gemius_manual`)

## Iskljucivanje klijenta

```sql
UPDATE gemius_config SET enabled = false WHERE client_id = 'nlb';
```

## Brisanje podataka za klijenta/mesec

```sql
DELETE FROM local_display_dashboard WHERE client_id = 'nlb' AND month = '2026-03';
DELETE FROM local_display_report WHERE client_id = 'nlb' AND month = '2026-03';
```
