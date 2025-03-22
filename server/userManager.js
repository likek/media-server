
import { v4 as uuidv4 } from "uuid";
import { getRequestInfo } from "./utils/index.js";
import db from "./dbserialize.js";

async function tryRegister(req, res) {
    let userId = req.cookies.userId;
  
    if (!userId) {
      userId = uuidv4();
      res.cookie("userId", userId, {
        maxAge: 3650 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        sameSite: "strict",
      });
    }
  
    const userInfo = await getRequestInfo(req);
    db.run(
      `INSERT OR IGNORE INTO userInfo (userId, ip, create_time, update_time, userAgent, region, device, os, browser) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
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
        userId,
      ],
      (err) => {
        if (err) {
          console.error("Error updating user info:", err);
        }
      }
    );
    return userId;
  }

  export { tryRegister };