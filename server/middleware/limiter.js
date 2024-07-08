import { rateLimit } from "express-rate-limit";
import serverConfig from "../../serverConfig.js";
import { getUserIdByReq } from "../utils/index.js";
import { addToBlacklist } from "../utils/blacklistUtils.js";

const maxRequestsPerMinute = serverConfig.maxRequestsPerMinute;

let limiterQueue = Promise.resolve();
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: maxRequestsPerMinute,
  standardHeaders: false,
  legacyHeaders: false,
  handler: (req, res, next) => {
    limiterQueue = limiterQueue.finally(() => {
      return new Promise(async (resolve, reject) => {
        // 使用请求头中的指纹作为用户ID
        const userId = getUserIdByReq(req);
        const { success, error, timeLeft } = await addToBlacklist(req, userId);
        if (!success) {
          console.error("[limiter] 添加黑名单出错: ", error);
          res.status(500).json({ message: "请求失败" });
          return reject();
        }
        res.status(403).json({
          message: `请求过于频繁，您已被列入黑名单，${timeLeft}秒后解除。`,
          black_time_left: timeLeft,
        });
        return resolve();
      });
    });
  },
});

export {
  limiter
};