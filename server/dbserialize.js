import sqlite3 from "sqlite3";
const db = new sqlite3.Database("./database.db");

const initAll = () => {
  db.run(`
    CREATE TABLE IF NOT EXISTS logs_request (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      requestTime TEXT,
      userIp TEXT,
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
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS logs_ws (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      time TEXT,
      action TEXT,
      userId TEXT,
      userIp TEXT,
      userRegion TEXT,
      location TEXT
    )
  `);

  db.run(`
  CREATE TABLE IF NOT EXISTS blacklist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ip TEXT,
      cookies TEXT,
      userId TEXT,
      added_time TEXT,
      enabled INTEGER DEFAULT 1
  )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS blacklist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId TEXT,
      cookies TEXT,
      ip TEXT,
      added_time TEXT
    );
    `)

  db.run(`
    CREATE TABLE IF NOT EXISTS userInfo (
      userId TEXT PRIMARY KEY,
      ip TEXT,
      create_time TEXT,
      update_time TEXT,
      userAgent TEXT,
      region TEXT,
      device TEXT,
      os TEXT,
      browser TEXT
    );
    `)

  db.run(`
    CREATE TABLE IF NOT EXISTS logs_file_accessed (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      time TEXT,
      userId TEXT,
      userIp TEXT,
      filePath TEXT
    )
  `);

  db.run(`
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
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (parent_id) REFERENCES files(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS favorites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      file_id INTEGER NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE,
      UNIQUE(user_id, file_id)
    )
  `);

  db.run(`
    CREATE TRIGGER IF NOT EXISTS limit_logs_request
    AFTER INSERT ON logs_request
    WHEN (SELECT COUNT(*) FROM logs_request) > 10000
    BEGIN
      DELETE FROM logs_request WHERE id IN (
        SELECT id FROM logs_request ORDER BY timestamp ASC LIMIT (SELECT COUNT(*) - 10000 FROM logs_request)
      );
    END;
  `);

  db.run(`
    CREATE TRIGGER IF NOT EXISTS limit_logs_ws
    AFTER INSERT ON logs_ws
    WHEN (SELECT COUNT(*) FROM logs_ws) > 10000
    BEGIN
      DELETE FROM logs_ws WHERE id IN (
        SELECT id FROM logs_ws ORDER BY time ASC LIMIT (SELECT COUNT(*) - 10000 FROM logs_ws)
      );
    END;
  `);

  db.run(`
    CREATE TRIGGER IF NOT EXISTS limit_logs_file_accessed
    AFTER INSERT ON logs_file_accessed
    WHEN (SELECT COUNT(*) FROM logs_file_accessed) > 10000
    BEGIN
      DELETE FROM logs_file_accessed WHERE id IN (
        SELECT id FROM logs_file_accessed ORDER BY time ASC LIMIT (SELECT COUNT(*) - 10000 FROM logs_file_accessed)
      );
    END;
  `);

}


export function serializeDb() {
  db.serialize(initAll);
}

export default db;