# n8n Integration Guide - Worker Activity Event Tracker

This document explains how to set up the n8n workflow that tracks worker activity events and stores them in the PostgreSQL database. This integration is essential for Brother Eye to receive real-time activity data from your monitoring systems (cameras, sensors, etc.).

## Overview

The n8n workflow receives activity events via webhook, processes them, and:
1. Tracks the **current state** of each worker in `activity_state` table
2. Logs **completed activities** with duration in `activity_logs` table

This enables Brother Eye to:
- Show real-time worker status (Working, Idle, Break, etc.)
- Generate alerts when operators are not present or idle
- Track cycle times and performance metrics

---

## Prerequisites

1. **n8n instance** - Self-hosted or cloud (https://n8n.io)
2. **PostgreSQL database** - Same database used by Brother Eye
3. **Database tables created** - Run the SQL scripts in `/scripts/` folder first

---

## Database Tables Required

The workflow uses these two tables (already created by Brother Eye scripts):

### `activity_state` - Current Worker State
```sql
CREATE TABLE IF NOT EXISTS activity_state (
  worker_name VARCHAR(100) PRIMARY KEY,
  last_activity VARCHAR(50),
  last_start_time TIMESTAMPTZ,
  last_seen_time TIMESTAMPTZ
);
```

### `activity_logs` - Activity History
```sql
CREATE TABLE IF NOT EXISTS activity_logs (
  id SERIAL PRIMARY KEY,
  worker_name VARCHAR(100) NOT NULL,
  activity_type VARCHAR(50) NOT NULL,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  duration_minutes INTEGER
);
```

---

## Workflow Architecture

```
┌─────────────────┐     ┌───────────┐     ┌──────────────────┐     ┌───────────┐
│ Webhook         │────▶│ Normalize │────▶│ Select Postgres  │────▶│   Merge   │
│ POST /work-     │     │ (Code)    │     │ (Get last state) │     │           │
│ monitor         │     └───────────┘     └──────────────────┘     └─────┬─────┘
└─────────────────┘                                                      │
                                                                         ▼
                                                               ┌───────────────┐
                                                               │   Calculate   │
                                                               │   (Code)      │
                                                               └───────┬───────┘
                                                                       │
                                                                       ▼
                                                               ┌───────────────┐
                                                               │      If       │
                                                               │ shouldInsert  │
                                                               │ shouldUpsert  │
                                                               └───────┬───────┘
                                                                       │
                              ┌────────────────────────────────────────┼────────────────────┐
                              │                                        │                    │
                              ▼                                        ▼                    │
                    ┌─────────────────┐                      ┌─────────────────┐           │
                    │ Store Activity  │                      │ Upsert State    │           │
                    │ in PostgreSQL   │─────────────────────▶│ (only upsert)   │           │
                    │ (INSERT log)    │                      │                 │           │
                    └─────────────────┘                      └─────────────────┘           │
                              │                                                            │
                              ▼                                                            │
                    ┌─────────────────┐                                                    │
                    │ Upsert State 2  │◀───────────────────────────────────────────────────┘
                    │ (after insert)  │
                    └─────────────────┘
```

---

## Step-by-Step Setup

### Step 1: Import the Workflow

1. Open your n8n instance
2. Go to **Workflows** → **Add Workflow** → **Import from File**
3. Import the JSON file: `Worker Activity Event Tracker with Postgres State Management.json`
4. The workflow will be created with all nodes pre-configured

### Step 2: Configure PostgreSQL Credentials

1. Click on any **Postgres** node in the workflow
2. Click on **Credential to connect with** → **Create New**
3. Enter your database credentials:

```
Name: Brother Eye DB (or any name)
Host: your-database-host.com
Database: your_database_name
User: your_db_user
Password: your_db_password
Port: 5432
SSL: Enable if required
```

4. Click **Save**
5. Update ALL Postgres nodes to use this credential:
   - `sellect postgress` (Select)
   - `Store Activity in PostgreSQL` (Insert)
   - `Upsert state into activity_state` 
   - `Upsert state into activity_state2`

### Step 3: Activate the Webhook

1. Click on the **Receive Activity Data1** webhook node
2. Note the webhook URL, it will be something like:
   ```
   https://your-n8n-instance.com/webhook/work-monitor
   ```
   Or for local development:
   ```
   http://localhost:5678/webhook/work-monitor
   ```
3. Click **Save** and then **Activate** the workflow (toggle in top right)

---

## Workflow Nodes Explained

### 1. Receive Activity Data (Webhook)

**Type:** Webhook  
**Path:** `/work-monitor`  
**Method:** POST

Receives activity events from your monitoring system.

**Expected Request Body:**
```json
{
  "worker_name": "John Doe",
  "activity_type": "Working"
}
```

**Valid Activity Types:**
- `Working` - Operator is actively working
- `Idle` - Operator is present but not working
- `Break` - Operator is on break
- `Away` - Operator left the station
- `cycle` - Operator completed a work cycle (for cycle time tracking)

---

### 2. Normalize (Code Node)

Extracts and validates the incoming data:

```javascript
const worker = $json.body.worker_name
const activity = $json.body.activity_type
const eventTime = $json.event_time || new Date().toISOString();

if (!activity) {
  return {};
}

return {
  json: {
    worker_name: worker,
    activity_type: activity,
    event_time: eventTime
  }
};
```

---

### 3. Select Postgres

Fetches the worker's current state from `activity_state`:

```sql
SELECT
  w.worker_name,
  s.last_activity,
  s.last_start_time
FROM (SELECT $1::text AS worker_name) w
LEFT JOIN activity_state s
  ON s.worker_name = w.worker_name;
```

**Query Replacement:** `{{ $('Receive Activity Data1').item.json.body.worker_name }}`

---

### 4. Merge

Combines the normalized input data with the database state lookup result.

---

### 5. Calculate (Code Node)

The main logic node that determines what to do:

```javascript
const worker = $json.worker_name;
const activity = $json.activity_type;
const now = new Date($json.event_time);

const lastActivity = $json.last_activity;
const lastStartRaw = $json.last_start_time;

// CASE 1: No previous state - Initialize
if (!lastActivity || !lastStartRaw) {
  return {
    json: {
      shouldInsert: false,
      shouldUpsert: true,
      reason: "Initialized",
      upsert: {
        worker_name: worker,
        last_activity: activity,
        last_start_time: now.toISOString(),
        last_seen_time: now.toISOString(),
      },
    },
  };
}

const lastStart = new Date(lastStartRaw);

// CASE 2: Same activity - Just update last_seen_time
if (activity === lastActivity) {
  return {
    json: {
      shouldInsert: false,
      shouldUpsert: true,
      reason: "No change",
      upsert: {
        worker_name: worker,
        last_activity: lastActivity,
        last_start_time: lastStart.toISOString(),
        last_seen_time: now.toISOString(),
      },
    },
  };
}

// CASE 3: Activity changed - Log previous activity and start new one
const durationMinutes = Math.max(
  0,
  Math.round((now.getTime() - lastStart.getTime()) / 60000)
);

return {
  json: {
    shouldInsert: true,
    shouldUpsert: true,
    reason: "Changed",
    insert: {
      worker_name: worker,
      activity_type: lastActivity,
      duration_minutes: durationMinutes,
      start_time: lastStart.toISOString(),
      end_time: now.toISOString(),
    },
    upsert: {
      worker_name: worker,
      last_activity: activity,
      last_start_time: now.toISOString(),
      last_seen_time: now.toISOString(),
    },
  },
};
```

---

### 6. If (Conditional)

Routes based on flags:
- **True branch (shouldInsert AND shouldUpsert):** Insert activity log, then upsert state
- **False branch (only shouldUpsert):** Only upsert state (no activity change)

---

### 7. Store Activity in PostgreSQL

Inserts completed activity into `activity_logs`:

**Table:** `activity_logs`  
**Columns mapped:**
- `worker_name` ← `{{ $json.insert.worker_name }}`
- `activity_type` ← `{{ $json.insert.activity_type }}`
- `duration_minutes` ← `{{ $json.insert.duration_minutes }}`
- `start_time` ← `{{ $json.insert.start_time }}`
- `end_time` ← `{{ $json.insert.end_time }}`

---

### 8. Upsert State into activity_state

Updates the current worker state:

```sql
INSERT INTO activity_state (worker_name, last_activity, last_start_time, last_seen_time)
VALUES (
  '{{ $('Calculate').item.json.upsert.worker_name }}',
  '{{ $('Calculate').item.json.upsert.last_activity }}',
  '{{ $('Calculate').item.json.upsert.last_start_time }}'::timestamptz,
  '{{ $('Calculate').item.json.upsert.last_seen_time }}'::timestamptz
)
ON CONFLICT (worker_name)
DO UPDATE SET
  last_activity = EXCLUDED.last_activity,
  last_start_time = EXCLUDED.last_start_time,
  last_seen_time = EXCLUDED.last_seen_time;
```

---

## Sending Events to the Webhook

### Using Python

```python
import requests

url = "http://your-n8n-instance:5678/webhook/work-monitor"

# Send activity event
response = requests.post(url, json={
    "worker_name": "John Doe",
    "activity_type": "Working"
})

print(response.status_code)
```

### Using cURL

```bash
curl -X POST http://your-n8n-instance:5678/webhook/work-monitor \
  -H "Content-Type: application/json" \
  -d '{"worker_name": "John Doe", "activity_type": "Working"}'
```

### Using JavaScript/Node.js

```javascript
const response = await fetch('http://your-n8n-instance:5678/webhook/work-monitor', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    worker_name: 'John Doe',
    activity_type: 'Working'
  })
});
```

---

## Integration with Camera/AI System

Your camera AI detection system should call this webhook whenever it detects:

1. **Worker identified** → Send `Working` or appropriate activity
2. **Worker idle** → Send `Idle`
3. **Worker on break** → Send `Break`
4. **Worker left frame** → Send `Away`
5. **Cycle completed** → Send `cycle` (for cycle time tracking)

**Example flow:**
```
Camera detects "John" working → POST { worker_name: "John", activity_type: "Working" }
30 seconds later, still working → POST { worker_name: "John", activity_type: "Working" }
John stops and stands idle → POST { worker_name: "John", activity_type: "Idle" }
John walks away → POST { worker_name: "John", activity_type: "Away" }
```

---

## How Brother Eye Uses This Data

### Real-time Worker Status

Brother Eye queries `activity_state` to show current worker status:

```sql
SELECT worker_name, last_activity, last_start_time, last_seen_time
FROM activity_state
ORDER BY last_seen_time DESC;
```

### Stale Detection (Worker Not Active)

If `last_seen_time` is more than 5 minutes old, the worker is considered "stale" (not detected):

```javascript
const isStale = (lastSeenTime) => {
  const diff = Date.now() - new Date(lastSeenTime).getTime();
  return diff > 5 * 60 * 1000; // 5 minutes
};
```

### Alert Generation

Brother Eye's `recomputeAlerts` function checks:
- Is the assigned operator's state stale? → **OperatorNotPresent** alert
- Has the operator been idle > 10 minutes? → **OperatorIdle** alert
- Is the operator working past shift end? → **OvertimeAlert**

---

## Troubleshooting

### Webhook not receiving data

1. Check if workflow is **activated** (toggle in top right)
2. Check if URL is correct (copy from webhook node)
3. Check n8n logs for errors

### Database errors

1. Verify PostgreSQL credentials in n8n
2. Ensure tables `activity_state` and `activity_logs` exist
3. Check that `activity_state.worker_name` has a UNIQUE constraint

### Workers not showing in Brother Eye

1. Send a test event to the webhook
2. Check `activity_state` table directly:
   ```sql
   SELECT * FROM activity_state;
   ```
3. Verify `last_seen_time` is recent (not stale)

### Events not being logged

1. Check n8n execution history for errors
2. Verify the `Calculate` node is outputting `shouldInsert: true` on activity changes
3. Check `activity_logs` table:
   ```sql
   SELECT * FROM activity_logs ORDER BY id DESC LIMIT 10;
   ```

---

## Workflow JSON

The complete workflow JSON is available at:
```
/backend/n8n-workflow.json
```

Import this file into your n8n instance to get started.

---

## Support

For issues with:
- **n8n workflow** → Check n8n documentation: https://docs.n8n.io
- **Brother Eye integration** → Check the backend server logs
- **Database issues** → Run the SQL scripts in `/scripts/` folder
