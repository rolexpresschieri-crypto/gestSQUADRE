@echo off
setlocal
cd /d "%~dp0"

echo ============================================
echo   gestSQUADRE (Flutter) - APK Release
echo   Cartella: %cd%
echo   Output: gestSQUADRE_1.0.xx.apk
echo   Build veloce senza clean: build-apk-no-clean.bat
echo ============================================
echo.

where flutter >nul 2>nul
if errorlevel 1 (
  echo ERRORE: Flutter non e nel PATH.
  pause
  exit /b 1
)

echo Pulizia + dipendenze + build release...
echo Se "Failed to remove build": chiudi IDE, Esplora file su build, emulatori.
echo.
call flutter clean
echo.
call flutter pub get
if errorlevel 1 (
  echo flutter pub get fallito.
  pause
  exit /b 1
)

set "DEFARGS="
if exist "%cd%\dart-defines.json" (
  set "DEFARGS=--dart-define-from-file=%cd%\dart-defines.json"
  echo Trovato dart-defines.json: Supabase incluso nell APK.
  echo Per push TOC aggiungi FIREBASE_ANDROID_* nello stesso file.
) else (
  echo.
  echo *** Senza dart-defines.json l APK non collega Supabase ***
  echo Copia dart-defines.example.json in dart-defines.json
  echo.
)

call flutter build apk --release %DEFARGS%
if errorlevel 1 (
  echo BUILD FALLITO.
  pause
  exit /b 1
)

echo.
echo ============================================
echo   APK release:
echo   %cd%\build\app\outputs\flutter-apk\app-release.apk
echo ============================================
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0copy-apk-gest-name.ps1"
echo.
echo Installa gestSQUADRE_1.0.xx.apk sul telefono ^(origini sconosciute se richiesto^).
echo.
pause
endlocal
