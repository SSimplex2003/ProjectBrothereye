import threading
import logging

log = logging.getLogger(__name__)


class PgWriter:
    """Thread-safe Postgres writer. Reconnects automatically on failure."""

    def __init__(self, dsn: str):
        self._dsn  = dsn
        self._conn = None
        self._lock = threading.Lock()

    def upsert_state(self, worker: str, activity: str,
                     start_ts: str, seen_ts: str) -> None:
        self._run("""
            INSERT INTO activity_state
                (worker_name, last_activity, last_start_time, last_seen_time)
            VALUES (%s, %s, %s::timestamptz, %s::timestamptz)
            ON CONFLICT (worker_name) DO UPDATE SET
                last_activity   = EXCLUDED.last_activity,
                last_start_time = EXCLUDED.last_start_time,
                last_seen_time  = EXCLUDED.last_seen_time;
        """, (worker, activity, start_ts, seen_ts))

    def insert_activity(self, worker: str, activity: str,
                        duration_min: float, start_ts: str, end_ts: str) -> None:
        self._run("""
            INSERT INTO activity_logs
                (worker_name, activity_type, duration_minutes, start_time, end_time)
            VALUES (%s, %s, %s, %s::timestamptz, %s::timestamptz);
        """, (worker, activity, duration_min, start_ts, end_ts))

    def insert_cycle(self, camera_id: str, worker: str, action: str,
                     count: int, duration_s: float, ts: str) -> None:
        self._run("""
            INSERT INTO cycle_logs
                (camera_id, worker_name, action_type, cycle_count, duration_s, ts)
            VALUES (%s, %s, %s, %s, %s, %s::timestamptz);
        """, (camera_id, worker, action, count, round(duration_s, 2), ts))

    def insert_workflow(self, camera_id: str, steps_json: str, duration_s: float,
                        start_ts: str, end_ts: str, count: int) -> None:
        self._run("""
            INSERT INTO workflow_cycles
                (camera_id, steps, duration_s, start_time, end_time, cycle_count)
            VALUES (%s, %s, %s, %s::timestamptz, %s::timestamptz, %s);
        """, (camera_id, steps_json, round(duration_s, 2), start_ts, end_ts, count))

    def _connect(self):
        import psycopg2
        if self._conn is None or self._conn.closed:
            self._conn = psycopg2.connect(self._dsn)
            self._conn.autocommit = True
            log.info("Postgres connected.")
        return self._conn

    def _run(self, sql: str, params: tuple) -> None:
        with self._lock:
            try:
                cur = self._connect().cursor()
                cur.execute(sql, params)
                cur.close()
            except Exception as exc:
                log.warning("Postgres write failed: %s", exc)
                try:
                    self._conn.close()
                except Exception:
                    pass
                self._conn = None
