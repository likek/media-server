import Database from "better-sqlite3";
const db = new Database('./database.db');

const initAll = () => {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS logs_request (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      time TEXT,
      userIp TEXT,
      userId TEXT,
      requestMethod TEXT,
      requestUrl TEXT,
      requestBody TEXT,
      status INTEGER,
      userAgent TEXT,
      region TEXT,
      device TEXT,
      os TEXT,
      browser TEXT,
      timestamp TEXT
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS logs_ws (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      time TEXT,
      action TEXT,
      userId TEXT,
      userIp TEXT,
      userRegion TEXT,
      location TEXT
    )
  `).run();

  db.prepare(`
  CREATE TABLE IF NOT EXISTS blacklist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ip TEXT,
      cookies TEXT,
      userId TEXT,
      added_time TEXT,
      enabled INTEGER DEFAULT 1
  )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS userInfo (
      userId TEXT PRIMARY KEY,
      ip TEXT,
      create_time TEXT,
      update_time TEXT,
      userAgent TEXT,
      region TEXT,
      device TEXT,
      os TEXT,
      browser TEXT,
      iv TEXT
    );
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS logs_file_accessed (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      time TEXT,
      userId TEXT,
      userIp TEXT,
      filePath TEXT
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      parent_id INTEGER,
      path TEXT,
      size INTEGER,
      last_modified TEXT,
      mime_type TEXT,
      thumbnail TEXT,
      m3u8_path TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (parent_id) REFERENCES files(id) ON DELETE CASCADE
    )
  `).run();

  db.prepare('CREATE INDEX IF NOT EXISTS idx_files_parent_id ON files (parent_id)').run();
  db.prepare('CREATE INDEX IF NOT EXISTS idx_files_parent_name ON files (parent_id, name)').run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS favorites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      file_id INTEGER NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE,
      UNIQUE(user_id, file_id)
    )
  `).run();

  db.prepare(`
    CREATE TRIGGER IF NOT EXISTS limit_logs_request
    AFTER INSERT ON logs_request
    WHEN (SELECT COUNT(*) FROM logs_request) > 100000
    BEGIN
      DELETE FROM logs_request WHERE id IN (
        SELECT id FROM logs_request ORDER BY timestamp ASC LIMIT (SELECT COUNT(*) - 100000 FROM logs_request)
      );
    END;
  `).run();

  db.prepare(`
    CREATE TRIGGER IF NOT EXISTS limit_logs_ws
    AFTER INSERT ON logs_ws
    WHEN (SELECT COUNT(*) FROM logs_ws) > 10000
    BEGIN
      DELETE FROM logs_ws WHERE id IN (
        SELECT id FROM logs_ws ORDER BY time ASC LIMIT (SELECT COUNT(*) - 10000 FROM logs_ws)
      );
    END;
  `).run();

  db.prepare(`
    CREATE TRIGGER IF NOT EXISTS limit_logs_file_accessed
    AFTER INSERT ON logs_file_accessed
    WHEN (SELECT COUNT(*) FROM logs_file_accessed) > 50000
    BEGIN
      DELETE FROM logs_file_accessed WHERE id IN (
        SELECT id FROM logs_file_accessed ORDER BY time ASC LIMIT (SELECT COUNT(*) - 50000 FROM logs_file_accessed)
      );
    END;
  `).run();

}


export function serializeDb() {
  db.pragma('journal_mode = WAL')
  initAll();
}

export default db;