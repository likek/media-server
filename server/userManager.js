
import { getRequestInfo, getSaltByReq, getUserIdByReq } from "./utils/index.js";
import db from "./dbserialize.js";
import { FINGERPRINT_PREFIX } from "./middleware/fingerprintValidator.js";
import { aesEncrypt } from "./utils/encrypt.js";
import { HIDDEN_MENU_HOME_TAP_PASSWORD } from "../serverConfig.js";

const HOME_TAP_HISTORY_LIMIT = 8;

const parseHomeTapHistory = (value) => {
  if (!value) {
    return [];
  }
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map((item) => Number(item))
      .filter((item) => Number.isInteger(item) && item >= 2 && item <= 9)
      .slice(-HOME_TAP_HISTORY_LIMIT);
  } catch (error) {
    return [];
  }
};

const getHiddenMenuPasswordSequence = () => {
  return String(HIDDEN_MENU_HOME_TAP_PASSWORD)
    .split("")
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item >= 2 && item <= 9)
    .slice(0, HOME_TAP_HISTORY_LIMIT);
};

const isHiddenMenuUnlockedByHistory = (history = []) => {
  const passwordSequence = getHiddenMenuPasswordSequence();
  if (passwordSequence.length === 0 || history.length < passwordSequence.length) {
    return false;
  }
  const recentSequence = history.slice(-passwordSequence.length);
  return recentSequence.every((count, index) => count === passwordSequence[index]);
};

const getUserHomeTapHistory = (userId) => {
  if (!userId) {
    return [];
  }
  const row = db.prepare(`SELECT home_click_history FROM userInfo WHERE userId = ?`).get(userId);
  return parseHomeTapHistory(row?.home_click_history);
};

const getHiddenMenuAccessState = (userId) => {
  const history = getUserHomeTapHistory(userId);
  return {
    canRenderHiddenMenus: isHiddenMenuUnlockedByHistory(history),
    recentHomeTapCounts: history
  };
};

const recordHomeTapCount = (userId, count) => {
  if (!userId) {
    const error = new Error("缺少用户信息");
    error.statusCode = 401;
    throw error;
  }
  const normalizedCount = Number(count);
  if (!Number.isInteger(normalizedCount) || normalizedCount < 2 || normalizedCount > 9) {
    const error = new Error("主页连点次数不合法");
    error.statusCode = 400;
    throw error;
  }

  const existingUser = db.prepare(`SELECT userId, home_click_history FROM userInfo WHERE userId = ?`).get(userId);
  if (!existingUser) {
    const error = new Error("用户未注册");
    error.statusCode = 401;
    throw error;
  }

  const history = parseHomeTapHistory(existingUser.home_click_history);
  history.push(normalizedCount);
  const nextHistory = history.slice(-HOME_TAP_HISTORY_LIMIT);

  db.prepare(`
    UPDATE userInfo
    SET home_click_history = ?, update_time = CURRENT_TIMESTAMP
    WHERE userId = ?
  `).run(JSON.stringify(nextHistory), userId);

  return {
    canRenderHiddenMenus: isHiddenMenuUnlockedByHistory(nextHistory),
    recentHomeTapCounts: nextHistory
  };
};

async function tryRegister(req, res) {
    // 从请求头获取指纹，而不是使用cookie
    const fp = getUserIdByReq(req);
    
    // 如果没有指纹，则返回错误
    if (!fp) {
      console.error("缺少指纹信息");
      return res.status(401).json({ message: "缺少指纹信息" });
    }
    
    // 验证指纹格式
    if (!fp.startsWith(FINGERPRINT_PREFIX)) {
      console.error("指纹格式不合法");
      return res.status(401).json({ message: "指纹格式不合法" });
    }

    const salt = getSaltByReq(req);

    // 将指纹信息写入cookie
    res.cookie("fp", aesEncrypt(fp, salt), {
      httpOnly: false,
      sameSite: "strict",
      maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year
    });

    // 将salt信息写入cookie
    res.cookie("s", aesEncrypt(salt), {
      httpOnly: false,
      sameSite: "strict",
      maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year
    });
  
    const userInfo = await getRequestInfo(req);
    try {
      // 查询用户是否存在
      const stmt = db.prepare(`SELECT * FROM userInfo WHERE userId = ?`);
      const user = stmt.get(fp);

      // 如果用户不存在，则插入新用户
      if (!user) {
        const insertStmt = db.prepare(
          `INSERT INTO userInfo (userId, ip, create_time, update_time, userAgent, region, device, os, browser, iv, home_click_history) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );
        insertStmt.run(
          fp,
          userInfo.userIp,
          userInfo.requestTime,
          userInfo.requestTime,
          userInfo.userAgent,
          userInfo.region,
          userInfo.device,
          userInfo.os,
          userInfo.browser,
          req.body?.iv,
          "[]"
        );
      } else {
        // 如果用户存在，则更新用户信息
        // 修改除create_time外的其他所有字段
        const updateStmt = db.prepare(
          `UPDATE userInfo SET ip = ?, update_time = ?, userAgent = ?, region = ?, device = ?, os = ?, browser = ?, iv = ?, home_click_history = ? WHERE userId = ?`
        );
        updateStmt.run(
          userInfo.userIp,
          userInfo.requestTime,
          userInfo.userAgent,
          userInfo.region,
          userInfo.device,
          userInfo.os,
          userInfo.browser,
          req.body?.iv || user.iv,
          user.home_click_history || "[]",
          fp
        );
      }
      return fp;
    } catch (err) {
      console.error('Error in tryRegister:', err);
      throw err;
    }
  }

export {
  tryRegister,
  recordHomeTapCount,
  getHiddenMenuAccessState
};
