import { normalizeIp } from "../utils/index.js"
import { fileURLToPath } from "url";
import fs from "fs";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const permissionsFilePath = path.join(__dirname, "../../permission.json");
let permissions = {};
const loadPermissions = () => {
    try {
      const data = fs.readFileSync(permissionsFilePath, "utf8");
      permissions = JSON.parse(data);
    } catch (err) {
      console.error(
        "Failed to load permissions, using default permissions:",
        err
      );
      permissions = {};
    }
  };
  
  loadPermissions();

const checkPermissions = (req, res, next) => {
    loadPermissions();
  
    const userIp = normalizeIp(req.clientIp || req.ip);
    let userId = req.cookies.userId;
    const requestUrl = req.originalUrl.split("?")[0];
    const allowedUsers = permissions[requestUrl];
    if (!allowedUsers) {
      return next();
    }
  
    if (allowedUsers === "*") {
      return next();
    }
  
    if (allowedUsers.includes(userId) || allowedUsers.includes(userIp)) {
      return next();
    }
  
    res.status(403).json({ message: "请联系管理员为你添加该权限" });
  };

  export {
    checkPermissions
  }