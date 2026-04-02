# Cybersecurity — Dashboard Security Hardening

## Datum: 2026-04-02
## Status: Diskusija u toku

---

## 1. Trenutno stanje autentifikacije

### Šta imamo:
- **Supabase Auth** sa email/password login-om
- **Bcrypt** hash šifara (server-side, Supabase automatski)
- **JWT tokeni** u localStorage (ranjivo na XSS)
- **RLS** (Row Level Security) na svim tabelama
- **Role sistem:** admin, account_manager, viewer
- **Refresh token rotation** uključen
- **JWT expiry:** 1 sat
- **HTTPS:** Vercel forsira SSL
- **service_role key** samo na serveru (Edge Functions, Apps Scripts)
- **Anon key** na frontendu (publički, RLS je zaštita)

### Šta nam fali:
- **Tokeni u localStorage** — XSS napadač može da ih pročita
- **Nema MFA** (Multi-Factor Authentication)
- **Nema CSP headers** (Content-Security-Policy)
- **Nema httpOnly cookies** — JavaScript ima pristup session-u

---

## 2. Problem: Session Hijacking

JWT token u localStorage je dostupan JavaScript-u. Ako napadač ubaci skriptu na stranicu (XSS napad), može da:
1. Pročita `localStorage` i izvuče JWT token
2. Pošalje token na svoj server
3. Koristi token da pristupi dashboard-u kao taj korisnik
4. Vidi sve podatke klijenata kojima korisnik ima pristup

**Rizik raste sa skaliranjem** — više klijenata = veća šteta od jednog kompromitovanog naloga.

---

## 3. Analizirani pristupi

### Pristup A: @supabase/ssr (createBrowserClient)
- Prebacuje tokene iz localStorage u **cookies**
- Cookies imaju `SameSite=Lax` i `Secure` flag-ove
- **ALI:** JavaScript ih i dalje može čitati (`document.cookie`)
- Browser mora da čita cookie da bi poslao JWT kao Authorization header
- **XSS i dalje može ukrasti token** — samo je format drugačiji

**Korist:** Bolje od localStorage (SameSite/Secure), server-side refresh, priprema za httpOnly.
**Mana:** Ne eliminiše root cause.

### Pristup B: Full httpOnly proxy
- Token u **httpOnly cookie** — JavaScript ga NE MOŽE čitati
- Svi Supabase pozivi idu kroz Vercel API routes (proxy)
- Proxy čita JWT iz cookie-ja i prosleđuje ka Supabase
- **XSS napadač ne može ukrasti token**

**Korist:** Eliminiše session hijacking.
**Mana:** Više posla (~2-3 dana), svi frontend Supabase pozivi moraju ići kroz proxy.

### Pristup C: CSP + MFA (bez cookie migracije)
- Content-Security-Policy headers blokiraju inline skripte
- MFA (TOTP) kao drugi faktor — čak i sa ukradenim tokenom, treba i kod
- **Ne menja storage mehanizam** — token ostaje u localStorage

**Korist:** Manji refaktor, MFA štiti čak i ako se token kompromituje.
**Mana:** Defense-in-depth ali ne eliminiše root cause.

---

## 4. Odluka: Full httpOnly proxy (postepeno)

### Faza 1: @supabase/ssr migracija
- Instalirati `@supabase/ssr` paket
- Zameniti `createClient` sa `createBrowserClient` u `src/lib/supabase.js`
- Promeniti `getSession()` u `getUser()` u `authStore.js` (server-side validacija)
- Dodati Vercel API route za auth callback (`api/auth/callback.js`)
- Očistiti stare localStorage tokene (jednokrementna migracija)

### Faza 2: Vercel API proxy
- Kreirati API routes za sve Supabase operacije
- Frontend poziva proxy umesto direktno Supabase
- Proxy čita httpOnly cookie i prosleđuje JWT
- Potpuna zaštita od session hijacking

### Nepromenjen pipeline:
| Sistem | Promena? |
|--------|----------|
| Meta sync (Edge Function) | Ne — service_role |
| Google Ads (Apps Script) | Ne — service_role |
| DV360 (Apps Script) | Ne — service_role |
| Gemius (Edge Function) | Ne — service_role |
| Alerts (Edge Function) | Ne — service_role |
| Worker AI (Cloudflare) | Ne — service_role |
| **Frontend dashboard** | **Da — proxy za sb.* pozive** |

---

## 5. Šifre i tokeni — FAQ

**Q: Da li hash-ujemo šifre?**
A: Da. Supabase Auth koristi bcrypt server-side. Plain text šifre se nikad ne čuvaju.

**Q: Cognito?**
A: Ne koristimo AWS Cognito. Koristimo Supabase Auth (GoTrue, open-source).

**Q: Token verification?**
A: JWT tokeni se verifikuju na svakom API pozivu. Supabase server proverava HMAC-SHA256 potpis sa JWT secret-om. RLS politike se primenjuju na osnovu `auth.uid()` iz tokena.

---

## 6. Vizuelni pregled tokova

```
TRENUTNO (localStorage):
  Browser → čita JWT iz localStorage → šalje direktno → Supabase API
  XSS napadač → čita localStorage → krade JWT ❌

SSR (cookie, ali ne httpOnly):
  Browser → čita JWT iz cookie → šalje direktno → Supabase API
  XSS napadač → čita document.cookie → krade JWT ❌

FULL PROXY (httpOnly cookie):
  Browser → šalje cookie automatski → Vercel Proxy → čita JWT → Supabase API
  XSS napadač → ne može čitati httpOnly cookie → blokiran ✅
```

---

## 7. Ključni fajlovi za izmenu

| Fajl | Opis promene |
|------|-------------|
| `src/lib/supabase.js` | `createClient` → `createBrowserClient` |
| `src/stores/authStore.js` | `getSession()` → `getUser()` |
| `src/App.jsx` | Čišćenje starih localStorage tokena |
| `vercel.json` | API rewrite pravila pre SPA catch-all |
| `api/auth/callback.js` | **Nov** — server-side auth callback |
| `api/supabase/*.js` | **Novi** — proxy routes (Faza 2) |
| `package.json` | Dodati `@supabase/ssr` |

---

## 8. Faza 2 — Implementirano

### Vercel API Proxy Routes
Svi frontend Supabase pozivi sada idu kroz `/api/*` proxy. JWT živi u httpOnly cookie.

| Route | Metoda | Opis |
|-------|--------|------|
| `/api/auth/login` | POST | Login, setuje httpOnly cookie |
| `/api/auth/logout` | POST | Logout, briše cookie |
| `/api/auth/user` | GET | Vraća trenutnog korisnika iz cookie |
| `/api/auth/update` | POST | Update password |
| `/api/auth/callback` | GET | PKCE auth code exchange |
| `/api/db` | POST | Generic DB proxy (select/insert/update/delete/upsert) |
| `/api/rpc` | POST | RPC proxy (get_homepage_summary, itd.) |
| `/api/storage` | POST | Storage proxy (upload/signedUrl/remove) |

### Sigurnosne mere u proxy-ju
- **Whitelist tabela:** Samo dozvoljene tabele (ALLOWED_TABLES) mogu biti queryjene
- **Whitelist operacija:** Samo select/insert/update/delete/upsert
- **Whitelist RPC funkcija:** Samo registrovane RPC funkcije
- **Whitelist bucket-ova:** Samo `reports` bucket
- **RLS i dalje aktivan:** Supabase RLS politike se primenjuju na osnovu JWT iz cookie-ja

### Refaktorisani fajlovi
| Fajl | Promena |
|------|---------|
| `src/lib/api.js` | **Nov** — frontend wrapper za sve proxy pozive |
| `src/lib/db.js` | Zamenjeni svi `sb.*` pozivi sa `dbSelect/dbInsert/dbUpdate/dbDelete/dbUpsert/rpcCall` |
| `src/lib/reportStorage.js` | Zamenjeni `sb.storage.*` i `sb.auth.*` sa proxy pozivima |
| `src/stores/authStore.js` | Zamenjeni `sb.auth.*` sa `apiLogin/apiLogout/apiGetUser`. Auth listener prebačen na visibility polling |
| `src/components/auth/SetPassword.jsx` | Zamenjeni `sb.*` pozivi sa proxy |
| `src/components/client/ReportsTab.jsx` | Zamenjeni `sb.*` pozivi sa proxy |
| `src/components/admin/MonitoringPanel.jsx` | Zamenjeni `sb.*` pozivi sa proxy |
| `src/reports/generator.js` | Zamenjeni `sb.*` pozivi sa proxy |

### Rezultat
```
STARO: Browser → čita JWT iz localStorage → šalje direktno → Supabase API
NOVO:  Browser → šalje httpOnly cookie → Vercel API Proxy → čita JWT → Supabase API
       XSS napadač → ne može čitati httpOnly cookie → blokiran ✅
```

## 9. Šta je urađeno (2026-04-02)

### Commits na `security-hardening` branch-u:
1. **a081015** — Glavni commit: Faza 1 + Faza 2 kompletne
   - `@supabase/ssr` dodat u package.json
   - `src/lib/supabase.js` → `createBrowserClient`
   - `src/stores/authStore.js` → `getUser()` + proxy API pozivi
   - `src/lib/db.js` — svih 36 `sb.*` poziva zamenjeno proxy-jem
   - `src/lib/reportStorage.js` — storage i auth pozivi kroz proxy
   - `src/lib/api.js` — **nov** frontend wrapper za sve proxy pozive
   - `src/App.jsx` — localStorage cleanup za stare tokene
   - `src/components/auth/SetPassword.jsx` — proxy
   - `src/components/client/ReportsTab.jsx` — proxy
   - `src/components/admin/MonitoringPanel.jsx` — proxy
   - `src/reports/generator.js` — proxy
   - `api/` direktorijum — svi serverless proxy routes
   - `vercel.json` — API rewrite + installCommand
   - `cyber.md` — ova dokumentacija

2. **e2421cf** — Fix: preimenovani API fajlovi u `.mjs` (ESM kompatibilnost sa commonjs package.json)

3. **541b1b9** — Fix: uklonjen `package-lock.json` iz git-a jer nije sadržao `@supabase/ssr`

### Vercel env vars (postavljeni):
- `SUPABASE_URL` = `https://vorffefuboftlcwteucu.supabase.co`
- `SUPABASE_ANON_KEY` = publishable key (NE service_role!)

### Poznati problemi:
- `package-lock.json` uklonjen iz git-a — Vercel generiše svoj na deploy
- Login **ne radi još** na preview deploy-u — čeka se debug sutra sa pravim Node.js okruženjem
- `src/lib/supabase.js` — zadržan ali nijedan fajl ga ne importuje više

---

## 10. TODO za sutra (drugi računar sa Node.js)

### Korak 1: Sync i install
```bash
cd dashboard-staging
git checkout security-hardening
git pull
npm install
```
Ovo će generisati svež `package-lock.json` sa `@supabase/ssr`.

### Korak 2: Lokalni test
```bash
npx vercel dev
```
**NE `npm run dev`** — Vite dev server ne podržava `api/` serverless routes.
`vercel dev` pokreće i frontend i API routes lokalno.

Testiraj:
- [ ] Login sa email/password
- [ ] Da li se homepage učitava (clienti, budgeti)
- [ ] Da li se ClientDetail učitava (campaign data, charts)
- [ ] Admin panel (korisnici, klijenti, monitoring)
- [ ] Report generacija
- [ ] Logout + ponovo login

### Korak 3: Debug ako login ne radi
Proveri u browser DevTools > Network tab:
- `POST /api/auth/login` — da li vraća 200 ili 500?
- Ako 500: proveri Vercel Function Logs (Vercel Dashboard > Deployments > Functions tab)
- Čest problem: env vars nisu dostupni — proveri da `SUPABASE_URL` i `SUPABASE_ANON_KEY` postoje

### Korak 4: Commit lock fajl
```bash
git add package-lock.json
git commit -m "Add package-lock.json with @supabase/ssr"
git push
```

### Korak 5: Testiranje na Vercel preview
Posle push-a, sačekaj Vercel preview deploy i testiraj iste korake kao lokalno.

### Korak 6: Ako sve radi — merge u main
```bash
git checkout main
git merge security-hardening
git push
```
**PAŽNJA:** Ovo menja produkcioni sajt! Svi korisnici će morati ponovo da se uloguju (tokeni se sele iz localStorage u cookies).

### Korak 7: Čišćenje (posle potvrde da radi)
- [ ] Obriši `src/lib/supabase.js` (nijedan fajl ga ne importuje)
- [ ] Ukloni localStorage cleanup iz `App.jsx` (posle 1-2 nedelje kad svi korisnici migriraju)
- [ ] Razmisli o CSP headers i MFA kao dodatnim slojevima

---

## 11. Otvorena pitanja za budućnost
- [ ] Da li dodajemo CSP headers kao dodatni sloj?
- [ ] Da li dodajemo MFA (TOTP) kao treći sloj?
- [ ] Google Ads API OAuth2 — planirano za sledeću fazu
- [ ] PKCE flow migracija (umesto implicit hash-based flow za invite linkove)
