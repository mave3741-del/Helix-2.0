@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"
set "PORT=8080"
set "HOST=127.0.0.1"
set "LOG=%~dp0.helix-browser.log"
set "NODE_OPTIONS="
set "NODE_ENV=development"
set "NPM_CONFIG_PRODUCTION=false"
set "NPM_CONFIG_OMIT="

echo.
echo ================================================
echo        HELIX BROWSER LAUNCHER v0.99.25
echo ================================================
echo.

rem Resolve the actual installed Windows executables. Do not invoke node_modules/npm.
for /f "delims=" %%I in ('where npm.cmd 2^>nul') do if not defined NPMCMD set "NPMCMD=%%I"
if not defined NPMCMD (
  echo ERROR: npm.cmd not found on PATH.
  pause
  exit /b 1
)
for /f "delims=" %%I in ('where node.exe 2^>nul') do if not defined NODECMD set "NODECMD=%%I"
if not defined NODECMD (
  echo ERROR: node.exe not found on PATH.
  pause
  exit /b 1
)
for /f "delims=" %%I in ('"%NODECMD%" -v') do set "NODEVER=%%I"
for /f "delims=" %%I in ('"%NPMCMD%" -v') do set "NPMVER=%%I"
echo Using Node %NODEVER% / npm %NPMVER%

echo.
echo [1/4] Checking port %PORT%...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$conns=Get-NetTCPConnection -LocalPort %PORT% -State Listen -ErrorAction SilentlyContinue; if(-not $conns){exit 0}; foreach($c in $conns){$p=Get-CimInstance Win32_Process -Filter ('ProcessId='+$c.OwningProcess) -ErrorAction SilentlyContinue; $cmd=if($p){$p.CommandLine}else{''}; Write-Host ('Port %PORT% PID '+$c.OwningProcess+': '+$cmd); if(($cmd -match 'vite') -or ($cmd -match 'HELIX') -or ($cmd -match [regex]::Escape($PWD))){Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue; Write-Host ('Stopped stale HELIX process PID '+$c.OwningProcess)} else {Write-Host 'PORT_IN_USE_BY_OTHER_PROCESS'; exit 42}}"
if errorlevel 42 (
  echo ERROR: Port %PORT% is occupied by another application. Close it or change HELIX port.
  pause
  exit /b 1
)
if errorlevel 1 echo Warning: could not inspect/clean port. Continuing.

if not exist "node_modules\vite\bin\vite.js" (
  echo.
  echo [2/4] Installing HELIX devDependencies...
  call "%NPMCMD%" ci --include=dev --no-audit --no-fund --engine-strict=false
  if errorlevel 1 (
    echo ERROR: Dependency installation failed.
    pause
    exit /b 1
  )
) else (
  echo.
  echo [2/4] Vite dependency present.
)

echo.
echo [3/4] Starting CURRENT HELIX server...
if exist "%LOG%" del /q "%LOG%" >nul 2>&1
rem IMPORTANT: use START /D + %ComSpec% /K; do not embed escaped quotes inside a /K command.
start "HELIX SERVER" /D "%~dp0" "%ComSpec%" /K call "%~dp0RUN_HELIX_SERVER.bat"

set /a tries=0
:waitloop
set /a tries+=1
powershell -NoProfile -ExecutionPolicy Bypass -Command "try{$r=Invoke-WebRequest -UseBasicParsing -Uri 'http://%HOST%:%PORT%/' -TimeoutSec 2; if($r.StatusCode -ge 200 -and $r.StatusCode -lt 500){exit 0}else{exit 1}}catch{exit 1}"
if not errorlevel 1 goto ready
if %tries% GEQ 120 goto failed
timeout /t 1 /nobreak >nul
goto waitloop

:ready
echo.
echo [4/4] HELIX is READY.
echo Opening http://%HOST%:%PORT% ...
start "" "http://%HOST%:%PORT%/"
echo.
echo HELIX is running. Keep the HELIX SERVER window open.
endlocal
exit /b 0

:failed
echo.
echo ERROR: HELIX did not become ready within 120 seconds.
echo --- Server log ---
if exist "%LOG%" type "%LOG%"
echo --- End server log ---
echo.
echo The HELIX SERVER window was left open for diagnosis.
pause >nul
endlocal
exit /b 1
