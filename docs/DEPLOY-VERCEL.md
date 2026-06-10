# Deploy backend TOC su Vercel (accesso da Internet)

Con **Vercel** il backend Next.js (`backend_toc/`) ha:

- URL pubblico tipo `https://gest-squadre-toc.vercel.app`
- **HTTPS** gestito da Vercel (certificato valido, niente self-signed)
- Accesso da **qualsiasi PC/telefono** con rete, non solo dal tuo computer

L’app mobile e il TOC nel browser useranno quell’URL.

---

## 1. Prerequisiti

- Account [vercel.com](https://vercel.com) (piano Hobby va bene per test)
- Progetto **Supabase** gestSQUADRE già attivo (`schema_v1.sql`, realtime, `squad_map_points` se usi waypoint)
- Progetto **Firebase** con app Android `com.ansmi.gest_squadre` e **service account** JSON (per push TOC→cell)
- Codice su **GitHub** (consigliato) oppure deploy con CLI Vercel dalla cartella locale

---

## 2. Carica il progetto su Vercel

### Opzione A — Da GitHub (consigliata)

1. Push della cartella `gestSQUADRE` su un repository GitHub.
2. Vercel → **Add New Project** → importa il repo.
3. Impostazioni build:
   - **Root Directory:** `backend_toc` (importante: non la root del monorepo)
   - **Framework Preset:** Next.js
   - **Build Command:** `npm run build` (default)
   - **Output:** automatico
4. **Deploy** (la prima volta può fallire finché non aggiungi le variabili d’ambiente al passo 3).

### Opzione B — Da PC senza GitHub

```bash
cd backend_toc
npx vercel
```

Segui il wizard (login, nome progetto). Per produzione:

```bash
npx vercel --prod
```

---

## 3. Variabili d’ambiente su Vercel

Vercel → progetto → **Settings** → **Environment Variables** → aggiungi per **Production** (e Preview se vuoi):

| Nome | Valore |
|------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | **stesso URL** dell’app mobile (`dart-defines.json`), es. `https://tdylzdrpmxvftfblvmnu.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | chiave **anon** / `sb_publishable_` dello **stesso** progetto |
| `SUPABASE_URL` | identico a `NEXT_PUBLIC_SUPABASE_URL` |
| `SUPABASE_SERVICE_ROLE_KEY` | chiave **service_role** (Supabase → Settings → API). **Non** la `sb_publishable_` |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | **intero** file JSON del service account Firebase, **una riga** |

### Firebase su Vercel

Su Vercel **non** usare `FIREBASE_SERVICE_ACCOUNT_PATH` (il file sul disco non c’è).

1. Firebase Console → Impostazioni progetto → **Account di servizio** → **Genera nuova chiave privata** → scarica `.json`.
2. Apri il file e copia tutto il JSON.
3. Incollalo in `FIREBASE_SERVICE_ACCOUNT_JSON` (Vercel accetta anche testo multilinea).
4. Non aggiungere altre variabili sulla stessa riga dopo il JSON.

Verifica dopo il deploy:

`https://TUO-PROGETTO.vercel.app/api/push-health`

Deve mostrare `apiVersion: 2`, `firebaseAdmin: true`, `supabaseProject: "tdylzdrpmxvftfblvmnu"` e `fcmTokenRows` ≥ 1 dopo login squadra sul telefono.

---

## 4. Rideploy

Dopo aver salvato le variabili: **Deployments** → ultimo deploy → **Redeploy**.

---

## 5. App mobile — URL TOC pubblico

In `app_mobile/gest_squadre/dart-defines.json`:

```json
"TOC_BACKEND_URL": "https://TUO-PROGETTO.vercel.app"
```

Poi ricompila e reinstalla l’APK (`build-apk.bat` o `flutter build apk`).

Il pulsante **Tactical Operations Center** sul telefono aprirà il TOC su Internet.

---

## 6. Uso quotidiano

| Chi | URL |
|-----|-----|
| TOC da browser (ovunque) | `https://TUO-PROGETTO.vercel.app` |
| Login demo | `TOC01` / `toc123` (cambia in produzione) |
| Mappa / waypoint | stesso dominio |

Sviluppo **solo sul tuo PC** resta opzionale con `npm run dev` (HTTPS locale); per il campo usa Vercel.

---

## 7. Dominio personalizzato (opzionale)

Vercel → **Settings** → **Domains** → aggiungi es. `toc.tuodominio.it`.

Poi aggiorna `TOC_BACKEND_URL` nell’APK con quel dominio.

---

## 8. Limiti da tenere a mente

- Piano **Hobby:** adatto a test ed esercitazioni; per carico alto valuta Pro.
- Le **push FCM** partono dalle API serverless Vercel: servono env Firebase corrette.
- **Supabase Realtime** dal browser Vercel funziona; verifica in Supabase che `squad_sessions`, `squad_alarms`, `squad_map_points` siano in replication.

---

## 9. HTTPS locale vs Vercel

| | `npm run dev` (PC) | Vercel |
|--|-------------------|--------|
| Chi può entrare | Di solito solo rete locale / PC | Tutti con l’URL |
| HTTPS | Self-signed | Certificato valido |
| Uso | Sviluppo | Produzione / campo |

Guida HTTPS solo locale: [HTTPS-BACKEND-TOC.md](./HTTPS-BACKEND-TOC.md).
