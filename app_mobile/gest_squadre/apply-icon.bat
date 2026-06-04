@echo off
setlocal
cd /d "%~dp0"

set "SRC=%~dp0..\..\ChatGPT Image 4 giu 2026, 13_44_56.png"
if not exist "%SRC%" (
  echo Icona non trovata:
  echo   %SRC%
  echo Metti il PNG nella cartella gestSQUADRE ^(root^) oppure aggiorna il percorso in apply-icon.bat
  pause
  exit /b 1
)

copy /Y "%SRC%" "%~dp0assets\app_icon.png"
echo Copiato in assets\app_icon.png

call flutter pub get
if errorlevel 1 exit /b 1

call dart run flutter_launcher_icons
if errorlevel 1 (
  echo flutter_launcher_icons fallito.
  pause
  exit /b 1
)

echo Icona launcher Android aggiornata. Ricompila APK con build-apk-no-clean.bat
pause
endlocal
