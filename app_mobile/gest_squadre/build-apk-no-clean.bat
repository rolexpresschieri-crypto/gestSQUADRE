@echo off
setlocal
cd /d "%~dp0"

echo ============================================
echo   gestSQUADRE - APK Release (senza clean)
echo ============================================
echo.

where flutter >nul 2>nul
if errorlevel 1 (
  echo ERRORE: Flutter non e nel PATH.
  pause
  exit /b 1
)

call flutter pub get
if errorlevel 1 (
  pause
  exit /b 1
)

set "DEFARGS="
if exist "%cd%\dart-defines.json" (
  set "DEFARGS=--dart-define-from-file=%cd%\dart-defines.json"
) else (
  echo Avviso: manca dart-defines.json
)

call flutter build apk --release %DEFARGS%
if errorlevel 1 (
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0copy-apk-gest-name.ps1"
echo Fatto.
pause
endlocal
