import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UPLOAD_ROUTE = "/uploads";
const THUMB_ROUTE = "/thumbnails";

const UPLOAD_PATH = "../uploads";
const THUMB_PATH = "../thumbnails";
const UPLOAD_DIR = path.join(__dirname, `${UPLOAD_PATH}`);
const THUMB_DIR = path.join(__dirname, THUMB_PATH);


export {
    UPLOAD_DIR,
    THUMB_DIR,
    UPLOAD_PATH as UPLOAD_DIR_NAME,
    THUMB_PATH as THUMB_DIR_NAME,
    UPLOAD_ROUTE,
    THUMB_ROUTE
}
export default {
    maxRequestsPerMinute: 6000,
    blacklistDurationMs: 1800000
}
