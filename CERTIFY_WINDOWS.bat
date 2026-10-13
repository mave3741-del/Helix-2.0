@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

rem Always prefer the project-local Node 22 runtime when present.
set "HELIX_NODE_DIR=%~dp0.helix-runtime\node-v22.22.1-win-x64"
set "HELIX_NODE_EXE=%HELIX_NODE_DIR%\node.exe"
set "HELIX_NPM_CMD=%HELIX_NODE_DIR%\npm.cmd"

if not exist "%HELIX_NODE_EXE%" (
  echo Project-local Node runtime missing. Bootstrapping it now...
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\bootstrap-certification-runtime.ps1"
  if errorlevel 1 (
    echo ERROR: Could not bootstrap the project-local Node runtime.
    exit /b 1
  )
)

if not exist "%HELIX_NODE_EXE%" (
  echo ERROR: Project-local Node executable not found.
  exit /b 1
)
if not exist "%HELIX_NPM_CMD%" (
  echo ERROR: Project-local npm executable not found.
  exit /b 1
)

set "PATH=%HELIX_NODE_DIR%;%PATH%"

for /f "delims=" %%V in ('"%HELIX_NODE_EXE%" --version') do set "HELIX_NODE_VERSION=%%V"
for /f "delims=" %%V in ('call "%HELIX_NPM_CMD%" --version') do set "HELIX_NPM_VERSION=%%V"

echo Using project-local Node !HELIX_NODE_VERSION! / npm !HELIX_NPM_VERSION!
if /I not "!HELIX_NODE_VERSION!"=="v22.22.1" (
  echo ERROR: Wrong Node version. Expected v22.22.1.
  exit /b 1
)
for /f "tokens=1,2 delims=." %%A in ("!HELIX_NPM_VERSION!") do set "HELIX_NPM_MAJOR=%%A"
if not "!HELIX_NPM_MAJOR!"=="10" (
  echo ERROR: Wrong npm major version. Expected npm 10.x.
  exit /b 1
)

set "OUT=certification-windows-results.txt"
set "FAILS=0"
set "TOTAL=0"
> "%OUT%" echo HELIX Windows Certification Run - %DATE% %TIME%
>>"%OUT%" echo Version: v0.99.25
>>"%OUT%" echo Host: %COMPUTERNAME%
>>"%OUT%" echo User: %USERNAME%
>>"%OUT%" echo Runtime Node: !HELIX_NODE_VERSION!
>>"%OUT%" echo Runtime npm: !HELIX_NPM_VERSION!
>>"%OUT%" echo.

call :run "node --version"
call :run "npm --version"
call :run "npm ci --no-audit --no-fund"
call :run "npm run dependency:integrity"
call :run "npm run ci:environment"
call :run "npm run release:integrity"
call :run "npm run migration:integrity"
call :run "npm run test:coverage-integrity"
call :run "npm run phase8:final"
call :run "npm run check:auth"
call :run "npm run typecheck"
call :run "npm run lint"
call :run "npm test"
call :run "npm run db:smoke"
call :run "npm run build"
call :run "npm run phase9:postgres-preflight"
call :run "npm run phase9:preflight"

>>"%OUT%" echo.
>>"%OUT%" echo ============================================================
>>"%OUT%" echo CERTIFICATION SUMMARY
>>"%OUT%" echo Required checks: !TOTAL!
>>"%OUT%" echo Failed checks: !FAILS!
if !FAILS! EQU 0 (
  >>"%OUT%" echo RESULT: PASS
  echo.
  echo RESULT: PASS
  echo Results saved to %OUT%
  exit /b 0
) else (
  >>"%OUT%" echo RESULT: FAIL
  echo.
  echo RESULT: FAIL - !FAILS! required check(s) failed
  echo Results saved to %OUT%
  exit /b 1
)

:run
set /a TOTAL+=1
set "CMD=%~1"
>>"%OUT%" echo ============================================================
>>"%OUT%" echo COMMAND: %CMD%
%CMD% >>"%OUT%" 2>&1
set "RC=%ERRORLEVEL%"
>>"%OUT%" echo RC: %RC%
echo [%RC%] %CMD%
if not "%RC%"=="0" set /a FAILS+=1
exit /b 0
