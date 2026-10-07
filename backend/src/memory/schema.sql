CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  title TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY, category TEXT NOT NULL, key TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, description TEXT,
  path TEXT NOT NULL, stack TEXT, status TEXT DEFAULT 'active',
  notes TEXT, updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, detail TEXT,
  status TEXT DEFAULT 'pending', due_date TEXT,
  project_id TEXT REFERENCES projects(id),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP, completed_at TEXT
);

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY, title TEXT, body TEXT NOT NULL, tags TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tool_logs (
  id TEXT PRIMARY KEY, tool TEXT NOT NULL, args TEXT,
  result_summary TEXT, status TEXT, duration_ms INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS n8n_workflows (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  n8n_workflow TEXT NOT NULL,
  webhook_path TEXT NOT NULL,
  description TEXT,
  category TEXT,
  risk TEXT DEFAULT 'LOW',
  input_schema TEXT,
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
