import { rateLimit } from "express-rate-limit";
import serverConfig from "../../serverConfig.js";
import dbPromise from '../db.js';

const maxRequestsPerMinute = serverConfig.maxRequestsPerMinute;
const blacklistDurationMs = serverConfig.blacklistDurationMs;

let limiterQueue = Promise.resolve();

const limiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: maxRequestsPerMinute,
  handler: (req, res, next) => {
    limiterQueue = limiterQueue.finally(async () => {
      try {
        const db = await dbPromise;
        const ip = normalizeIp(req.clientIp || req.ip);
        const addedTime = new Date().toISOString();
        const cookies = req.cookies;
        const userId = cookies.userId;

        // 检查是否存在相同 userId 且 enabled 为 1 的记录
        const row = await db.get(
          "SELECT * FROM blacklist WHERE userId = ? AND enabled = 1",
          [userId]
        );

        if (row) {
          // 如果存在，不进行插入操作
          res.status(429).json({
            message: `请求过于频繁，您已被列入黑名单，${blacklistDurationMs / 1000}秒后解除。`,
          });
        } else {
          // 插入新的记录
          await db.run(
            "INSERT INTO blacklist (ip, cookies, userId, added_time, enabled) VALUES (?, ?, ?, ?, 1)",
            [ip, JSON.stringify(cookies), userId, addedTime]
          );
          res.status(429).json({
            message: `请求过于频繁，您已被列入黑名单，${blacklistDurationMs / 1000}秒后解除。`,
          });
        }
      } catch (err) {
        console.error("处理黑名单操作时出错: ", err);
        res.status(500).json({ message: "内部服务器错误" });
      }
    });
  },
});

export {
  limiter
};