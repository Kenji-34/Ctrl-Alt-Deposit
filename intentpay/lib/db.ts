
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const dataFolder = path.join(process.cwd(), "data");

fs.mkdirSync(dataFolder, { recursive: true });

const db = new Database(
  path.join(dataFolder, "intentpay.db")
);

db.exec(`
  CREATE TABLE IF NOT EXISTS policies (
    id TEXT PRIMARY KEY,
    original_prompt TEXT NOT NULL,
    policy_json TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL
  )
`);

export default db;
