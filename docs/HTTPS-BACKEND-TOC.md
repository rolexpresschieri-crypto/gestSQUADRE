# Backend TOC su HTTPS (solo sviluppo sul tuo PC)

> **Per entrare al TOC da qualsiasi rete (non solo dal tuo computer)** usa il deploy su **Vercel**: [DEPLOY-VERCEL.md](./DEPLOY-VERCEL.md).

Il backend Next.js (`backend_toc/`) può girare in **HTTPS** in sviluppo e in produzione locale.

## Sviluppo (consigliato)

```bash
cd backend_toc
npm run dev
```

- URL: **https://localhost:3000**
- Alla prima esecuzione Next crea i certificati in `backend_toc/certificates/` (`localhost.pem`, `localhost-key.pem`).
- Il browser può chiedere di accettare il certificato self-signed (normale in locale).

Solo HTTP (senza HTTPS):

```bash
npm run dev:http
```

## Produzione locale con HTTPS

```bash
cd backend_toc
npm run build
npm run start:https
```

Richiede i file in `certificates/` (generati almeno una volta con `npm run dev`).

## Telefono / rete LAN

1. Sul PC: `npm run dev` (ascolta su `0.0.0.0` di default).
2. Trova l’IP del PC (es. `192.168.1.10`).
3. Sul telefono apri **https://192.168.1.10:3000** e accetta l’avviso sul certificato.
4. In `app_mobile/gest_squadre/dart-defines.json` imposta ad esempio:
   ```json
   "TOC_BACKEND_URL": "https://192.168.1.10:3000"
   ```
5. Ricompila l’app.

Emulatore Android: spesso `https://10.0.2.2:3000` (stesso host del PC).

## Deploy reale (server / dominio)

In produzione su un dominio pubblico usa di solito:

- **Reverse proxy** (nginx, Caddy, Traefik) con certificato Let’s Encrypt, oppure
- Hosting che fornisce HTTPS (Vercel, ecc.).

`npm run start` resta in HTTP dietro al proxy; il proxy termina TLS.

## Note

- I file `*.pem` in `certificates/` non vanno in git (già in `.gitignore`).
- Supabase e Firebase non cambiano: restano su `https://...supabase.co` e Firebase.
