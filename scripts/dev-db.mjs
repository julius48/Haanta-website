#!/usr/bin/env node
/**
 * Local PostgreSQL without Docker (used on Windows dev machines and for integration tests).
 *   node scripts/dev-db.mjs start|stop|status
 * Elsewhere, `docker compose up -d postgres redis` gives the same databases.
 *
 * Listens on loopback only (127.0.0.1 and ::1). The app connects as the non-superuser role `haanta`, which owns the
 * `haanta` and `haanta_test` databases (least privilege; production uses separate migration and
 * runtime roles, see docs/runbook.md).
 */
import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { createRequire } from "node:module"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const dataDir = join(root, ".dev-db", "data")
const port = process.env.DEV_DB_PORT || "54329"
const superPassword = process.env.DEV_DB_SUPERUSER_PASSWORD || "postgres-local-only"
const appPassword = process.env.DEV_DB_APP_PASSWORD || "haanta-local-only"

async function binaries() {
  if (process.platform !== "win32") {
    console.error("On macOS/Linux use: docker compose up -d postgres redis")
    process.exit(1)
  }
  const mod = await import("@embedded-postgres/windows-x64")
  return mod
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: "inherit", ...opts })
  if (r.status !== 0 && !opts.allowFail) throw new Error(`${cmd} ${args.join(" ")} failed (${r.status})`)
  return r.status
}

async function ensureRolesAndDatabases() {
  const require = createRequire(join(root, "apps", "backend", "package.json"))
  const { Client } = require("pg")
  const admin = new Client({ host: "127.0.0.1", port: Number(port), user: "postgres", password: superPassword, database: "postgres" })
  await admin.connect()
  // Local dev/test cluster only: trade durability for speed (test databases are throwaway).
  // NEVER use these settings for staging or production.
  for (const s of ["fsync = off", "synchronous_commit = off", "full_page_writes = off", "max_connections = 200"]) {
    await admin.query(`ALTER SYSTEM SET ${s}`)
  }
  const role = await admin.query("SELECT 1 FROM pg_roles WHERE rolname = 'haanta'")
  if (role.rowCount === 0) {
    await admin.query(`CREATE ROLE haanta LOGIN PASSWORD '${appPassword.replace(/'/g, "''")}' CREATEDB NOSUPERUSER NOCREATEROLE`)
  }
  for (const db of ["haanta", "haanta_test"]) {
    const exists = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [db])
    if (exists.rowCount === 0) await admin.query(`CREATE DATABASE ${db} OWNER haanta`)
  }
  await admin.end()
}

async function start() {
  const { initdb, pg_ctl } = await binaries()
  if (!existsSync(join(dataDir, "PG_VERSION"))) {
    mkdirSync(dataDir, { recursive: true })
    const pwfile = join(root, ".dev-db", "pw.txt")
    writeFileSync(pwfile, superPassword)
    run(initdb, ["-D", dataDir, "-U", "postgres", "--pwfile", pwfile, "-A", "scram-sha-256", "-E", "UTF8", "--locale=C"])
  }
  const status = run(pg_ctl, ["status", "-D", dataDir], { allowFail: true, stdio: "ignore" })
  if (status !== 0) {
    // stdio must be detached: on Windows the server inherits the pipes and spawnSync would never return.
    run(pg_ctl, ["start", "-D", dataDir, "-w", "-l", join(root, ".dev-db", "postgres.log"), "-o", `-p ${port} -h 127.0.0.1,::1`], { stdio: "ignore" })
  }
  await ensureRolesAndDatabases()
  console.log(`Postgres ready: postgres://haanta:***@127.0.0.1:${port}/haanta`)
}

async function stop() {
  const { pg_ctl } = await binaries()
  run(pg_ctl, ["stop", "-D", dataDir, "-m", "fast"], { allowFail: true })
}

async function status() {
  const { pg_ctl } = await binaries()
  run(pg_ctl, ["status", "-D", dataDir], { allowFail: true })
}

const cmd = process.argv[2] || "start"
const actions = { start, stop, status }
if (!actions[cmd]) {
  console.error("usage: dev-db.mjs start|stop|status")
  process.exit(1)
}
actions[cmd]().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
