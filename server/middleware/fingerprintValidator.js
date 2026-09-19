import { getSaltByReq, getIpByReq } from "../utils/index.js";
import { aesDecrypt } from "../utils/encrypt.js";
import { addToBlacklist } from "../utils/blacklistUtils.js";
import { getSessionUserId, SESSION_COOKIE_NAME } from "../sessionManager.js";

// 存储每个用户的salt历史记录和非法请求计数
const userSaltHistory = new Map();
const illegalRequestCounts = new Map();

// 指纹前缀，用于验证合法性
const FINGERPRINT_PREFIX = "FP-";

// 验证指纹的中间件
function validateFingerprint(req, res, next) {
  // 优先检查 session token（联合校验：token + ip + salt）
  const sessionToken = req.cookies?.[SESSION_COOKIE_NAME];
  if (sessionToken) {
    const requestIp = getIpByReq(req);
    const requestSalt = getSaltByReq(req);
    const userId = getSessionUserId(sessionToken, requestIp, requestSalt);
    if (userId) {
      // 联合校验指纹：解密 x-fp header，比对是否与 session 中的 user_id 一致
      const headerFp = req.headers['x-fp'];
      if (!headerFp || !requestSalt) {
        // session 有效但缺少 x-fp/salt — 无法完成指纹校验，拒绝
        return res.status(401).json({ message: "身份验证失败" });
      }
      try {
        const decryptedFp = aesDecrypt(headerFp, requestSalt);
        if (decryptedFp !== userId) {
          // 指纹不匹配 — token 可能被盗用
          return res.status(401).json({ message: "身份验证失败" });
        }
      } catch (e) {
        return res.status(401).json({ message: "身份验证失败" });
      }
      req.fingerprint = userId;
      req.sessionBased = true;
      return next();
    }
  }

  // 回退到指纹验证
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
  // session 请求跳过 salt 校验
  if (req.sessionBased) {
    return next();
  }

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
      const { success, error, timeLeft } = addToBlacklist(req, fingerprint);
      if (!success) {
        console.error("[validate salt]添加黑名单出错: ", error);
        return res.status(500).json({ message: "请求失败" });
      }

      return res.status(403).json({
        message: `您已被列入黑名单，${timeLeft}秒后解除。` 
      });
    }
    
    console.log(`[validate salt]非法请求次数: ${newCount}/3`);
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
