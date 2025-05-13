import { getUserIdByReq } from "../utils/index.js";
import { checkBlacklistStatus } from "../utils/blacklistUtils.js";
async function checkBlacklist(req, res, next) {
    // 使用请求头中的指纹作为用户ID
    const userId = getUserIdByReq(req);
    
    // 使用blacklistUtils中的函数检查黑名单状态
    const { inBlacklist, timeLeft, error } = await checkBlacklistStatus(userId);
    
    if (error) {
      console.error("查询黑名单出错: ", error);
      return res.status(500).json({ message: "请求失败" });
    }
    
    if (inBlacklist) {
      console.log(`用户 ${userId} 在黑名单中，请求被拒绝, 剩余时间: ${timeLeft}s`);
      return res.status(403).json({
        message: `您已被列入黑名单，无法访问该资源，${timeLeft}秒后解除。`,
        black_time_left: timeLeft,
      });
    } else {
      next();
    }
  }
  

export {
    checkBlacklist
  };