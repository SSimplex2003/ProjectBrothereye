Set-Location $PSScriptRoot

# Starts everything the app needs for a local POC run:
#   1. The Postgres container the AI backend and the frontend's API share
#   2. Database migrations (frontend/scripts/run-migrations.js)
#   3. The Python AI backend (AI/server.py)
#   4. The frontend's Next.js app + its Express API (frontend, dev:all)
# Ctrl+C stops everything that was started here.

$ErrorActionPreference = "Stop"
$frontendDir = Join-Path $PSScriptRoot "frontend"

Write-Host ""
Write-Host "==== BrotherEye - starting everything ====" -ForegroundColor Cyan
Write-Host ""

# ---------------------------------------------------------------------------
# 1. Database container (factory-manager-db, Postgres 17-alpine)
# ---------------------------------------------------------------------------
$containerName = "factory-manager-db"
$dbUser     = "postgres"
$dbPassword = "mysecretpassword"
$dbName     = "factory_manager"
$dbPort     = "5432"

$dockerAvailable = $false
try { docker --version | Out-Null; $dockerAvailable = $true } catch {}

if (-not $dockerAvailable) {
    Write-Host "[db] Docker not found - skipping database setup. Make sure Postgres is reachable at localhost:$dbPort." -ForegroundColor Yellow
} else {
    $exists  = docker ps -a --format "{{.Names}}" | Where-Object { $_ -eq $containerName }
    $running = docker ps      --format "{{.Names}}" | Where-Object { $_ -eq $containerName }

    if (-not $exists) {
        Write-Host "[db] Creating Postgres container '$containerName'..." -ForegroundColor Yellow
        docker run -d `
            --name $containerName `
            -e POSTGRES_USER=$dbUser `
            -e POSTGRES_PASSWORD=$dbPassword `
            -e POSTGRES_DB=$dbName `
            -p "${dbPort}:5432" `
            -v "${containerName}-data:/var/lib/postgresql/data" `
            postgres:17-alpine | Out-Null
        Write-Host "[db] Waiting for Postgres to accept connections..." -ForegroundColor Gray
        Start-Sleep -Seconds 8
    } elseif (-not $running) {
        Write-Host "[db] Starting existing container '$containerName'..." -ForegroundColor Yellow
        docker start $containerName | Out-Null
        Start-Sleep -Seconds 3
    } else {
        Write-Host "[db] '$containerName' already running." -ForegroundColor Green
    }

    Write-Host "[db] Running migrations..." -ForegroundColor Yellow
    node (Join-Path $frontendDir "scripts/run-migrations.js")
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[db] Migrations failed - continuing anyway." -ForegroundColor Red
    }
}

# ---------------------------------------------------------------------------
# 2. Dependencies (frontend + its Express backend)
# ---------------------------------------------------------------------------
if (-not (Test-Path (Join-Path $frontendDir "node_modules"))) {
    Write-Host "[fe] Installing frontend dependencies (first run only)..." -ForegroundColor Yellow
    Push-Location $frontendDir
    if (Get-Command pnpm -ErrorAction SilentlyContinue) { pnpm install } else { npm install }
    Pop-Location
    if ($LASTEXITCODE -ne 0) { Write-Host "Frontend dependency install failed. Aborting." -ForegroundColor Red; exit 1 }
}

$backendDir = Join-Path $frontendDir "backend"
if (-not (Test-Path (Join-Path $backendDir "node_modules"))) {
    Write-Host "[be] Installing backend dependencies (first run only)..." -ForegroundColor Yellow
    Push-Location $backendDir
    npm install
    Pop-Location
    if ($LASTEXITCODE -ne 0) { Write-Host "Backend dependency install failed. Aborting." -ForegroundColor Red; exit 1 }
}

# ---------------------------------------------------------------------------
# 3. Start everything
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "[ai] Starting Python AI backend  -> http://localhost:5000" -ForegroundColor Cyan
$ai = Start-Process -FilePath "$PSScriptRoot\.venv\Scripts\python.exe" `
    -ArgumentList "$PSScriptRoot\AI\server.py" `
    -NoNewWindow -PassThru

Write-Host "[fe] Starting frontend + its API -> http://localhost:3000, http://localhost:3001" -ForegroundColor Cyan
$fe = Start-Process -FilePath "npm.cmd" -ArgumentList "run", "dev:all" `
    -WorkingDirectory $frontendDir -NoNewWindow -PassThru

Write-Host ""
Write-Host "Everything is up. Press Ctrl+C to stop." -ForegroundColor Green
Write-Host ""

try {
    Wait-Process -Id $ai.Id, $fe.Id
} finally {
    Write-Host "Shutting down AI backend and frontend/backend (database container is left running)..." -ForegroundColor Gray
    foreach ($p in @($ai, $fe)) {
        if ($p -and -not $p.HasExited) {
            Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
        }
    }
}
