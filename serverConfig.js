import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

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
    MEDIA_FULL_PATH,
    THUMB_FULL_PATH,
    TEMP_FULL_PATH,
    ENTRY_ROUTE_REGEX
};
export default {
    maxRequestsPerMinute: 1200,
    blacklistDurationMs: 1800000
}
