@echo off
REM Start script for Windows CMD
REM Pulls latest from git, ensures dependencies, starts DB and app

echo.
echo ========================================
echo    BrotherEye - Starting Application
echo ========================================
echo.

REM Navigate to project root
cd /d "%~dp0.."

REM Step 1: Git pull
echo [1/4] Pulling latest changes from Git...
if exist ".git" (
    git pull --rebase
    if errorlevel 1 (
        echo   Git pull failed, continuing anyway...
    ) else (
        echo   Git pull successful!
    )
) else (
    echo   Not a git repository, skipping...
)

REM Step 2: Install dependencies
echo.
echo [2/4] Checking dependencies...
if not exist "node_modules" (
    echo   First run detected - installing all dependencies...
    call npm install
    if errorlevel 1 (
        echo   Dependency installation failed!
        exit /b 1
    )
    echo   Dependencies installed successfully!
) else (
    echo   Dependencies found!
)

if exist "backend\package.json" (
    if not exist "backend\node_modules" (
        echo   First run detected for backend - installing dependencies...
        cd backend
        call npm install
        if errorlevel 1 (
            echo   Backend dependency installation failed!
            cd ..
            exit /b 1
        )
        cd ..
        echo   Backend dependencies installed successfully!
    ) else (
        echo   Backend dependencies found!
    )
)

REM Step 3: Start database container
echo.
echo [3/4] Checking database container...
set NEW_CONTAINER=0
docker --version >nul 2>&1
if errorlevel 1 (
    echo   Docker not found, skipping database setup...
) else (
    docker ps -a --format "{{.Names}}" | findstr /x "factory-manager-db" >nul 2>&1
    if errorlevel 1 (
        echo   Creating new database container...
        docker run -d --name factory-manager-db -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=mysecretpassword -e POSTGRES_DB=factory_manager -p 5432:5432 -v factory-manager-db-data:/var/lib/postgresql/data postgres:17-alpine
        echo   Waiting for database to initialize...
        timeout /t 10 /nobreak >nul
        set NEW_CONTAINER=1
    ) else (
        docker ps --format "{{.Names}}" | findstr /x "factory-manager-db" >nul 2>&1
        if errorlevel 1 (
            echo   Starting database container...
            docker start factory-manager-db
            timeout /t 3 /nobreak >nul
        ) else (
            echo   Database already running!
        )
    )
    
    echo   Running database migrations...
    node scripts/run-migrations.js
    if errorlevel 1 (
        echo   Migration failed! Check errors above.
    ) else (
        echo   Migrations completed!
    )
)

REM Step 4: Start the application
echo.
echo [4/4] Starting application...
echo.
echo   Frontend: http://localhost:3000
echo   Backend:  http://localhost:3001
echo.
echo   Press Ctrl+C to stop
echo.

node scripts/dev.js
