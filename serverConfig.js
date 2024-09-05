import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const uploadDirName = "uploads";
const thumbnailDirName = "thumbnails";
const UPLOAD_DIR = path.join(__dirname, `${uploadDirName}`);
const THUMB_DIR = path.join(__dirname, `${thumbnailDirName}`);


export {
    UPLOAD_DIR,
    THUMB_DIR,
    uploadDirName,
    thumbnailDirName
}
export default {
    maxRequestsPerMinute: 600,
    blacklistDurationMs: 1800000
}
