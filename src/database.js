import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import Database from "better-sqlite3";

export function createDatabase(databasePath = process.env.DATABASE_PATH ?? "./data/shortener.sqlite") {
  const resolvedPath = databasePath === ":memory:" ? databasePath : resolve(databasePath);
  if (resolvedPath !== ":memory:") {
    mkdirSync(dirname(resolvedPath), { recursive: true });
  }

  const database = new Database(resolvedPath);
  database.pragma("foreign_keys = ON");
  database.pragma("busy_timeout = 5000");
  database.pragma("journal_mode = WAL");
  database.exec(`
    CREATE TABLE IF NOT EXISTS links (
      id INTEGER PRIMARY KEY,
      short_code TEXT NOT NULL UNIQUE,
      destination TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS analytics_events (
      id INTEGER PRIMARY KEY,
      link_id INTEGER NOT NULL REFERENCES links(id),
      type TEXT NOT NULL CHECK (type IN ('create', 'click')),
      timestamp INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS analytics_events_timestamp_idx
      ON analytics_events(timestamp);
    CREATE INDEX IF NOT EXISTS analytics_events_link_timestamp_idx
      ON analytics_events(link_id, timestamp);
    CREATE INDEX IF NOT EXISTS analytics_events_type_timestamp_idx
      ON analytics_events(type, timestamp);
  `);
  return database;
}
