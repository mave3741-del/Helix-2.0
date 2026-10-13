@echo off
setlocal
cd /d "%~dp0"

where npm.cmd >nul 2>&1
if errorlevel 1 (
  echo Node.js is required. Install it from https://nodejs.org then run this again.
  pause
  exit /b 1
)

call npm run setup
if errorlevel 1 (
  pause
  exit /b 1
)

echo.
echo Starting HELIX. Open http://localhost:8080 in your browser.
echo Press Ctrl+C to stop.
echo (Want it as a desktop app instead of a browser tab? Run desktop.bat)
echo.
call npm run dev
set "RC=%ERRORLEVEL%"
if not "%RC%"=="0" pause
endlocal & exit /b %RC%
