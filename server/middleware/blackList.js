import serverConfig from "../../serverConfig.js";
import dbPromise from '../db.js';

const blacklistDurationMs = serverConfig.blacklistDurationMs;

async function checkBlacklist(req, res, next) {
  try {
    const db = await dbPromise;
    const currentTime = Date.now();
    const cookies = req.cookies;
    const userId = cookies.userId;

    // 查询黑名单
    const row = await db.get(
      "SELECT added_time FROM blacklist WHERE userId = ? AND enabled = 1",
      [userId]
    );

    if (row) {
      const duration = currentTime - new Date(row.added_time).getTime();
      if (duration > blacklistDurationMs) {
        // 黑名单时间已过，逻辑删除IP
        await db.run(
          "UPDATE blacklist SET enabled = 0 WHERE userId = ?",
          [userId]
        );
        next();
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
  } catch (err) {
    console.error("查询黑名单出错: ", err);
    return res.status(500).json({ message: "内部服务器错误" });
  }
}

export {
  checkBlacklist
};
