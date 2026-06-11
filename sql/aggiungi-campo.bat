@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

echo.
echo  gestSQUADRE - Aggiungi nuovo campo (golf_courses + toc_admins)
echo  ==============================================================
echo  Genera un file .sql da eseguire in Supabase -^> SQL Editor.
echo  Solo TOC01 resta globale; ogni altro login deve avere un campo.
echo.

if not "%~5"=="" (
  set "COURSE_CODE=%~1"
  set "COURSE_NAME=%~2"
  set "ADMIN_CODE=%~3"
  set "ADMIN_NAME=%~4"
  set "ADMIN_PASSWORD=%~5"
  set "ADMIN_ROLE=%~6"
  if "!ADMIN_ROLE!"=="" set "ADMIN_ROLE=admin"
  goto :validate
)

set /p COURSE_CODE="Codice campo (es. k9_nvansmi): "
set /p COURSE_NAME="Nome campo (es. Cinofili NVANSMI): "
set /p ADMIN_CODE="Codice login TOC (es. K9_NVANSMI): "
set /p ADMIN_NAME="Nome operatore (es. Cinofili NVANSMI): "
set /p ADMIN_PASSWORD="Password login TOC: "
set /p ADMIN_ROLE="Ruolo [admin/campo] (Invio=admin): "
if "%ADMIN_ROLE%"=="" set "ADMIN_ROLE=admin"

:validate
if "%COURSE_CODE%"=="" goto :usage
if "%COURSE_NAME%"=="" goto :usage
if "%ADMIN_CODE%"=="" goto :usage
if "%ADMIN_NAME%"=="" goto :usage
if "%ADMIN_PASSWORD%"=="" goto :usage

rem Normalizza
for /f "delims=" %%a in ("%COURSE_CODE%") do set "COURSE_CODE=%%a"
for /f "delims=" %%a in ("%ADMIN_CODE%") do set "ADMIN_CODE=%%a"
set "COURSE_CODE=!COURSE_CODE: =_!"
set "ADMIN_CODE=!ADMIN_CODE: =!"

set "ADMIN_ROLE=!ADMIN_ROLE:"=!"
if /i not "!ADMIN_ROLE!"=="admin" if /i not "!ADMIN_ROLE!"=="campo" (
  echo ERRORE: ruolo deve essere admin o campo ^(ricevuto: !ADMIN_ROLE!^).
  exit /b 1
)

if not exist "generated" mkdir "generated"

set "STAMP=%date:~-4%%date:~3,2%%date:~0,2%_%time:~0,2%%time:~3,2%%time:~6,2%"
set "STAMP=!STAMP: =0!"
set "OUT=generated\campo_!COURSE_CODE!_!STAMP!.sql"

call :escape "!COURSE_NAME!" ESC_COURSE_NAME
call :escape "!ADMIN_NAME!" ESC_ADMIN_NAME
call :escape "!ADMIN_PASSWORD!" ESC_PASSWORD

> "!OUT!" (
  echo -- Generato da aggiungi-campo.bat
  echo -- Campo: !ESC_COURSE_NAME! ^(!COURSE_CODE!^)
  echo -- Login TOC: !ADMIN_CODE! / ^(password impostata^)
  echo.
  type aggiungi_campo_template.sql
)

powershell -NoProfile -Command ^
  "$p='%OUT%';" ^
  "$t=[IO.File]::ReadAllText($p);" ^
  "$t=$t.Replace('__COURSE_CODE__','%COURSE_CODE%');" ^
  "$t=$t.Replace('__COURSE_NAME__','%ESC_COURSE_NAME%');" ^
  "$t=$t.Replace('__ADMIN_CODE__','%ADMIN_CODE%');" ^
  "$t=$t.Replace('__ADMIN_NAME__','%ESC_ADMIN_NAME%');" ^
  "$t=$t.Replace('__PASSWORD__','%ESC_PASSWORD%');" ^
  "$t=$t.Replace('__ROLE__','%ADMIN_ROLE%');" ^
  "[IO.File]::WriteAllText($p,$t);"

if errorlevel 1 (
  echo ERRORE: sostituzione placeholder fallita.
  exit /b 1
)

echo.
echo OK: creato
echo   %OUT%
echo.
echo Prossimi passi:
echo   1. Apri Supabase -^> SQL Editor
echo   2. Incolla ed esegui il file sopra
echo   3. Login TOC con %ADMIN_CODE%
echo   4. Aggiungi squadre/waypoint con golf_course_id = %COURSE_CODE%
echo.
set /p OPEN="Aprire il file SQL ora? [S/N]: "
if /i "!OPEN!"=="S" start "" "!OUT!"
exit /b 0

:escape
set "RAW=%~1"
set "OUT_VAR=%~2"
set "ESC=!RAW:'=''!"
set "%OUT_VAR%=%ESC%"
exit /b 0

:usage
echo.
echo Uso interattivo:
echo   aggiungi-campo.bat
echo.
echo Uso con parametri:
echo   aggiungi-campo.bat ^<course_code^> ^"Nome campo^" ^<ADMIN_CODE^> ^"Nome admin^" ^<password^> [admin^|campo]
echo.
echo Esempio:
echo   aggiungi-campo.bat k9_nvansmi "Cinofili NVANSMI" K9_NVANSMI "Cinofili NVANSMI" 1234 admin
echo.
exit /b 1
