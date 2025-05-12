import db from "../dbserialize.js";
import serverConfig from "../../serverConfig.js";
import { getIpByReq, getSaltByReq, normalizeIp } from "../utils/index.js";
import { aesDecrypt } from "../utils/encrypt.js";

// 存储每个用户的salt历史记录和非法请求计数
const userSaltHistory = new Map();
const illegalRequestCounts = new Map();

// 指纹前缀，用于验证合法性
const FINGERPRINT_PREFIX = "FP-";

// 验证指纹的中间件
function validateFingerprint(req, res, next) {
  // 从请求头获取指纹
  const salt = getSaltByReq(req);
  if (!salt) {
    console.log("验证salt失败，缺少salt值");
    return res.status(401).json({ message: "缺少salt值" });
  }

  let fingerprint = req.headers['x-fp'];
  // 检查指纹是否存在
  if (!fingerprint) {
    console.log("验证指纹失败，缺少指纹信息");
    return res.status(401).json({ message: "缺少指纹信息" });
  }

  fingerprint = aesDecrypt(fingerprint, salt);
  
  // 检查指纹格式是否合法（以特定前缀开头）
  if (!fingerprint.startsWith(FINGERPRINT_PREFIX)) {
    console.log("验证指纹失败，指纹格式不合法");
    return res.status(401).json({ message: "指纹格式不合法" });
  }
  
  // 将指纹存储在请求对象中，以便后续中间件和路由处理程序使用
  req.fingerprint = fingerprint;
  
  // 继续处理请求
  next();
}

// 验证salt的中间件
function validateSalt(req, res, next) {
  const fingerprint = req.fingerprint;
  const salt = getSaltByReq(req);
  
  // 检查salt是否存在
  if (!salt) {
    console.log("验证salt失败，缺少salt值");
    return res.status(401).json({ message: "缺少salt值" });
  }
  
  // 获取用户的salt历史记录
  if (!userSaltHistory.has(fingerprint)) {
    userSaltHistory.set(fingerprint, new Set());
  }
  const saltHistory = userSaltHistory.get(fingerprint);
  
  // 检查salt是否重复
  if (saltHistory.has(salt)) {
    // salt重复，增加非法请求计数
    const currentCount = illegalRequestCounts.get(fingerprint) || 0;
    const newCount = currentCount + 1;
    illegalRequestCounts.set(fingerprint, newCount);
    
    // 如果非法请求次数超过3次，将用户加入黑名单
    if (newCount > 3) {
      addToBlacklist(req, fingerprint);
      return res.status(403).json({ 
        message: `非法请求次数过多，您已被列入黑名单，${serverConfig.blacklistDurationMs / 1000}秒后解除。` 
      });
    }
    
    return res.status(400).json({ 
      message: `Salt值重复，非法请求次数: ${newCount}/3` 
    });
  }
  
  // 将新的salt添加到历史记录中
  saltHistory.add(salt);
  
  // 继续处理请求
  next();
}

// 将用户加入黑名单
function addToBlacklist(req, fingerprint) {
  const ip = getIpByReq(req);
  const addedTime = new Date().toISOString();
  const cookies = req.cookies;
  
  // 检查是否已经在黑名单中
  db.get(
    "SELECT * FROM blacklist WHERE userId = ? AND enabled = 1",
    [fingerprint],
    (err, row) => {
      if (err) {
        console.error("查询黑名单出错: ", err);
        return;
      }
      
      if (row) {
        // 如果已经在黑名单中，更新时间
        db.run(
          "UPDATE blacklist SET added_time = ?, enabled = 1 WHERE userId = ?",
          [addedTime, fingerprint],
          (err) => {
            if (err) {
              console.error("更新黑名单出错: ", err);
            }
          }
        );
      } else {
        // 插入新的记录
        db.run(
          "INSERT INTO blacklist (ip, cookies, userId, added_time, enabled) VALUES (?, ?, ?, ?, 1)",
          [ip, JSON.stringify(cookies), fingerprint, addedTime],
          (err) => {
            if (err) {
              console.error("插入黑名单出错: ", err);
            }
          }
        );
      }
    }
  );
}

export { validateFingerprint, validateSalt, FINGERPRINT_PREFIX };