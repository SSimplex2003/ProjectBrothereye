# BrotherEye - Operator Activity Monitoring Dashboard

An industrial operator activity monitoring system that displays live status, activity history, and daily summaries.

## Architecture

```
Python Vision Agent → n8n Webhook → PostgreSQL → Backend API → Frontend UI
```

## Setup

### 1. Backend API

```bash
cd backend
npm install
npm run dev
```

The backend runs on `http://localhost:3001`

Environment variables (create `.env` from `.env.example`):
- `DB_HOST` - PostgreSQL host (default: localhost)
- `DB_PORT` - PostgreSQL port (default: 5432)
- `DB_USER` - PostgreSQL user (default: postgres)
- `DB_PASSWORD` - PostgreSQL password (default: mysecretpassword)
- `DB_NAME` - PostgreSQL database (default: postgres)
- `PORT` - Backend port (default: 3001)

### 2. Frontend

```bash
npm install
npm run dev
```

The frontend runs on `http://localhost:3000`

Environment variables:
- `NEXT_PUBLIC_API_URL` - Backend API URL (default: http://localhost:3001)

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| GET /api/workers | List all worker names |
| GET /api/workers/current | Current state of all workers |
| GET /api/activity?worker_name=X&date=YYYY-MM-DD | Activity history |
| GET /api/summary?date=YYYY-MM-DD | Daily summary by worker |

## Pages

1. **Live Operators** (`/live`) - Real-time status with auto-refresh
2. **Activity History** (`/history`) - Historical activity segments
3. **Daily Summary** (`/summary`) - Aggregated totals with CSV export
```
