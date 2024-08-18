
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


const folderLockConfigPath = path.join(__dirname, "../../folderLockCfg.json");
let folderLockConfig = {};

const loadFolderLockConfig = () => {
    try {
      const data = fs.readFileSync(folderLockConfigPath, "utf8");
      folderLockConfig = JSON.parse(data);
    } catch (err) {
      console.error(
        "Failed to load permissions, using default permissions:",
        err
      );
      folderLockConfig = {};
    }
  };
  
  loadFolderLockConfig();

  const folderLockHandler = (req, res, next) => {
    if (!req.body) {
      return next();
    }
    const requestUrl = req.originalUrl.split("?")[0];
    let sourcePath = "";
    let targetPath = "";
    if (requestUrl === "/move") {
      const { filename, targetFolder, currentPath } = req.body || {};
      sourcePath = `${currentPath}/${filename}`;
      targetPath = `${targetFolder}/${filename}`;
    } else if (requestUrl === "/delete") {
      const { filename, path: currentPath } = req.body;
      sourcePath = `${currentPath}/${filename}`;
    } else if (requestUrl === "/rename") {
      const { path: currentPath, oldName, newName, type } = req.body;
      sourcePath = `${currentPath}/${oldName}`;
      targetPath = `${currentPath}/${newName}`;
    } else if (requestUrl === "/files") {
      sourcePath = req.body?.path || "";
    } else {
      return next();
    }
  
    if (sourcePath?.startsWith("/")) {
      sourcePath = sourcePath.slice(1);
    }
  
    if (targetPath?.startsWith("/")) {
      targetPath = targetPath.slice(1);
    }
  
    loadFolderLockConfig();
    const sourceCfgPw = folderLockConfig[sourcePath]?.pw;
    const targetCfgPw = targetPath && folderLockConfig[targetPath]?.pw;
  
    if (requestUrl === "/move" || requestUrl === "/rename") {
      if (sourceCfgPw) {
        return res.status(403).send({ message: "源文件夹/文件不支持该操作" });
      }
  
      if (targetCfgPw) {
        return res.status(403).send({ message: "目标文件夹/文件不支持该操作" });
      }
    }
  
    if (!sourceCfgPw) {
      return next();
    }
    const lockRoutes = folderLockConfig[sourcePath].routes || [
      "/files",
      "/delete",
      "/rename",
    ];
    if (lockRoutes.includes(requestUrl)) {
      if (!sourcePath) {
        return next();
      }
      const pw = req.body.pw;
      if (sourceCfgPw && sourceCfgPw !== pw) {
        return res
          .status(403)
          .send({
            lock: true,
            message: !pw ? `该文件夹的操作需要密码` : "密码错误",
          });
      }
    }
    return next();
  }

  export default folderLockHandler;