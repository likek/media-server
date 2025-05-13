import serverConfig from "../../serverConfig.js";
import { getSaltByReq } from "../utils/index.js";
import { aesDecrypt } from "../utils/encrypt.js";
import { addToBlacklist } from "../utils/blacklistUtils.js";

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
async function validateSalt(req, res, next) {
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
      const { success, error, timeLeft } = await addToBlacklist(req, fingerprint);
      if (!success) {
        console.error("[validate salt]添加黑名单出错: ", error);
        return res.status(500).json({ message: "请求失败" });
      }

      return res.status(403).json({
        message: `您已被列入黑名单，${timeLeft}秒后解除。` 
      });
    }
    
    return res.status(400).json({ 
      message: `非法请求次数: ${newCount}/3` 
    });
  }
  
  // 将新的salt添加到历史记录中
  saltHistory.add(salt);
  
  // 继续处理请求
  next();
}

export { validateFingerprint, validateSalt, FINGERPRINT_PREFIX };