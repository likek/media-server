import dbPromise from './db.js';

const initAll = async () => {
  const db = await dbPromise;
  await db.run(`
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

  await db.run(`
    CREATE TABLE IF NOT EXISTS logs_ws (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      time TEXT,
      action TEXT,
      userId TEXT,
      userIp TEXT,
      userRegion TEXT
    )
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS blacklist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ip TEXT,
      cookies TEXT,
      userId TEXT,
      added_time TEXT,
      enabled INTEGER DEFAULT 1
    )
  `);

  await db.run(`
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
    )
  `);

  await db.run(`
    CREATE TRIGGER IF NOT EXISTS limit_logs_request
    AFTER INSERT ON logs_request
    WHEN (SELECT COUNT(*) FROM logs_request) > 10000
    BEGIN
      DELETE FROM logs_request WHERE id IN (
        SELECT id FROM logs_request ORDER BY timestamp ASC LIMIT (SELECT COUNT(*) - 10000 FROM logs_request)
      );
    END;
  `);

  await db.run(`
    CREATE TRIGGER IF NOT EXISTS limit_logs_ws
    AFTER INSERT ON logs_ws
    WHEN (SELECT COUNT(*) FROM logs_ws) > 10000
    BEGIN
      DELETE FROM logs_ws WHERE id IN (
        SELECT id FROM logs_ws ORDER BY time ASC LIMIT (SELECT COUNT(*) - 10000 FROM logs_ws)
      );
    END;
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS file_system (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      path TEXT,
      type TEXT,
      parent_id INTEGER,
      last_modified TEXT,
      size INTEGER,
      thumbnail TEXT,
      FOREIGN KEY(parent_id) REFERENCES file_system(id)
    )
  `);
};

export async function serializeDb() {
  await initAll()
}
