@echo off
setlocal
cd /d "%~dp0"

echo ============================================
echo   gestSQUADRE - Backend TOC
echo   Apri nel browser: http://localhost:3000
echo   Login demo: TOC01 / toc123
echo ============================================
echo.

if not exist ".env.local" (
  echo ATTENZIONE: manca .env.local
  echo   copy env.local.template .env.local
  echo   e inserisci Supabase + Firebase service account per push allarme.
  echo.
) else (
  findstr /I "FIREBASE_SERVICE_ACCOUNT" .env.local >nul 2>nul
  if errorlevel 1 (
    echo AVVISO: in .env.local manca FIREBASE_SERVICE_ACCOUNT_PATH o FIREBASE_SERVICE_ACCOUNT_JSON.
    echo   Push allarme disabilitata finche non aggiungi il JSON Firebase Admin.
    echo   Vedi docs\PUSH-TOC-SETUP.md
    echo.
  )
)

call npm run dev

endlocal
