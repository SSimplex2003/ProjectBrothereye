# Start script for Windows PowerShell
# Pulls latest from git, ensures dependencies, starts DB and app

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   BrotherEye - Starting Application   " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Navigate to project root (script is in /scripts)
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir
Set-Location $projectRoot

# Step 1: Git pull
Write-Host "[1/4] Pulling latest changes from Git..." -ForegroundColor Yellow

# Check if this is a git repo
if (Test-Path ".git") {
    # Check for uncommitted changes
    $status = git status --porcelain
    if ($status) {
        Write-Host "  Stashing local changes..." -ForegroundColor Gray
        git stash push -m "auto-stash before pull $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
        $stashed = $true
    }
    
    # Pull latest
    git pull --rebase
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  Git pull failed, continuing anyway..." -ForegroundColor Red
    } else {
        Write-Host "  Git pull successful!" -ForegroundColor Green
    }
    
    # Pop stash if we stashed
    if ($stashed) {
        Write-Host "  Restoring local changes..." -ForegroundColor Gray
        git stash pop
    }
} else {
    Write-Host "  Not a git repository, skipping..." -ForegroundColor Gray
}

# Step 2: Install dependencies
Write-Host ""
Write-Host "[2/4] Checking dependencies..." -ForegroundColor Yellow

# Detect package manager
$packageManager = "npm"
if (Test-Path "pnpm-lock.yaml") {
    $packageManager = "pnpm"
} elseif (Test-Path "yarn.lock") {
    $packageManager = "yarn"
}

# Check if node_modules needs updating (force install on first run)
$needsInstall = $false
if (-not (Test-Path "node_modules")) {
    Write-Host "  First run detected - will install all dependencies..." -ForegroundColor Gray
    $needsInstall = $true
} elseif ((Get-Item "package.json").LastWriteTime -gt (Get-Item "node_modules").LastWriteTime) {
    $needsInstall = $true
}

if ($needsInstall) {
    Write-Host "  Installing dependencies with $packageManager..." -ForegroundColor Gray
    if ($packageManager -eq "pnpm") {
        # Approve build scripts for packages that need them
        Write-Host "  Approving build scripts for native packages..." -ForegroundColor Gray
        & pnpm approve-builds ffmpeg-static sharp 2>$null
        & pnpm install
    } else {
        & $packageManager install
    }
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  Dependency installation failed!" -ForegroundColor Red
        exit 1
    }
    Write-Host "  Dependencies installed successfully!" -ForegroundColor Green
} else {
    Write-Host "  Dependencies up to date!" -ForegroundColor Green
}

# Also check backend dependencies
if (Test-Path "backend/package.json") {
    $backendNeedsInstall = $false
    if (-not (Test-Path "backend/node_modules")) {
        Write-Host "  First run detected for backend - will install dependencies..." -ForegroundColor Gray
        $backendNeedsInstall = $true
    } elseif ((Get-Item "backend/package.json").LastWriteTime -gt (Get-Item "backend/node_modules").LastWriteTime) {
        $backendNeedsInstall = $true
    }
    
    if ($backendNeedsInstall) {
        Write-Host "  Installing backend dependencies..." -ForegroundColor Gray
        Push-Location backend
        if ($packageManager -eq "pnpm") {
            & pnpm approve-builds 2>$null
            & pnpm install
        } else {
            & $packageManager install
        }
        if ($LASTEXITCODE -ne 0) {
            Write-Host "  Backend dependency installation failed!" -ForegroundColor Red
            Pop-Location
            exit 1
        }
        Pop-Location
        Write-Host "  Backend dependencies installed successfully!" -ForegroundColor Green
    } else {
        Write-Host "  Backend dependencies up to date!" -ForegroundColor Green
    }
}

# Step 3: Start database container
Write-Host ""
Write-Host "[3/4] Checking database container..." -ForegroundColor Yellow

$containerName = "factory-manager-db"
$newContainer = $false
$containerRunning = $false

# Check if Docker is available
$dockerAvailable = $false
try {
    docker --version | Out-Null
    $dockerAvailable = $true
} catch {
    Write-Host "  Docker not found, skipping database setup..." -ForegroundColor Gray
}

if ($dockerAvailable) {
    # Check if container exists
    $containerExists = docker ps -a --format "{{.Names}}" | Where-Object { $_ -eq $containerName }
    
    if ($containerExists) {
        # Check if container is running
        $containerRunning = docker ps --format "{{.Names}}" | Where-Object { $_ -eq $containerName }
        
        if ($containerRunning) {
            # Check if container is healthy (not restarting)
            $containerStatus = docker inspect --format "{{.State.Status}}" $containerName 2>$null
            $restartCount = docker inspect --format "{{.RestartCount}}" $containerName 2>$null
            
            if ($restartCount -gt 3) {
                Write-Host "  Database container is in a restart loop!" -ForegroundColor Red
                Write-Host "  This usually happens when upgrading PostgreSQL versions." -ForegroundColor Yellow
                Write-Host ""
                $response = Read-Host "  Do you want to reset the database? (y/N)"
                if ($response -eq "y" -or $response -eq "Y") {
                    Write-Host "  Stopping and removing container..." -ForegroundColor Gray
                    docker stop $containerName 2>$null
                    docker rm $containerName 2>$null
                    Write-Host "  Removing old data volume..." -ForegroundColor Gray
                    docker volume rm "${containerName}-data" 2>$null
                    $containerExists = $false
                    Write-Host "  Old database removed. Will create fresh database." -ForegroundColor Green
                } else {
                    Write-Host "  Skipping database setup. Fix manually or run with reset." -ForegroundColor Yellow
                }
            } else {
                Write-Host "  Database container already running!" -ForegroundColor Green
            }
        } else {
            Write-Host "  Starting existing database container..." -ForegroundColor Gray
            docker start $containerName
            Start-Sleep -Seconds 3
            
            # Check if it started successfully
            $containerRunning = docker ps --format "{{.Names}}" | Where-Object { $_ -eq $containerName }
            if ($containerRunning) {
                Write-Host "  Database container started!" -ForegroundColor Green
            } else {
                Write-Host "  Database container failed to start!" -ForegroundColor Red
                Write-Host "  Checking logs..." -ForegroundColor Gray
                docker logs --tail 10 $containerName
                Write-Host ""
                $response = Read-Host "  Do you want to reset the database? (y/N)"
                if ($response -eq "y" -or $response -eq "Y") {
                    docker rm $containerName 2>$null
                    docker volume rm "${containerName}-data" 2>$null
                    $containerExists = $false
                    Write-Host "  Old database removed. Will create fresh database." -ForegroundColor Green
                }
            }
        }
    }
    
    if (-not $containerExists) {
        Write-Host "  Creating new database container..." -ForegroundColor Gray
        
        # Load env vars if .env exists
        $dbUser = "postgres"
        $dbPassword = "mysecretpassword"
        $dbName = "factory_manager"
        $dbPort = "5432"
        
        if (Test-Path ".env") {
            Get-Content ".env" | ForEach-Object {
                if ($_ -match "^DB_USER=(.*)$") { $dbUser = $matches[1] }
                if ($_ -match "^DB_PASSWORD=(.*)$") { $dbPassword = $matches[1] }
                if ($_ -match "^DB_NAME=(.*)$") { $dbName = $matches[1] }
                if ($_ -match "^DB_PORT=(.*)$") { $dbPort = $matches[1] }
            }
        }
        
        # Check if port is in use
        $portInUse = netstat -an | Select-String ":${dbPort}.*LISTENING"
        if ($portInUse) {
            Write-Host "  Warning: Port $dbPort is already in use!" -ForegroundColor Yellow
            Write-Host "  Another PostgreSQL instance may be running." -ForegroundColor Yellow
        }
        
        docker run -d `
            --name $containerName `
            -e POSTGRES_USER=$dbUser `
            -e POSTGRES_PASSWORD=$dbPassword `
            -e POSTGRES_DB=$dbName `
            -p "${dbPort}:5432" `
            -v "${containerName}-data:/var/lib/postgresql/data" `
            postgres:17-alpine
        
        Write-Host "  Waiting for database to be ready..." -ForegroundColor Gray
        Start-Sleep -Seconds 8
        
        # Verify it started
        $containerRunning = docker ps --format "{{.Names}}" | Where-Object { $_ -eq $containerName }
        if ($containerRunning) {
            Write-Host "  Database container created!" -ForegroundColor Green
            $newContainer = $true
        } else {
            Write-Host "  Database container failed to start. Check: docker logs $containerName" -ForegroundColor Red
        }
    }
    
    # Run migrations if this is a new container or if migrations tracking table doesn't exist
    if ($containerRunning -or $newContainer) {
        Write-Host ""
        Write-Host "  Running database migrations..." -ForegroundColor Gray
        
        # Wait a bit more for PostgreSQL to fully initialize on first run
        if ($newContainer) {
            Write-Host "  Waiting for PostgreSQL to initialize..." -ForegroundColor Gray
            Start-Sleep -Seconds 5
        }
        
        # Run migrations using Node.js script
        node scripts/run-migrations.js
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  Migrations completed!" -ForegroundColor Green
        } else {
            Write-Host "  Migration failed! Check errors above." -ForegroundColor Red
        }
    }
}

# Step 4: Start the application
Write-Host ""
Write-Host "[4/4] Starting application..." -ForegroundColor Yellow
Write-Host ""
Write-Host "  Frontend: http://localhost:3000" -ForegroundColor Cyan
Write-Host "  Backend:  http://localhost:3001" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Press Ctrl+C to stop" -ForegroundColor Gray
Write-Host ""

# Start both frontend and backend using node script
node scripts/dev.js
