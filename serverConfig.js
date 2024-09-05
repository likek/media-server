import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const uploadDirName = "uploads";
const UPLOAD_DIR = path.join(__dirname, `${uploadDirName}`);
const THUMB_DIR = path.join(__dirname, "thumbnails");


export {
    UPLOAD_DIR,
    THUMB_DIR
}
export default {
    maxRequestsPerMinute: 600,
    blacklistDurationMs: 1800000
}
