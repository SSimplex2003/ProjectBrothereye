// scripts/run-migrations.js
// Runs all SQL migration scripts in order

import pg from "pg"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const { Pool } = pg

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "mysecretpassword",
  database: process.env.DB_NAME || "factory_manager",
})

async function runMigrations() {
  console.log("===================================")
  console.log("Running Database Migrations")
  console.log("===================================\n")

  try {
    // Test connection
    const testResult = await pool.query("SELECT NOW() as now")
    console.log(`Connected to database at ${testResult.rows[0].now}\n`)

    // Create migrations tracking table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        filename TEXT UNIQUE NOT NULL,
        executed_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)

    // Get list of already executed migrations
    const executed = await pool.query("SELECT filename FROM _migrations")
    const executedFiles = new Set(executed.rows.map((r) => r.filename))

    // Get all SQL files in scripts directory
    const scriptsDir = __dirname
    const files = fs
      .readdirSync(scriptsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort()

    if (files.length === 0) {
      console.log("No migration files found.")
      return
    }

    let migrationsRan = 0

    for (const file of files) {
      if (executedFiles.has(file)) {
        console.log(`[SKIP] ${file} (already executed)`)
        continue
      }

      console.log(`[RUN]  ${file}`)

      const filePath = path.join(scriptsDir, file)
      const sql = fs.readFileSync(filePath, "utf8")

      try {
        await pool.query(sql)
        await pool.query("INSERT INTO _migrations (filename) VALUES ($1)", [file])
        console.log(`       Successfully executed ${file}`)
        migrationsRan++
      } catch (err) {
        console.error(`\n[ERROR] Failed to execute ${file}:`)
        console.error(`        ${err.message}`)
        if (err.detail) console.error(`        Detail: ${err.detail}`)
        if (err.hint) console.error(`        Hint: ${err.hint}`)
        process.exit(1)
      }
    }

    console.log("\n===================================")
    if (migrationsRan > 0) {
      console.log(`Migrations complete! Ran ${migrationsRan} new migration(s).`)
    } else {
      console.log("Database is up to date. No new migrations to run.")
    }
    console.log("===================================\n")
  } catch (err) {
    console.error("Failed to connect to database:")
    console.error(err.message)
    console.error("\nMake sure the database is running:")
    console.error("  ./scripts/init-db-docker.sh")
    process.exit(1)
  } finally {
    await pool.end()
  }
}

runMigrations()
