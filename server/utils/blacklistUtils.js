import db from "../dbserialize.js";
import serverConfig from "../../serverConfig.js";
import { getIpByReq } from "./index.js";

const blacklistDurationMs = serverConfig.blacklistDurationMs;

/**
 * 获取剩余封禁时间
 * @param {string} addedTime 
 * @returns 
 */
function getBlackListTimeLeftByAddedTime(addedTime) {
    if (!addedTime) {
        return 0;
    }
    const currentTime = Date.now();
    const duration = currentTime - new Date(addedTime).getTime();
    const timeLeft = Math.floor((blacklistDurationMs - duration) / 1000);
    return timeLeft > 0 ? timeLeft : 0;
}

/**
 * 检查用户是否在黑名单中
 * @param {string} userId - 用户ID
 * @returns {Promise<{inBlacklist: boolean, row: object|null, error: Error|null, timeLeft: number}>}
 */
async function isInBlacklist(userId) {
  try {
    const stmt = db.prepare("SELECT * FROM blacklist WHERE userId = ? AND enabled = 1");
    const row = stmt.get(userId);
    return { 
      inBlacklist: !!row, 
      row, 
      error: null, 
      timeLeft: getBlackListTimeLeftByAddedTime(row?.added_time) 
    };
  } catch (err) {
    console.error("查询黑名单出错: ", err);
    return { inBlacklist: false, row: null, error: err };
  }
}

/**
 * 添加用户到黑名单
 * @param {object} req - 请求对象
 * @param {string} userId - 用户ID
 * @returns {Promise<{success: boolean, error: Error|null, timeLeft: number}>}
 */
function addToBlacklist(req, userId) {
  try {
    const ip = getIpByReq(req);
    const addedTime = new Date().toISOString();
    const cookies = req.cookies;

    // 先检查是否已在黑名单中
    const { inBlacklist, error: checkError, row } = isInBlacklist(userId);
    if (checkError) {
      return { success: false, error: checkError, timeLeft: 0 };
    }

    if (inBlacklist) {
      // 如果已经在黑名单中，不做操作
      return { success: true, error: null, timeLeft: getBlackListTimeLeftByAddedTime(addedTime) };
    } else {
      // 插入新的记录
      const stmt = db.prepare(
        "INSERT INTO blacklist (ip, cookies, userId, added_time, enabled) VALUES (?, ?, ?, ?, 1)"
      );
      stmt.run(ip, JSON.stringify(cookies), userId, addedTime);
      console.log("已添加到黑名单: ", userId);
      return { success: true, error: null, timeLeft: Math.floor(blacklistDurationMs / 1000) };
    }
  } catch (err) {
    console.error("插入黑名单出错: ", userId, err);
    return { success: false, error: err, timeLeft: 0 };
  }
}

/**
 * 从黑名单中移除用户
 * @param {string} userId - 用户ID
 * @returns {Promise<{success: boolean, error: Error|null}>}
 */
async function removeFromBlacklist(userId) {
  try {
    const stmt = db.prepare("UPDATE blacklist SET enabled = 0 WHERE userId = ?");
    stmt.run(userId);
    console.log("已移除id黑名单: ", userId);
    return { success: true, error: null };
  } catch (err) {
    console.error("移除黑名单出错: ", err);
    return { success: false, error: err };
  }
}

/**
 * 检查黑名单状态并处理过期
 * @param {string} userId - 用户ID
 * @returns {Promise<{inBlacklist: boolean, timeLeft: number|null, error: Error|null}>}
 */
async function checkBlacklistStatus(userId) {
  try {
    const currentTime = Date.now();
    
    const stmt = db.prepare("SELECT added_time FROM blacklist WHERE userId = ? AND enabled = 1");
    const row = stmt.get(userId);
    
    if (!row) {
      return { inBlacklist: false, timeLeft: null, error: null };
    }
    
    const duration = currentTime - new Date(row.added_time).getTime();
    if (duration > blacklistDurationMs) {
      // 黑名单时间已过，移除
      const { success, error } = await removeFromBlacklist(userId);
      return { 
        inBlacklist: !success, 
        timeLeft: 0, 
        error: error 
      };
    } else {
      const timeLeft = Math.floor((blacklistDurationMs - duration) / 1000);
      return { 
        inBlacklist: true, 
        timeLeft, 
        error: null 
      };
    }
  } catch (err) {
    console.error("查询黑名单出错: ", err);
    return { inBlacklist: false, timeLeft: null, error: err };
  }
}

export {
  isInBlacklist,
  addToBlacklist,
  removeFromBlacklist,
  checkBlacklistStatus,
  blacklistDurationMs,
  getBlackListTimeLeftByAddedTime
};