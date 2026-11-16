#!/bin/bash

# init-db-docker.sh
# Creates a PostgreSQL Docker container for the Factory Manager app
# Run this script once on first app setup

set -e

CONTAINER_NAME="factory-manager-db"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-postgres}"
DB_PASSWORD="${DB_PASSWORD:-mysecretpassword}"
DB_NAME="${DB_NAME:-factory_manager}"
POSTGRES_VERSION="17-alpine"

echo "==================================="
echo "Factory Manager Database Setup"
echo "==================================="

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "Error: Docker is not installed. Please install Docker first."
    echo "Visit: https://docs.docker.com/get-docker/"
    exit 1
fi

# Check if Docker daemon is running
if ! docker info &> /dev/null; then
    echo "Error: Docker daemon is not running. Please start Docker."
    exit 1
fi

# Check if container already exists
if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo "Container '${CONTAINER_NAME}' already exists."
    
    # Check if it's running
    if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        echo "Container is already running."
        echo "PostgreSQL is available at localhost:${DB_PORT}"
    else
        echo "Starting existing container..."
        docker start ${CONTAINER_NAME}
        echo "Container started. PostgreSQL is available at localhost:${DB_PORT}"
    fi
else
    echo "Creating new PostgreSQL container..."
    
    # Create and start the container
    docker run -d \
        --name ${CONTAINER_NAME} \
        -e POSTGRES_USER=${DB_USER} \
        -e POSTGRES_PASSWORD=${DB_PASSWORD} \
        -e POSTGRES_DB=${DB_NAME} \
        -p ${DB_PORT}:5432 \
        -v factory-manager-pgdata:/var/lib/postgresql/data \
        --restart unless-stopped \
        postgres:${POSTGRES_VERSION}
    
    echo "Container created successfully!"
    echo ""
    echo "Waiting for PostgreSQL to be ready..."
    
    # Wait for PostgreSQL to be ready
    RETRIES=30
    until docker exec ${CONTAINER_NAME} pg_isready -U ${DB_USER} &> /dev/null || [ $RETRIES -eq 0 ]; do
        echo "Waiting for PostgreSQL... ($RETRIES attempts remaining)"
        RETRIES=$((RETRIES - 1))
        sleep 1
    done
    
    if [ $RETRIES -eq 0 ]; then
        echo "Error: PostgreSQL did not start in time."
        exit 1
    fi
    
    echo ""
    echo "==================================="
    echo "PostgreSQL is ready!"
    echo "==================================="
fi

echo ""
echo "Connection details:"
echo "  Host:     localhost"
echo "  Port:     ${DB_PORT}"
echo "  User:     ${DB_USER}"
echo "  Password: ${DB_PASSWORD}"
echo "  Database: ${DB_NAME}"
echo ""
echo "Connection string:"
echo "  postgresql://${DB_USER}:${DB_PASSWORD}@localhost:${DB_PORT}/${DB_NAME}"
echo ""
echo "Next steps:"
echo "  1. Run the database migrations: node scripts/run-migrations.js"
echo "  2. Start the backend: cd backend && npm run dev"
echo "  3. Start the frontend: npm run dev"
echo ""
