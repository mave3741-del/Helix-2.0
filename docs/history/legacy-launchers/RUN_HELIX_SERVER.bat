@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"
set "ROOT=%~dp0"
set "NODE_ENV=development"
set "NPM_CONFIG_PRODUCTION=false"
set "NPM_CONFIG_OMIT="
for /f "delims=" %%P in ('where node.exe 2^>nul') do if not defined NODE_EXE set "NODE_EXE=%%P"
if not defined NODE_EXE (
  echo ERROR: node.exe not found on PATH.
  exit /b 1
)
if not exist "%ROOT%node_modules\vite\bin\vite.js" (
  echo ERROR: Vite is not installed. Run LAUNCH_BROWSER.bat first.
  exit /b 1
)
echo HELIX SERVER - Node !NODE_EXE!
"%NODE_EXE%" "%ROOT%node_modules\vite\bin\vite.js" dev --host 127.0.0.1 --port 8080
set "RC=%ERRORLEVEL%"
echo.
echo HELIX SERVER exited with code %RC%.
exit /b %RC%
