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
    const duration = currentTime - new Date(row.added_time).getTime();
    const timeLeft = Math.floor((blacklistDurationMs - duration) / 1000);
    return timeLeft > 0 ? timeLeft : 0;
}

/**
 * 检查用户是否在黑名单中
 * @param {string} userId - 用户ID
 * @returns {Promise<{inBlacklist: boolean, row: object|null, error: Error|null}>}
 */
async function isInBlacklist(userId) {
  return new Promise((resolve) => {
    db.get(
      "SELECT * FROM blacklist WHERE userId = ? AND enabled = 1",
      [userId],
      (err, row) => {
        if (err) {
          console.error("查询黑名单出错: ", err);
          resolve({ inBlacklist: false, row: null, error: err });
          return;
        }
        resolve({ inBlacklist: !!row, row, error: null, timeLeft: getBlackListTimeLeftByAddedTime(row.added_time) });
      }
    );
  });
}

/**
 * 添加用户到黑名单
 * @param {object} req - 请求对象
 * @param {string} userId - 用户ID
 * @returns {Promise<{success: boolean, error: Error|null}>}
 */
async function addToBlacklist(req, userId) {
  const ip = getIpByReq(req);
  const addedTime = new Date().toISOString();
  const cookies = req.cookies;

  // 先检查是否已在黑名单中
  const { inBlacklist, error: checkError } = await isInBlacklist(userId);
  if (checkError) {
    return { success: false, error: checkError, timeLeft: 0 };
  }

  return new Promise((resolve) => {
    if (inBlacklist) {
      // 如果已经在黑名单中，不做操作
      resolve({ success: true, error: null, timeLeft: getBlackListTimeLeftByAddedTime(addedTime)  });
        //   db.run(
        //     "UPDATE blacklist SET added_time = ?, enabled = 1 WHERE userId = ?",
        //     [addedTime, userId],
        //     (err) => {
        //       if (err) {
        //         console.error("更新黑名单出错: ", err);
        //         resolve({ success: false, error: err });
        //         return;
        //       }
        //       resolve({ success: true, error: null });
        //     }
        //   );
    } else {
      // 插入新的记录
      db.run(
        "INSERT INTO blacklist (ip, cookies, userId, added_time, enabled) VALUES (?, ?, ?, ?, 1)",
        [ip, JSON.stringify(cookies), userId, addedTime],
        (err) => {
          if (err) {
            console.error("插入黑名单出错: ", err);
            resolve({ success: false, error: err, timeLeft: 0 });
            return;
          }
          resolve({ success: true, error: null, timeLeft: Math.floor(blacklistDurationMs / 1000) });
        }
      );
    }
  });
}

/**
 * 从黑名单中移除用户
 * @param {string} userId - 用户ID
 * @returns {Promise<{success: boolean, error: Error|null}>}
 */
async function removeFromBlacklist(userId) {
  return new Promise((resolve) => {
    db.run(
      "UPDATE blacklist SET enabled = 0 WHERE userId = ?",
      [userId],
      (err) => {
        if (err) {
          console.error("移除黑名单出错: ", err);
          resolve({ success: false, error: err });
          return;
        }
        console.log("已移除id黑名单: ", userId);
        resolve({ success: true, error: null });
      }
    );
  });
}

/**
 * 检查黑名单状态并处理过期
 * @param {string} userId - 用户ID
 * @returns {Promise<{inBlacklist: boolean, timeLeft: number|null, error: Error|null}>}
 */
async function checkBlacklistStatus(userId) {
  const currentTime = Date.now();
  
  return new Promise((resolve) => {
    db.get(
      "SELECT added_time FROM blacklist WHERE userId = ? AND enabled = 1",
      [userId],
      async (err, row) => {
        if (err) {
          console.error("查询黑名单出错: ", err);
          resolve({ inBlacklist: false, timeLeft: null, error: err });
          return;
        }
        
        if (!row) {
          resolve({ inBlacklist: false, timeLeft: null, error: null });
          return;
        }
        
        const duration = currentTime - new Date(row.added_time).getTime();
        if (duration > blacklistDurationMs) {
          // 黑名单时间已过，移除
          const { success, error } = await removeFromBlacklist(userId);
          resolve({ 
            inBlacklist: !success, 
            timeLeft: 0, 
            error: error 
          });
        } else {
          const timeLeft = Math.floor((blacklistDurationMs - duration) / 1000);
          resolve({ 
            inBlacklist: true, 
            timeLeft, 
            error: null 
          });
        }
      }
    );
  });
}

export {
  isInBlacklist,
  addToBlacklist,
  removeFromBlacklist,
  checkBlacklistStatus,
  blacklistDurationMs,
  getBlackListTimeLeftByAddedTime
};