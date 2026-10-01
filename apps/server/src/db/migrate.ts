import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import type { Database } from 'better-sqlite3';

const defaultDir = fileURLToPath(new URL('./migrations/', import.meta.url));
const filePattern = /^(\d{3})_([\w-]+)\.sql$/;

interface Migration {
  version: number;
  name: string;
  file: string;
}

function listMigrations(dir: string): Migration[] {
  return readdirSync(dir)
    .flatMap((file) => {
      const m = filePattern.exec(file);
      return m ? [{ version: Number(m[1]), name: m[2] ?? file, file: join(dir, file) }] : [];
    })
    .sort((a, b) => a.version - b.version);
}

export function migrate(db: Database, dir = defaultDir): number[] {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL
  )`);
  const applied = new Set(
    db.prepare<[], { version: number }>('SELECT version FROM schema_migrations').all().map((r) => r.version),
  );
  const record = db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)');
  const ran: number[] = [];
  for (const m of listMigrations(dir)) {
    if (applied.has(m.version)) continue;
    const sql = readFileSync(m.file, 'utf8');
    db.transaction(() => {
      db.exec(sql);
      record.run(m.version, m.name, new Date().toISOString());
    })();
    ran.push(m.version);
  }
  return ran;
}
