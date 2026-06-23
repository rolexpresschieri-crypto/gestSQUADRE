# Installazione gestSQUADRE su iPhone (senza cavo Mac)

Guida operativa dopo test su iPhone 12 (iOS aggiornata, installazione via Diawi / IPA ad-hoc).

> Versione PDF: `INSTALL-IOS-IPHONE.pdf` (rigenera con `python3 docs/generate-install-ios-pdf.py`)

---

## Cosa ti serve

| Requisito | Perché |
|-----------|--------|
| Account **Apple Developer a pagamento** (99 €/anno) | IPA ad-hoc e profili multi-dispositivo |
| **Mac** (solo per generare l'IPA) | Il telefono non deve essere collegato al Mac |
| Elenco **UDID** di tutti gli iPhone tester | Firma ad-hoc |
| Link **Diawi** (o equivalente) | Installazione da Safari |

Bundle app: **`com.ansmi.gestsquadre`**

---

## Parte 1 — Raccogliere l'UDID (ogni iPhone)

L'UDID identifica il telefono in modo univoco. **Senza UDID registrato**, l'installazione fallisce con errore tipo *«impossibile verificarne l'integrità»*.

### Metodo A — Safari sul telefono (consigliato, senza Mac)

1. Sul **Safari** dell'iPhone apri: [https://udid.tech/](https://udid.tech/)
2. Segui i passi (installa profilo temporaneo → **Consenti**)
3. Copia l'**UDID** (es. `00008030-001A4D2E3CXXXXX`)
4. Invialo a te stesso (email / WhatsApp) con il **nome** del telefono (es. «iPhone 12 Mario»)

> Usa **Safari**, non Chrome.

### Metodo B — PC Windows + iTunes

1. Collega iPhone al PC
2. iTunes → icona dispositivo → **Numero di serie** (clic per vedere **UDID**)
3. Copia l'UDID

### Metodo C — Mac + Xcode (se hai cavo)

1. Xcode → **Window → Devices and Simulators**
2. Seleziona l'iPhone → **Identifier** = UDID

---

## Parte 2 — Registrare i dispositivi (una volta, tutti insieme)

**Conviene registrare tutti gli UDID prima di generare l'IPA** → **una sola IPA** per tutti i telefoni elencati.

1. [developer.apple.com](https://developer.apple.com) → login
2. **Account → Devices → +**
3. Tipo: **iPhone** (o iPad)
4. Nome descrittivo + **UDID**
5. Ripeti per **ogni** telefono tester

Limite: **100 dispositivi / anno** (account a pagamento).

Se aggiungi un **nuovo** telefono **dopo** aver buildato l'IPA → registra UDID → **rigenera IPA** sul Mac.

---

## Parte 3 — Generare l'IPA sul Mac

```bash
cd ~/Desktop/Sviluppo/gestSQUADRE/app_mobile/kmp
./kmp-dev.sh ios-ipa-adhoc
```

Output:

```
app_mobile/kmp/gestSQUADRE_iOS_1.0.2.ipa
```

Verifica in fondo alla home dell'app (build debug): etichetta tipo **`iOS 1.0.2 (5)`** — il numero tra parentesi è il build.

---

## Parte 4 — Checklist **prima** dell'installazione (su ogni iPhone)

| # | Impostazione | Dove | Valore |
|---|--------------|------|--------|
| 1 | iOS | — | **16 o superiore** |
| 2 | Servizi di localizzazione | Impostazioni → Privacy → Localizzazione | **ON** |
| 3 | Rete | — | Wi‑Fi o 4G/5G stabile |
| 4 | Spazio libero | — | almeno ~50 MB |

Non serve aver collegato l'iPhone al Mac.

---

## Parte 5 — Installare da Diawi

1. Carica `gestSQUADRE_iOS_1.0.2.ipa` su [diawi.com](https://www.diawi.com)
2. Apri il link **da Safari** sull'iPhone
3. **Installa**
4. Se compare errore *integrità* / *verifica* → UDID **non** nel profilo: torna a Parte 2 + rigenera IPA (Parte 3)

---

## Parte 6 — Checklist **dopo** l'installazione (su ogni iPhone)

### 6.1 Modalità sviluppatore (iOS 16+)

1. Dopo il primo tentativo di installazione, vai in **Impostazioni → Privacy e sicurezza**
2. In fondo: **Modalità sviluppatore** → **Attiva**
3. Inserisci codice iPhone → **Riavvia** se richiesto
4. Dopo riavvio: riattiva **Modalità sviluppatore**

Se la voce non compare: reinstalla da Safari e riprova.

### 6.2 Fidati del profilo sviluppatore

**Impostazioni → Generali → VPN e gestione dispositivo**  
→ seleziona profilo **gestSQUADRE** / developer → **Fidati**

### 6.3 Posizione (obbligatoria per mappa TOC)

**Impostazioni → gestSQUADRE → Posizione**

| Opzione | Valore |
|---------|--------|
| Autorizzazione | **Durante l'uso dell'app** |
| Posizione precisa | **ON** (se presente) |

### 6.4 Notifiche (per push TOC)

**Impostazioni → gestSQUADRE → Notifiche** → **Consenti**

Senza notifiche il **pannello blu** in app può comunque funzionare; il banner di sistema no.

---

## Parte 7 — Verifica in app (dopo login)

Apri **gestSQUADRE** → login squadra.

| Controllo | Esito atteso |
|-----------|--------------|
| Box squadra verde | Nome squadra + ora login |
| Riga GPS | Prima «GPS: in attesa di fix…», poi **«GPS inviato al TOC · precisione ± X m»** |
| App **aperta** in primo piano | GPS iOS invia solo a app aperta (non in background) |
| TOC [gest-squadre.vercel.app](https://gest-squadre.vercel.app) | Log **login** + pallino su **mappa** (dopo GPS inviato) |
| Lista allarme | Sanitario, Security, Vigili del Fuoco, Strutture, Altro |

### GPS lento o «in attesa di fix»

- Resta **all'aperto** o vicino a **finestra**
- Tieni l'app **aperta** 1–2 minuti
- Non bloccare lo schermo subito

### Login OK ma niente sulla mappa

- Aspetta **«GPS inviato al TOC»**
- Sul TOC: **Ricentra mappa**
- Verifica stesso **campo** del login TOC (es. GOLF_TORINO)

---

## Parte 8 — Problemi frequenti

| Sintomo | Causa probabile | Cosa fare |
|---------|-----------------|-----------|
| *Impossibile verificarne l'integrità* | UDID non nel profilo IPA | Registra UDID → **nuova IPA** |
| App sembra sloggata, TOC vede ancora online | Bug iOS sessione (build < 5) | Logout da TOC → login; usa **build 5+** |
| Push non arriva | APNs non in Firebase | Vedi `docs/PUSH-IOS-SETUP.md` |
| «Squadra già attiva» al login | Sessione fantasma online | Logout squadra **dal TOC** → riprova |
| Solo log login, no mappa | GPS non ancora inviato | Permesso posizione + attesa fix |

---

## Parte 9 — Quando rigenerare l'IPA

| Situazione | Nuova IPA? |
|------------|------------|
| Nuovo iPhone (nuovo UDID) | **Sì** (dopo registrazione UDID) |
| Fix app / nuovo build | **Sì** |
| Stessi telefoni, stessa versione | **No** — stesso file per tutti |

---

## Riepilogo flusso consigliato

```
1. Raccogli UDID di TUTTI gli iPhone (Safari → udid.tech)
2. Registra tutti su developer.apple.com → Devices
3. Mac: ./kmp-dev.sh ios-ipa-adhoc  (una volta)
4. Diawi → link → Safari su ogni iPhone
5. Modalità sviluppatore + Fidati profilo
6. Posizione + Notifiche per gestSQUADRE
7. Login → attendi GPS → verifica mappa TOC
```

---

## Link utili

- TOC produzione: [https://gest-squadre.vercel.app](https://gest-squadre.vercel.app)
- Push iOS / Firebase: `docs/PUSH-IOS-SETUP.md`
- Deploy backend: `docs/DEPLOY-VERCEL.md`
