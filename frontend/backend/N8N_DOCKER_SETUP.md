# n8n Docker Setup for Local Testing

This guide explains how to run n8n locally using Docker and connect it to Brother Eye for worker activity tracking.

---

## Prerequisites

- Docker Desktop installed ([Download here](https://www.docker.com/products/docker-desktop/))
- Brother Eye backend running (default: `http://localhost:3001`)
- PostgreSQL database running (the same one Brother Eye uses)

---

## Quick Start

### Step 1: Create a Docker Network

This allows n8n to communicate with your local PostgreSQL and Brother Eye backend.

```bash
docker network create brothereye-network
```

### Step 2: Run n8n Container

```bash
docker run -d \
  --name n8n \
  --network brothereye-network \
  -p 5678:5678 \
  -e N8N_BASIC_AUTH_ACTIVE=true \
  -e N8N_BASIC_AUTH_USER=admin \
  -e N8N_BASIC_AUTH_PASSWORD=admin123 \
  -e GENERIC_TIMEZONE=Europe/Bucharest \
  -e TZ=Europe/Bucharest \
  -v n8n_data:/home/node/.n8n \
  n8nio/n8n
```

### Step 3: Access n8n

Open your browser and go to:

```
http://localhost:5678
```

Login with:
- **Username:** `admin`
- **Password:** `admin123`

---

## Connecting to Local PostgreSQL

### Option A: PostgreSQL Running on Host Machine

If PostgreSQL is running directly on your machine (not in Docker), use `host.docker.internal` as the host:

| Setting | Value |
|---------|-------|
| Host | `host.docker.internal` |
| Port | `5432` |
| Database | `brothereye` (or your db name) |
| User | `postgres` (or your user) |
| Password | Your password |

### Option B: PostgreSQL Running in Docker

If PostgreSQL is also in Docker, make sure it's on the same network:

```bash
# Run PostgreSQL on the same network
docker run -d \
  --name postgres \
  --network brothereye-network \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=yourpassword \
  -e POSTGRES_DB=brothereye \
  -p 5432:5432 \
  -v postgres_data:/var/lib/postgresql/data \
  postgres:15
```

Then in n8n, use:

| Setting | Value |
|---------|-------|
| Host | `postgres` (container name) |
| Port | `5432` |
| Database | `brothereye` |
| User | `postgres` |
| Password | `yourpassword` |

---

## Import the Workflow

### Step 1: Download the Workflow File

The workflow JSON is located at:
```
backend/n8n-workflow.json
```

### Step 2: Import into n8n

1. In n8n, click **"Add workflow"** (or press `Ctrl+N`)
2. Click the **three dots menu** (top right)
3. Select **"Import from File..."**
4. Choose `n8n-workflow.json`
5. Click **"Save"**

### Step 3: Configure PostgreSQL Credentials

1. Open the imported workflow
2. Double-click any **Postgres** node
3. Click **"Create New Credential"**
4. Fill in your database connection details:

```
Host:     host.docker.internal  (or postgres if using Docker)
Port:     5432
Database: brothereye
User:     postgres
Password: [your password]
SSL:      Disable (for local testing)
```

5. Click **"Save"**
6. The credential will be used by all Postgres nodes automatically

### Step 4: Activate the Workflow

1. Toggle the **"Active"** switch in the top right
2. The webhook is now listening at:
   ```
   http://localhost:5678/webhook/worker-activity
   ```

---

## Testing the Webhook

### Using cURL

```bash
curl -X POST http://localhost:5678/webhook/worker-activity \
  -H "Content-Type: application/json" \
  -d '{
    "worker_name": "John Doe",
    "event": "working"
  }'
```

### Using PowerShell (Windows)

```powershell
Invoke-RestMethod -Uri "http://localhost:5678/webhook/worker-activity" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"worker_name": "John Doe", "event": "working"}'
```

### Expected Response

```json
{
  "status": "processed",
  "worker": "John Doe",
  "previous_activity": "idle",
  "new_activity": "working",
  "duration_logged": true
}
```

---

## Complete Docker Compose Setup

For a complete local environment, create a `docker-compose.yml` file:

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15
    container_name: brothereye-postgres
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres123
      POSTGRES_DB: brothereye
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5

  n8n:
    image: n8nio/n8n
    container_name: brothereye-n8n
    environment:
      - N8N_BASIC_AUTH_ACTIVE=true
      - N8N_BASIC_AUTH_USER=admin
      - N8N_BASIC_AUTH_PASSWORD=admin123
      - GENERIC_TIMEZONE=Europe/Bucharest
      - TZ=Europe/Bucharest
      - DB_TYPE=postgresdb
      - DB_POSTGRESDB_HOST=postgres
      - DB_POSTGRESDB_PORT=5432
      - DB_POSTGRESDB_DATABASE=n8n
      - DB_POSTGRESDB_USER=postgres
      - DB_POSTGRESDB_PASSWORD=postgres123
    ports:
      - "5678:5678"
    volumes:
      - n8n_data:/home/node/.n8n
    depends_on:
      postgres:
        condition: service_healthy

volumes:
  postgres_data:
  n8n_data:
```

### Run with Docker Compose

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop all services
docker-compose down

# Stop and remove volumes (reset data)
docker-compose down -v
```

---

## Connecting Brother Eye Backend to the Network

If your Brother Eye backend is running locally (not in Docker), you can send events to n8n at:

```
http://localhost:5678/webhook/worker-activity
```

If Brother Eye is also in Docker, add it to the same network and use:

```
http://n8n:5678/webhook/worker-activity
```

---

## Database Tables Required

Make sure these tables exist in your PostgreSQL database:

### activity_state (Current Worker Status)

```sql
CREATE TABLE IF NOT EXISTS activity_state (
  id SERIAL PRIMARY KEY,
  worker_name VARCHAR(100) UNIQUE NOT NULL,
  last_activity VARCHAR(50) DEFAULT 'idle',
  last_event_time TIMESTAMP DEFAULT NOW(),
  last_seen_time TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);
```

### activity_logs (Activity History)

```sql
CREATE TABLE IF NOT EXISTS activity_logs (
  id SERIAL PRIMARY KEY,
  worker_name VARCHAR(100) NOT NULL,
  activity_type VARCHAR(50) NOT NULL,
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP,
  duration_minutes DECIMAL(10,2),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_worker_date 
ON activity_logs(worker_name, start_time);
```

---

## Workflow Event Types

The workflow accepts these event types:

| Event | Description | Mapped Activity |
|-------|-------------|-----------------|
| `working` | Operator is actively working | `working` |
| `cycle` | Completed a work cycle | `working` |
| `idle` | Operator is idle/waiting | `idle` |
| `break` | Operator on break | `break` |
| `away` | Operator left station | `away` |
| `offline` | Operator offline/not detected | `offline` |

---

## Troubleshooting

### n8n can't connect to PostgreSQL

1. Check if PostgreSQL is running:
   ```bash
   docker ps | grep postgres
   ```

2. Test connection from n8n container:
   ```bash
   docker exec -it n8n ping host.docker.internal
   ```

3. Make sure PostgreSQL accepts connections from Docker:
   - Edit `pg_hba.conf` to allow connections from `172.17.0.0/16`
   - Or use `host all all 0.0.0.0/0 md5` for testing only

### Webhook not responding

1. Check if n8n is running:
   ```bash
   docker ps | grep n8n
   ```

2. Check n8n logs:
   ```bash
   docker logs n8n
   ```

3. Make sure the workflow is **Active** (toggle in top right)

### Permission denied errors

On Linux, you may need to set permissions:
```bash
sudo chown -R 1000:1000 /path/to/n8n_data
```

---

## Useful Commands

```bash
# View n8n logs
docker logs -f n8n

# Restart n8n
docker restart n8n

# Stop n8n
docker stop n8n

# Remove n8n container (keeps data)
docker rm n8n

# Remove n8n data volume (reset everything)
docker volume rm n8n_data

# Enter n8n container shell
docker exec -it n8n /bin/sh

# Check n8n version
docker exec n8n n8n --version
```

---

## Next Steps

1. **Configure Camera/AI Integration**: Point your detection system to send events to the webhook
2. **Test with Multiple Workers**: Send events for different workers to see them in Brother Eye
3. **Set Up Alerts**: Configure Brother Eye to generate alerts based on worker states
4. **Production Deployment**: See `N8N_INTEGRATION.md` for production considerations
