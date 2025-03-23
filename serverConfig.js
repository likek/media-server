import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
const THUMB_FULL_PATH = path.join(__dirname, "./.thumbnails");
const TEMP_FULL_PATH = path.join(__dirname, "./.temp");

// 路由名称配置
const MEDIA_ROUTE = "/media";
const THUMB_ROUTE = "/thumbnails";
const ENTRY_ROUTE_REGEX = /^\/(?!api|media|thumbnails).*/;

// 允许配置路径
// 使用path.resolve确保路径总是绝对路径
const MEDIA_FULL_PATH = cmdArgs.path ? path.resolve(cmdArgs.path) : path.join(__dirname, "../media");


export {
    MEDIA_ROUTE,
    THUMB_ROUTE,
    MEDIA_FULL_PATH,
    THUMB_FULL_PATH,
    TEMP_FULL_PATH,
    ENTRY_ROUTE_REGEX
};
export default {
    maxRequestsPerMinute: 6000,
    blacklistDurationMs: 1800000
}
