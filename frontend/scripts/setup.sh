#!/bin/bash

# setup.sh
# Complete setup script for Factory Manager app
# Creates Docker database container and runs migrations on first startup

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo ""
echo "╔═══════════════════════════════════════════╗"
echo "║     Factory Manager - Initial Setup       ║"
echo "╚═══════════════════════════════════════════╝"
echo ""

# Step 1: Initialize Docker database
echo "Step 1/3: Setting up PostgreSQL database..."
echo "-------------------------------------------"
bash "$SCRIPT_DIR/init-db-docker.sh"

# Step 2: Run migrations
echo ""
echo "Step 2/3: Running database migrations..."
echo "-------------------------------------------"
cd "$PROJECT_DIR"
node "$SCRIPT_DIR/run-migrations.js"

# Step 3: Install dependencies if needed
echo ""
echo "Step 3/3: Checking dependencies..."
echo "-------------------------------------------"

if [ ! -d "$PROJECT_DIR/node_modules" ]; then
    echo "Installing frontend dependencies..."
    cd "$PROJECT_DIR"
    pnpm install
else
    echo "Frontend dependencies already installed."
fi

if [ ! -d "$PROJECT_DIR/backend/node_modules" ]; then
    echo "Installing backend dependencies..."
    cd "$PROJECT_DIR/backend"
    npm install
else
    echo "Backend dependencies already installed."
fi

echo ""
echo "╔═══════════════════════════════════════════╗"
echo "║           Setup Complete!                 ║"
echo "╚═══════════════════════════════════════════╝"
echo ""
echo "To start the application:"
echo ""
echo "  Terminal 1 (Backend):"
echo "    cd backend && npm run dev"
echo ""
echo "  Terminal 2 (Frontend):"
echo "    pnpm dev"
echo ""
echo "The app will be available at http://localhost:3000"
echo ""
