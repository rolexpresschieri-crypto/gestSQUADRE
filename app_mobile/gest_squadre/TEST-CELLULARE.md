# Test solo cellulare (gestSQUADRE)

Senza aprire il backend TOC sul PC puoi verificare l’app squadra se hai **Supabase** configurato.

## Prerequisiti (una tantum)

1. Progetto Supabase **gestSQUADRE** con `sql/schema_v1.sql` eseguito.
2. Replication attiva su `squad_sessions` e `squad_alarms` (per il rosso TOC, non serve per il test cell base).
3. File `dart-defines.json` (copia da `dart-defines.example.json`) con almeno:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
4. Telefono Android con **debug USB** oppure emulatore avviato.

## Avvio rapido

```bat
cd app_mobile\gest_squadre
run-cell.bat
```

Lo script esegue `flutter test` poi `flutter run` sul dispositivo.

## Checklist test sul telefono

| # | Azione | Esito atteso |
|---|--------|----------------|
| 1 | Apri app | Home **Tracking SQUADRE**, sfondo mimetico |
| 2 | Log-in → SQD001 / 1234 | Box verde con nome squadra e ora |
| 3 | Attendi ~30 s (GPS) | Nessun errore; posizione aggiornata su DB |
| 4 | **Segnala ALLARME (mappa TOC)** → Conferma | Messaggio “Segnalazione inviata…” |
| 5 | Log-out | “Nessuna squadra loggata” |

Per vedere il **cerchio rosso** serve il TOC web con la stessa Supabase; il pulsante allarme dal cell funziona comunque (riga in `squad_alarms`).

## Build APK

```bat
build-apk.bat
```

Genera:

- `build\app\outputs\flutter-apk\app-release.apk`
- `build\app\outputs\flutter-apk\gestSQUADRE_1.0.xx.apk` (xx = terzo numero in `pubspec.yaml`, es. `1.0.0` → `gestSQUADRE_1.0.0.apk`)

Versione: modifica `version: 1.0.xx+N` in `pubspec.yaml` prima del build.

Build più veloce (senza `flutter clean`):

```bat
build-apk-no-clean.bat
```

## Credenziali demo

- Squadra: **SQD001** / **1234**
- Squadra: **SQD002** / **1234**
