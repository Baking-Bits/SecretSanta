<#
start-dev.ps1

Starts development environment:
- installs dependencies if missing
- runs DB init (safe to skip if DB already present)
- starts backend (node server.js) in background
- starts Vite dev server (client) in foreground so you can test at http://localhost:5173

Run from repository root:
  .\start-dev.ps1
#>

Set-StrictMode -Version Latest
Push-Location $PSScriptRoot

function Load-EnvFile([string]$path) {
  if (-not (Test-Path $path)) { return }
  Get-Content $path | ForEach-Object {
    $_ = $_.Trim()
    if ($_ -eq '' -or $_ -like '#*') { return }
    $parts = $_ -split '='; if ($parts.Count -lt 2) { return }
    $name = $parts[0].Trim(); $value = ($parts[1..($parts.Count-1)] -join '=').Trim()
    if ($value.StartsWith('"') -and $value.EndsWith('"')) { $value = $value.Trim('"') }
    if ($value.StartsWith("'") -and $value.EndsWith("'")) { $value = $value.Trim("'") }
    Set-Item -Path Env:$name -Value $value -Force
  }
}

Write-Output "Loading .env from $PWD\.env"
Load-EnvFile (Join-Path $PWD '.env')

Write-Output 'Installing root dependencies (npm install)...'
npm install
if ($LASTEXITCODE -ne 0) { Write-Error 'npm install failed'; Pop-Location; exit $LASTEXITCODE }

Write-Output 'Installing client dependencies (npm install in client)...'
Push-Location client
npm install
if ($LASTEXITCODE -ne 0) { Write-Error 'client npm install failed'; Pop-Location; Pop-Location; exit $LASTEXITCODE }
Pop-Location

Write-Output 'Running DB initialization (npm run init-db)'
npm run init-db
if ($LASTEXITCODE -ne 0) { Write-Warning 'DB init encountered errors. If DB already exists, this may be fine.' }

Write-Output 'Starting backend (node server.js) in background'
$backend = Start-Process -FilePath 'node' -ArgumentList 'server.js' -WorkingDirectory $PWD -PassThru
Write-Output "Backend started with PID: $($backend.Id)"

Write-Output 'Starting Vite dev server (client) in foreground...'
Push-Location client
npm run dev

Pop-Location
Pop-Location
