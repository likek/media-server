import sqlite3 from "sqlite3";
const db = new sqlite3.Database("./database.db");

db.serialize(() => {
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
    CREATE TABLE IF NOT EXISTS blacklist (
      ip TEXT PRIMARY KEY,
      cookies TEXT,
      userId TEXT,
      added_time TEXT
    );
    `)

  db.run(`
    CREATE TRIGGER IF NOT EXISTS limit_logs
    AFTER INSERT ON logs_request
    WHEN (SELECT COUNT(*) FROM logs_request) > 10000
    BEGIN
      DELETE FROM logs_request WHERE id IN (
        SELECT id FROM logs_request ORDER BY timestamp ASC LIMIT (SELECT COUNT(*) - 10000 FROM logs_request)
      );
    END;
  `);
});

export default db;