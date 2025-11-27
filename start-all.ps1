<#
start-all.ps1

Usage:
  .\start-all.ps1            # auto mode: prefer docker if available or if -Mode docker specified
  .\start-all.ps1 -Mode docker
  .\start-all.ps1 -Mode local

This script reads `.env` in the repo root, then either:
- local: installs deps, builds client, runs DB init, and starts the Node server in background
- docker: builds and starts the Docker container via docker-compose (reads same .env)

#>

param(
  [ValidateSet('auto','local','docker')]
  [string]$Mode = 'auto'
)

Set-StrictMode -Version Latest
Push-Location $PSScriptRoot

function Load-EnvFile([string]$path) {
  if (-not (Test-Path $path)) { return }
  Get-Content $path | ForEach-Object {
    $_ = $_.Trim()
    if ($_ -eq '' -or $_ -like '#*') { return }
    $parts = $_ -split '='; if ($parts.Count -lt 2) { return }
    $name = $parts[0].Trim(); $value = ($parts[1..($parts.Count-1)] -join '=').Trim()
    # strip surrounding quotes
    if ($value.StartsWith('"') -and $value.EndsWith('"')) { $value = $value.Trim('"') }
    if ($value.StartsWith("'") -and $value.EndsWith("'")) { $value = $value.Trim("'") }
    Set-Item -Path Env:$name -Value $value -Force
  }
}

Write-Output "Loading .env from $PWD\.env"
Load-EnvFile (Join-Path $PWD '.env')

# Auto-detect docker: prefer docker if docker compose is available and Mode==auto
function Has-Docker() {
  try {
    $null = & docker version 2>$null
    return $true
  } catch { return $false }
}

if ($Mode -eq 'auto') {
  if (Has-Docker) { $Mode = 'docker' } else { $Mode = 'local' }
}

if ($Mode -eq 'docker') {
  if (-not (Has-Docker)) { Write-Error "Docker not available on PATH; cannot run in docker mode."; exit 1 }
  Write-Output "Running in docker mode: building image and starting container via docker-compose"
  # docker-compose will read .env in current folder automatically
  & docker compose up -d --build
  if ($LASTEXITCODE -ne 0) { Write-Error "docker compose failed with exit $LASTEXITCODE"; exit $LASTEXITCODE }
  Write-Output "Container started. Open http://localhost:3000 or your host IP:3000"
  Pop-Location
  exit 0
}

# Local mode: install, build client, init DB, start server in background
Write-Output "Running in local mode: install deps, build client, init DB, start server"

if (-not (Test-Path 'package.json')) { Write-Error 'package.json not found in working directory.'; Pop-Location; exit 1 }

Write-Output 'Installing root dependencies (npm install) -- this may take a moment'
npm install
if ($LASTEXITCODE -ne 0) { Write-Error 'npm install failed'; Pop-Location; exit $LASTEXITCODE }

Write-Output 'Building client (npm run build)'
npm run build
if ($LASTEXITCODE -ne 0) { Write-Error 'client build failed'; Pop-Location; exit $LASTEXITCODE }

Write-Output 'Initializing database (npm run init-db)'
npm run init-db
if ($LASTEXITCODE -ne 0) { Write-Warning 'DB init failed - check logs above. If DB already exists, verify credentials and run init-db manually.' }

# Start server in background and show PID
Write-Output 'Starting server in background (node server.js)'
$proc = Start-Process -FilePath 'node' -ArgumentList 'server.js' -WorkingDirectory $PWD -PassThru
Write-Output "Server started with PID: $($proc.Id)"
Write-Output 'To view logs, run:'
Write-Output "  Get-Process -Id $($proc.Id) -ErrorAction SilentlyContinue; Stop-Process -Id $($proc.Id) -Force # to stop"

Pop-Location
exit 0
