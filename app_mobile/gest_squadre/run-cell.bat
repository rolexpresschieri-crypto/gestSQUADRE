@echo off
setlocal
cd /d "%~dp0"

echo ============================================
echo   gestSQUADRE - Test solo cellulare
echo   (login squadra, GPS, allarme mappa TOC)
echo   Backend TOC web NON richiesto per il test base
echo ============================================
echo.

where flutter >nul 2>nul
if errorlevel 1 (
  echo ERRORE: Flutter non e nel PATH.
  pause
  exit /b 1
)

if not exist "dart-defines.json" (
  echo Manca dart-defines.json in:
  echo   %cd%
  echo.
  echo Copia dart-defines.example.json -^> dart-defines.json
  echo e inserisci SUPABASE_URL e SUPABASE_ANON_KEY ^(progetto Supabase gestSQUADRE^).
  echo.
  pause
  exit /b 1
)

echo Test automatici Dart...
call flutter test
if errorlevel 1 (
  echo I test Dart sono falliti. Correggi prima di run sul telefono.
  pause
  exit /b 1
)

echo.
echo Controllo dispositivi Android...
set "DEVICE_ID="
for /f "usebackq delims=" %%i in (`powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0get-android-device.ps1"`) do set "DEVICE_ID=%%i"

if not defined DEVICE_ID (
  echo.
  echo *** NESSUN TELEFONE/EMULATORE ANDROID RILEVATO ***
  echo.
  echo   A^) Telefono USB: Debug USB ON, autorizza il PC
  echo   B^) Emulatore Android Studio
  echo   C^) APK: build-apk-no-clean.bat
  echo.
  call flutter devices
  echo.
  pause
  exit /b 1
)

echo Android trovato: %DEVICE_ID%
echo Demo login: SQD001 / 1234
echo.
call flutter run -d "%DEVICE_ID%" --dart-define-from-file=dart-defines.json %*

endlocal
