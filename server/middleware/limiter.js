import { rateLimit } from "express-rate-limit";
import serverConfig from "../../serverConfig.js";

const maxRequestsPerMinute = serverConfig.maxRequestsPerMinute;
const blacklistDurationMs = serverConfig.blacklistDurationMs;

let limiterQueue = Promise.resolve();
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: maxRequestsPerMinute,
  handler: (req, res, next) => {
    limiterQueue = limiterQueue.finally(() => {
      return new Promise((resolve, reject) => {
        const ip = normalizeIp(req.clientIp || req.ip);
        const addedTime = new Date().toISOString();
        const cookies = req.cookies;
        const userId = cookies.userId;

        // 检查是否存在相同 userId 且 enabled 为 1 的记录
        db.get(
          "SELECT * FROM blacklist WHERE userId = ? AND enabled = 1",
          [userId],
          (err, row) => {
            if (err) {
              console.error("查询黑名单出错: ", err);
              res.status(500).json({ message: "内部服务器错误" });
              return reject();
            }

            if (row) {
              // 如果存在，不进行插入操作
              res.status(429).json({
                message: `请求过于频繁，您已被列入黑名单，${
                  blacklistDurationMs / 1000
                }秒后解除。`,
              });
              return resolve();
            } else {
              // 插入新的记录
              db.run(
                "INSERT INTO blacklist (ip, cookies, userId, added_time, enabled) VALUES (?, ?, ?, ?, 1)",
                [ip, JSON.stringify(cookies), userId, addedTime],
                function (err) {
                  if (err) {
                    console.error("插入黑名单出错: ", err);
                    res.status(500).json({ message: "内部服务器错误" });
                    return reject();
                  }
                  res.status(429).json({
                    message: `请求过于频繁，您已被列入黑名单，${
                      blacklistDurationMs / 1000
                    }秒后解除。`,
                  });
                  return resolve();
                }
              );
            }
          }
        );
      });
    });
  },
});

export {
  limiter
};