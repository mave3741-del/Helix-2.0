$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$RuntimeRoot = Join-Path $Root '.helix-runtime'
$NodeDir = Join-Path $RuntimeRoot 'node-v22.22.1-win-x64'
$NodeExe = Join-Path $NodeDir 'node.exe'
$ZipPath = Join-Path $RuntimeRoot 'node-v22.22.1-win-x64.zip'
$Log = Join-Path $Root 'certification-bootstrap.log'
$NodeUrl = 'https://nodejs.org/download/release/v22.22.1/node-v22.22.1-win-x64.zip'

function Log($Text) {
  $Text | Tee-Object -FilePath $Log -Append
}

"HELIX certification bootstrap $(Get-Date -Format o)" | Set-Content $Log

if (-not (Test-Path $NodeExe)) {
  New-Item -ItemType Directory -Path $RuntimeRoot -Force | Out-Null
  Log "Downloading Node.js 22.22.1 portable runtime..."
  try {
    Invoke-WebRequest -Uri $NodeUrl -OutFile $ZipPath -UseBasicParsing
  } catch {
    Log "ERROR: Could not download Node.js runtime from $NodeUrl"
    Log $_.Exception.Message
    exit 1
  }

  Log "Extracting Node.js runtime with robust ZIP extractor..."
  $ExtractRoot = Join-Path $RuntimeRoot ("extract-" + [Guid]::NewGuid().ToString("N"))
  New-Item -ItemType Directory -Path $ExtractRoot -Force | Out-Null
  try {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [System.IO.Compression.ZipFile]::ExtractToDirectory($ZipPath, $ExtractRoot)
  } catch {
    Log "ERROR: ZIP extraction failed."
    Log $_.Exception.Message
    exit 1
  }

  $ExtractedNodeDir = Join-Path $ExtractRoot 'node-v22.22.1-win-x64'
  if (-not (Test-Path (Join-Path $ExtractedNodeDir 'node.exe'))) {
    Log "ERROR: Extracted archive does not contain expected node.exe."
    exit 1
  }

  if (Test-Path $NodeDir) {
    Remove-Item $NodeDir -Recurse -Force
  }
  Move-Item -Path $ExtractedNodeDir -Destination $NodeDir -Force

  try { Remove-Item $ExtractRoot -Recurse -Force } catch { Log "WARN: Temporary extraction directory cleanup failed; continuing." }
  try { Remove-Item $ZipPath -Force } catch { Log "WARN: Runtime ZIP cleanup failed; continuing." }
}

if (-not (Test-Path $NodeExe)) {
  Log "ERROR: Node runtime extraction did not produce node.exe"
  exit 1
}

$env:Path = "$NodeDir;$env:Path"
$NodeVersion = (& $NodeExe --version).Trim()
$NpmCmd = Join-Path $NodeDir 'npm.cmd'
$NpmVersion = (& $NpmCmd --version).Trim()
Log "Using Node $NodeVersion / npm $NpmVersion"

if ($NodeVersion -notmatch '^v22\.') {
  Log "ERROR: Expected Node 22.x but found $NodeVersion"
  exit 1
}
if ($NpmVersion -notmatch '^10\.') {
  Log "ERROR: Expected npm 10.x but found $NpmVersion"
  exit 1
}

Log 'Runtime bootstrap PASS.'
exit 0
