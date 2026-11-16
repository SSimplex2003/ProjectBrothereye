#!/bin/bash

# ===========================================
# Full App Startup Script
# Pulls latest changes from git, installs
# dependencies if needed, and starts the app
# ===========================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

echo "=========================================="
echo "  Factory Manager - Full Startup"
echo "=========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Step 1: Check if git repo
if [ -d ".git" ]; then
    echo -e "${BLUE}[1/4]${NC} Pulling latest changes from git..."
    
    # Stash any local changes
    if [ -n "$(git status --porcelain)" ]; then
        echo -e "${YELLOW}      Local changes detected, stashing...${NC}"
        git stash
        STASHED=true
    fi
    
    # Pull latest
    git pull --rebase || git pull
    
    # Pop stash if we stashed
    if [ "$STASHED" = true ]; then
        echo -e "${YELLOW}      Restoring local changes...${NC}"
        git stash pop || true
    fi
    
    echo -e "${GREEN}      Done!${NC}"
else
    echo -e "${YELLOW}[1/4]${NC} Not a git repository, skipping pull..."
fi

echo ""

# Step 2: Check if dependencies need updating
echo -e "${BLUE}[2/4]${NC} Checking dependencies..."

NEEDS_INSTALL=false

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    NEEDS_INSTALL=true
fi

# Check if package.json is newer than node_modules
if [ -f "package.json" ] && [ -d "node_modules" ]; then
    if [ "package.json" -nt "node_modules" ]; then
        NEEDS_INSTALL=true
    fi
fi

# Check backend dependencies
if [ ! -d "backend/node_modules" ]; then
    NEEDS_INSTALL=true
fi

if [ "$NEEDS_INSTALL" = true ]; then
    echo -e "${YELLOW}      Installing dependencies...${NC}"
    pnpm install
    cd backend && pnpm install && cd ..
    echo -e "${GREEN}      Done!${NC}"
else
    echo -e "${GREEN}      Dependencies up to date!${NC}"
fi

echo ""

# Step 3: Check if database is running
echo -e "${BLUE}[3/4]${NC} Checking database..."

if command -v docker &> /dev/null; then
    if docker ps --format '{{.Names}}' | grep -q "factory-manager-db"; then
        echo -e "${GREEN}      Database container is running!${NC}"
    elif docker ps -a --format '{{.Names}}' | grep -q "factory-manager-db"; then
        echo -e "${YELLOW}      Starting existing database container...${NC}"
        docker start factory-manager-db
        sleep 2
        echo -e "${GREEN}      Done!${NC}"
    else
        echo -e "${YELLOW}      No database container found. Run 'pnpm setup' first.${NC}"
    fi
else
    echo -e "${YELLOW}      Docker not found, skipping database check...${NC}"
fi

echo ""

# Step 4: Start the application
echo -e "${BLUE}[4/4]${NC} Starting application..."
echo ""
echo "=========================================="
echo -e "  ${GREEN}Frontend:${NC} http://localhost:3000"
echo -e "  ${GREEN}Backend:${NC}  http://localhost:3001"
echo "=========================================="
echo ""

# Run the dev command
pnpm dev
