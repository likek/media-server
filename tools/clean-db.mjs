import db, { serializeDb } from "../server/dbserialize.js";
import { cleanDbTreeByPath } from "../server/fileDbManager.js";

serializeDb();

const args = process.argv.slice(2);
const root = (args[0] || "").toString();
const dryRun = args.includes("--dry-run");
const fixThumbnails = args.includes("--fix-thumbnails");

const result = await cleanDbTreeByPath(root, { dryRun, fixThumbnails, maxFolders: 20000 });
console.log(result);
db.close();

