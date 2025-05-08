import serverConfig from "../../serverConfig.js";
import db from "../dbserialize.js";
import { getUserIdByReq } from "../utils/index.js";

const blacklistDurationMs = serverConfig.blacklistDurationMs;
function checkBlacklist(req, res, next) {
    const currentTime = Date.now();
    // 使用请求头中的指纹作为用户ID
    const userId = getUserIdByReq(req);
    db.get(
      "SELECT added_time FROM blacklist WHERE userId = ? AND enabled = 1",
      [userId],
      (err, row) => {
        if (err) {
          console.error("查询黑名单出错: ", err);
          return res.status(500).json({ message: "请求失败" });
        }
        if (row) {
          const duration = currentTime - new Date(row.added_time).getTime();
          if (duration > blacklistDurationMs) {
            // 黑名单时间已过，逻辑删除IP
            db.run(
              "UPDATE blacklist SET enabled = 0 WHERE userId = ?",
              [userId],
              (err) => {
                if (err) {
                  console.error("移除IP出错: ", err);
                  return res.status(500).json({ message: "请求失败" });
                }
                next();
              }
            );
          } else {
            const black_time_left = Math.floor(
              (blacklistDurationMs - duration) / 1000
            );
            return res.status(403).json({
              message: `您已被列入黑名单，无法访问该资源，${black_time_left}秒后解除。`,
              black_time_left,
            });
          }
        } else {
          next();
        }
      }
    );
  }

  export {
    checkBlacklist
  };