import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { projectRoot } from '../config';

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    const root = projectRoot();
    const dbPath = process.env.DB_PATH
      ? path.resolve(root, process.env.DB_PATH)
      : path.join(root, 'data', 'jarvis.db');
    const dbDir = path.dirname(dbPath);

    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    console.log(`Connected to SQLite database at ${dbPath}`);
    applySchema(db);
  }
  return db;
}

function applySchema(database: Database.Database) {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');
  database.exec(schema);

  const columns = database.prepare('PRAGMA table_info(n8n_workflows)').all() as { name: string }[];
  if (columns.length > 0 && !columns.some((c) => c.name === 'webhook_path')) {
    database.exec('ALTER TABLE n8n_workflows ADD COLUMN webhook_path TEXT NOT NULL DEFAULT ""');
    console.log('Migrated n8n_workflows: added webhook_path.');
  }

  console.log('Database schema applied.');
}

export function closeDb() {
  if (db) db.close();
}