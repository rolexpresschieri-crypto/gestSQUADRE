@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo.
echo  gestSQUADRE - Import vie .trk (Garmin/TwoNav) su map_routes
echo  =============================================================
echo.

if "%~2"=="" goto :usage

set "COURSE_CODE=%~1"
set "TRK_DIR=%~2"
if not exist "%TRK_DIR%" (
  echo ERRORE: cartella non trovata: %TRK_DIR%
  exit /b 1
)

if not exist "generated" mkdir "generated"
set "STAMP=%date:~-4%%date:~3,2%%date:~0,2%_%time:~0,2%%time:~3,2%%time:~6,2%"
set "STAMP=%STAMP: =0%"
set "OUT=generated\import_routes_%COURSE_CODE%_%STAMP%.sql"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0import-trk-batch.ps1" -CourseCode "%COURSE_CODE%" -TrkDir "%TRK_DIR%" -OutFile "%OUT%"
if errorlevel 1 exit /b 1

echo.
echo OK: %OUT%
echo Esegui prima map_routes.sql poi questo file su Supabase.
set /p OPEN="Aprire il file SQL? [S/N]: "
if /i "%OPEN%"=="S" start "" "%OUT%"
exit /b 0

:usage
echo Uso:
echo   import-trk.bat ^<course_code^> ^<cartella_con_trk^>
echo.
echo Esempio (vie test Golf Torino):
echo   import-trk.bat golf_torino C:\Users\rronc\gestSQUADRE
echo.
echo Prefissi vie:
echo   golf_torino  -^> GT_V_01, GT_V_02, ...
echo   k9_nvansmi   -^> K9_NVANSMI_V_01, ...
exit /b 1
