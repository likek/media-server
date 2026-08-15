import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_FULL_PATH = path.resolve(__dirname);
const RUNTIME_FULL_PATH = path.resolve(process.env.MEDIA_SERVER_RUNTIME_DIR || PROJECT_FULL_PATH);
const DB_FULL_PATH = path.join(RUNTIME_FULL_PATH, "database.db");
const APP_RESOURCES_FULL_PATH = path.join(PROJECT_FULL_PATH, "resources");
const APP_MODEL_CACHE_FULL_PATH = path.join(APP_RESOURCES_FULL_PATH, "model-cache");
const PERMISSION_FULL_PATH = path.join(PROJECT_FULL_PATH, "permission.json");
const LEGACY_IP2REGION_DB_FULL_PATH = path.join(PROJECT_FULL_PATH, "server", "ip2region.xdb");
const IP2REGION_DB_FULL_PATH = fs.existsSync(path.join(APP_RESOURCES_FULL_PATH, "ip2region.xdb"))
    ? path.join(APP_RESOURCES_FULL_PATH, "ip2region.xdb")
    : LEGACY_IP2REGION_DB_FULL_PATH;
const MODEL_CACHE_FULL_PATH = path.join(RUNTIME_FULL_PATH, ".cache");

// 解析命令行参数
function parseCommandLineArgs() {
    const args = process.argv.slice(2);
    const params = {};
    
    for (let i = 0; i < args.length; i++) {
        if (args[i].startsWith('--')) {
            const param = args[i].slice(2);
            const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true;
            params[param] = value;
            if (value !== true) i++;
        }
    }
    
    return params;
}

const cmdArgs = parseCommandLineArgs();

// 项目内部固定路径
const TRASH_FULL_PATH = path.join(RUNTIME_FULL_PATH, "./.trash");
const THUMB_FULL_PATH = path.join(RUNTIME_FULL_PATH, "./.thumbnails");
const TEMP_FULL_PATH = path.join(RUNTIME_FULL_PATH, "./.temp");
const HLS_SOURCE_DIR = path.join(RUNTIME_FULL_PATH, "./.hls_source");
const HIDDEN_MENU_HOME_TAP_PASSWORD = String(process.env.HIDDEN_MENU_HOME_TAP_PASSWORD || "4253")
    .replace(/[^2-9]/g, "")
    .slice(0, 8) || "4253";

// 路由名称配置
const MEDIA_ROUTE = "/media";
const THUMB_ROUTE = "/thumbnail";
const ENTRY_ROUTE_REGEX = /^\/(?!api|media|thumbnail).*/;

if (!cmdArgs.path) {
    console.error("请提供文件夹路径参数 --path");
    process.exit(1);
}

const inputPath = path.resolve(cmdArgs.path);

// 检查路径是否存在
if (!fs.existsSync(inputPath)) {
    console.error(`文件夹 ${inputPath} 不存在`);
    process.exit(1);
}

// 检查是否是文件夹
if (!fs.lstatSync(inputPath).isDirectory()) {
    console.error(`路径 ${inputPath} 不是一个文件夹`);
    process.exit(1);
}

const currentDir = path.resolve(__dirname);
if (inputPath === currentDir || inputPath.startsWith(currentDir) || currentDir.startsWith(inputPath)) {
    console.error(`path不能包含当前程序所在目录`);
    process.exit(1);
}

const MEDIA_FULL_PATH = inputPath;


export {
    MEDIA_ROUTE,
    THUMB_ROUTE,
    PROJECT_FULL_PATH,
    RUNTIME_FULL_PATH,
    DB_FULL_PATH,
    APP_RESOURCES_FULL_PATH,
    APP_MODEL_CACHE_FULL_PATH,
    PERMISSION_FULL_PATH,
    IP2REGION_DB_FULL_PATH,
    MODEL_CACHE_FULL_PATH,
    MEDIA_FULL_PATH,
    TRASH_FULL_PATH,
    THUMB_FULL_PATH,
    TEMP_FULL_PATH,
    ENTRY_ROUTE_REGEX,
    HLS_SOURCE_DIR,
    HIDDEN_MENU_HOME_TAP_PASSWORD
};
export default {
    maxRequestsPerMinute: 8 * 60,
    blacklistDurationMs: 60 * 60 * 1000,
    hiddenMenuHomeTapPassword: HIDDEN_MENU_HOME_TAP_PASSWORD
}
