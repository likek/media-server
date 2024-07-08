import { getIpByReq, getUserIdByReq } from "../utils/index.js"
import fs from "fs";
import { PERMISSION_FULL_PATH } from "../../serverConfig.js";

let permissions = {};
const loadPermissions = () => {
    try {
      const data = fs.readFileSync(PERMISSION_FULL_PATH, "utf8");
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
  
    const userIp = getIpByReq(req);
    let userId = getUserIdByReq(req);
    const requestUrl = req.originalUrl.split("?")[0].replace(/^\/i/, '');
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
  
    res.status(403).json({ message: "无权限" });
  };

  export {
    checkPermissions
  }
