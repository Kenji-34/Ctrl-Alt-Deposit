// DROP-IN REPLACEMENT for lib/db.ts using Node's built-in SQLite (Node 22.5+ / 24).
// Use this if better-sqlite3 will not install on Windows. To apply:
//   1. copy this file over lib/db.ts
//   2. remove "better-sqlite3" and "@types/better-sqlite3" from package.json
//   3. delete node_modules and run npm install
// It exposes the same calls the routes use: exec, prepare().run/get/all, transaction(fn).
// @ts-ignore (older @types/node has no types for node:sqlite)
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const dataFolder = path.join(process.cwd(), "data");
fs.mkdirSync(dataFolder, { recursive: true });

const raw = new DatabaseSync(path.join(dataFolder, "intentpay.db"));

raw.exec(`
  CREATE TABLE IF NOT EXISTS policies (
    id TEXT PRIMARY KEY,
    original_prompt TEXT NOT NULL,
    policy_json TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL
  )
`);

raw.exec(`
  CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    policy_id TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    merchant TEXT NOT NULL,
    category TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (policy_id) REFERENCES policies(id)
  )
`);

const db = {
  exec: (sql: string) => raw.exec(sql),
  prepare: (sql: string) => {
    const stmt = raw.prepare(sql);
    return {
      run: (...args: any[]) => stmt.run(...args),
      get: (...args: any[]) => stmt.get(...args),
      all: (...args: any[]) => stmt.all(...args),
    };
  },
  // Same behaviour as better-sqlite3's db.transaction(fn): returns a function to call.
  // Like better-sqlite3 it also offers .immediate() / .deferred() / .exclusive(),
  // which take the database lock up front (the authorise route relies on .immediate()).
  transaction: <T,>(fn: () => T) => {
    const make = (mode: string) => (): T => {
      raw.exec(`BEGIN ${mode}`.trim());
      try {
        const result = fn();
        raw.exec("COMMIT");
        return result;
      } catch (error) {
        raw.exec("ROLLBACK");
        throw error;
      }
    };
    return Object.assign(make(""), {
      immediate: make("IMMEDIATE"),
      deferred: make("DEFERRED"),
      exclusive: make("EXCLUSIVE"),
    });
  },
};

db.exec(`
  CREATE TABLE IF NOT EXISTS idempotency_records (
    policy_id TEXT NOT NULL,
    request_id TEXT NOT NULL,
    request_hash TEXT NOT NULL,
    response_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (policy_id, request_id)
  )
`);


// Additive migrations: safe to run on an existing data/intentpay.db.
export function ensureColumn(table: string, column: string, ddl: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  }
}

// One row per customer: the cap across ALL of that customer's agents.
db.exec(`
  CREATE TABLE IF NOT EXISTS customer_limits (
    customer_id TEXT PRIMARY KEY,
    limit_cents INTEGER NOT NULL,
    period TEXT NOT NULL DEFAULT 'week',
    updated_at TEXT NOT NULL
  )
`);

ensureColumn("policies", "agent_id", "TEXT");

// Registry of the customer's AI agents. A policy (mandate) belongs to one agent.
db.exec(`
  CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    created_at TEXT NOT NULL
  )
`);

// "Ask customer" outcomes wait here until the customer approves or rejects.
db.exec(`
  CREATE TABLE IF NOT EXISTS pending_approvals (
    id TEXT PRIMARY KEY,
    policy_id TEXT NOT NULL,
    token TEXT,
    agent_id TEXT,
    merchant_name TEXT NOT NULL,
    category TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    currency TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL,
    outcome TEXT,
    created_at TEXT NOT NULL,
    resolved_at TEXT
  )
`);

ensureColumn("agents", "type", "TEXT"); // e.g. "AI assistant"
ensureColumn("agents", "network_agent_id", "TEXT"); // identity as established by the (simulated) network
ensureColumn("agents", "network_verified", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("pending_approvals", "receipt_id", "TEXT");
ensureColumn("pending_approvals", "ai_note", "TEXT");

export default db;
