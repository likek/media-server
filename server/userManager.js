
import { getRequestInfo, getSaltByReq, getUserIdByReq } from "./utils/index.js";
import db from "./dbserialize.js";
import { FINGERPRINT_PREFIX } from "./middleware/fingerprintValidator.js";
import { aesEncrypt } from "./utils/encrypt.js";

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
    db.run(
      `INSERT OR IGNORE INTO userInfo (userId, ip, create_time, update_time, userAgent, region, device, os, browser) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        fp,
        userInfo.userIp,
        userInfo.requestTime,
        userInfo.requestTime,
        userInfo.userAgent,
        userInfo.region,
        userInfo.device,
        userInfo.os,
        userInfo.browser,
      ],
      (err) => {
        if (err) {
          console.error("Error inserting user info:", err);
        }
      }
    );
  
    // 修改除create_time外的其他所有字段
    db.run(
      `UPDATE userInfo SET ip = ?, update_time = ?, userAgent = ?, region = ?, device = ?, os = ?, browser = ? WHERE userId = ?`,
      [
        userInfo.userIp,
        userInfo.requestTime,
        userInfo.userAgent,
        userInfo.region,
        userInfo.device,
        userInfo.os,
        userInfo.browser,
        fp,
      ],
      (err) => {
        if (err) {
          console.error("Error updating user info:", err);
        }
      }
    );
    return fp;
  }

  export { tryRegister };