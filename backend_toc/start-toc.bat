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
  echo   copy .env.example .env.local
  echo   e inserisci le chiavi Supabase.
  echo.
)

call npm run dev

endlocal
