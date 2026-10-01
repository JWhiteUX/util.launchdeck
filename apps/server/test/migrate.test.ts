import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { openDb } from '../src/db/index.ts';
import { migrate } from '../src/db/migrate.ts';

const migrationFiles = readdirSync(fileURLToPath(new URL('../src/db/migrations/', import.meta.url))).filter((f) =>
  /^\d{3}_.+\.sql$/.test(f),
);

describe('migrations', () => {
  it('creates the schema and records each migration once', () => {
    const db = openDb(':memory:');
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .pluck()
      .all();
    expect(tables).toEqual([
      'campaign_folders',
      'campaigns',
      'change_events',
      'folder_snapshot',
      'folders',
      'schema_migrations',
    ]);
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    db.close();
  });

  it('is idempotent', () => {
    const db = new Database(':memory:');
    expect(migrate(db)).toHaveLength(migrationFiles.length);
    expect(migrate(db)).toEqual([]);
    const rows = db.prepare('SELECT version, name, applied_at FROM schema_migrations ORDER BY version').all();
    expect(rows).toHaveLength(migrationFiles.length);
    expect(rows[0]).toMatchObject({ version: 1, name: 'init' });
    db.close();
  });

  it('enforces CHECK constraints', () => {
    const db = openDb(':memory:');
    const insert = () =>
      db
        .prepare(
          `INSERT INTO campaigns VALUES ('x', 'n', 'o', '2026-01-01', '2026-01-02', 'bogus', NULL, 't', 't')`,
        )
        .run();
    expect(insert).toThrow(/CHECK/);
    db.close();
  });
});
