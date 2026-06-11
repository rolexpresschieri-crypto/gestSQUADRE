@echo off
setlocal EnableExtensions
cd /d "%~dp0"

set "MODE=build"
set "CLEAN_FIRST=0"
if /i "%~1"=="install" set "MODE=install"
if /i "%~1"=="run" set "MODE=install"
if /i "%~1"=="rebuild" set "CLEAN_FIRST=1"
if /i "%~2"=="rebuild" set "CLEAN_FIRST=1"
if /i "%~1"=="rebuild" if /i "%~2"=="install" set "MODE=install"
if /i "%~2"=="install" set "MODE=install"

echo ============================================
echo   gestSQUADRE KMP - build dev
echo   App operativa (Flutter in dismissione)
echo   Package: com.ansmi.gest_squadre (Firebase gestSQUADRE)
echo ============================================
echo.

if not exist "gradlew.bat" (
  echo ERRORE: gradlew.bat non trovato in %cd%
  pause
  exit /b 1
)

set "DEFINES=..\gest_squadre\dart-defines.json"
if not exist "%DEFINES%" (
  echo ERRORE: manca %DEFINES%
  echo Copia dart-defines.example.json in gest_squadre\dart-defines.json
  pause
  exit /b 1
)
echo OK: Supabase da gest_squadre\dart-defines.json
echo.

set "FLUTTER_LOCAL=..\gest_squadre\android\local.properties"
if not exist "local.properties" (
  if exist "%FLUTTER_LOCAL%" (
    copy /Y "%FLUTTER_LOCAL%" "local.properties" >nul
    echo OK: local.properties copiato da Flutter Android.
  ) else (
    echo AVVISO: manca local.properties ^(SDK Android^).
    echo Apri il progetto in Android Studio oppure copia local.properties da gest_squadre\android\
  )
)
echo.

if "%CLEAN_FIRST%"=="1" (
  echo Ricompilazione completa ^(clean^)...
  call gradlew.bat clean :androidApp:assembleDebug --no-daemon
) else (
  echo Compilazione :androidApp:assembleDebug ...
  echo Se l APK resta vecchia: kmp-dev.bat rebuild
  call gradlew.bat :androidApp:assembleDebug --rerun-tasks --no-daemon
)
if errorlevel 1 (
  echo.
  echo BUILD KMP FALLITO.
  pause
  exit /b 1
)

set "APK=androidApp\build\outputs\apk\debug\androidApp-debug.apk"
if not exist "%APK%" (
  echo ERRORE: APK non trovato: %APK%
  pause
  exit /b 1
)

set "KMP_VER="
for /f "usebackq tokens=2 delims==" %%a in (`findstr /c:"versionName" androidApp\build.gradle.kts`) do set "KMP_VER=%%a"
set "KMP_VER=%KMP_VER:"=%"
set "KMP_VER=%KMP_VER: =%"
if not defined KMP_VER set "KMP_VER=1.0.0"

set "APK_EASY=%~dp0gestSQUADRE_KMP_dev_%KMP_VER%.apk"
copy /Y "%APK%" "%APK_EASY%" >nul
if errorlevel 1 (
  echo AVVISO: copia facile non riuscita, usa il percorso build sotto.
) else (
  echo Copia facile: %APK_EASY%
)

echo.
for %%T in ("%APK%") do set "APK_TIME=%%~tT"
echo ============================================
echo   BUILD OK  -  APK aggiornata: %APK_TIME%
echo   %cd%\%APK%
if exist "%APK_EASY%" echo   %APK_EASY%
echo ============================================
echo.

if /i not "%MODE%"=="install" (
  echo Sul telefono: kmp-dev.bat install rebuild   ^(build pulito + install, tutto in uno^)
  echo            oppure kmp-dev.bat rebuild  poi  kmp-dev.bat install
  echo.
  if exist "%APK_EASY%" (
    explorer /select,"%APK_EASY%"
  ) else (
    explorer /select,"%cd%\%APK%"
  )
  pause
  exit /b 0
)

where adb >nul 2>nul
if errorlevel 1 (
  echo ERRORE: adb non nel PATH. Installa Android platform-tools.
  pause
  exit /b 1
)

set "DEVICE_ID="
for /f "usebackq delims=" %%i in (`powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0..\gest_squadre\get-android-device.ps1"`) do set "DEVICE_ID=%%i"

if not defined DEVICE_ID (
  echo *** NESSUN TELEFONE ANDROID RILEVATO ***
  echo Collega USB con debug USB oppure avvia un emulatore.
  adb devices
  pause
  exit /b 1
)

echo Installazione su %DEVICE_ID% ...
adb -s "%DEVICE_ID%" install -r "%APK%"
if errorlevel 1 (
  echo Installazione fallita.
  pause
  exit /b 1
)

echo.
echo App gestSQUADRE installata (KMP, package com.ansmi.gest_squadre).
echo Login test: SQD001 / 1234
echo Disinstalla eventuale vecchia app com.ansmi.gestsquadre.kmp o Flutter.
echo.
pause
endlocal
