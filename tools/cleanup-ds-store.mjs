import db from "../server/dbserialize.js";

const res = db.prepare(`DELETE FROM files WHERE name = '.DS_Store' OR path = '.DS_Store' OR path LIKE '%/.DS_Store'`).run();
console.log({ deleted: res.changes });

