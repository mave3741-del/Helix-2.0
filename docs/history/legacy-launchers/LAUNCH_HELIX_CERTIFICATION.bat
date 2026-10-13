@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

echo ============================================================
echo HELIX Trading Intelligence v0.99.25
echo ONE-CLICK CERTIFICATION
echo ============================================================
echo.

echo [1/4] Preparing project-local Node 22.22.1 / npm 10 runtime...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\bootstrap-certification-runtime.ps1"
if errorlevel 1 goto :bootstrap_fail

set "HELIX_NODE_DIR=%~dp0.helix-runtime\node-v22.22.1-win-x64"
set "HELIX_NODE_EXE=%HELIX_NODE_DIR%\node.exe"
set "HELIX_NPM_CMD=%HELIX_NODE_DIR%\npm.cmd"

if not exist "%HELIX_NODE_EXE%" goto :runtime_fail
if not exist "%HELIX_NPM_CMD%" goto :runtime_fail

rem Force the child certification process to use the project-local runtime.
set "PATH=%HELIX_NODE_DIR%;%PATH%"

for /f "delims=" %%V in ('"%HELIX_NODE_EXE%" --version') do set "HELIX_NODE_VERSION=%%V"
for /f "delims=" %%V in ('call "%HELIX_NPM_CMD%" --version') do set "HELIX_NPM_VERSION=%%V"

echo Project-local Node: !HELIX_NODE_VERSION!
echo Project-local npm : !HELIX_NPM_VERSION!
echo.

if /I not "!HELIX_NODE_VERSION!"=="v22.22.1" goto :runtime_version_fail

for /f "tokens=1,2 delims=." %%A in ("!HELIX_NPM_VERSION!") do set "HELIX_NPM_MAJOR=%%A"
if not "!HELIX_NPM_MAJOR!"=="10" goto :runtime_npm_fail

echo [2/4] Runtime verified.
echo [3/4] Starting strict certification runner...
echo.
call "%~dp0CERTIFY_WINDOWS.bat"
set "RC=%ERRORLEVEL%"

echo.
echo ============================================================
if "%RC%"=="0" (
  echo CERTIFICATION RUN COMPLETED SUCCESSFULLY
  echo ============================================================
  echo.
  echo Evidence: certification-windows-results.txt
  echo.
  pause
  exit /b 0
)

echo CERTIFICATION FAILED OR BLOCKED
echo Exit code: %RC%
echo See certification-windows-results.txt
echo ============================================================
echo.
pause
exit /b %RC%

:bootstrap_fail
echo.
echo ERROR: Could not prepare the local Node 22 runtime.
goto :fail_end

:runtime_fail
echo.
echo ERROR: Project-local Node 22 runtime is missing after bootstrap.
goto :fail_end

:runtime_version_fail
echo.
echo ERROR: Wrong Node version detected. Expected v22.22.1.
goto :fail_end

:runtime_npm_fail
echo.
echo ERROR: Wrong npm major version detected. Expected npm 10.x.
goto :fail_end

:fail_end
echo.
echo Certification was NOT started.
pause
exit /b 1
