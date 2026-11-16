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


export default db;
