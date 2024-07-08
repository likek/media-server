import { getUserIdByReq } from "../utils/index.js";
import { getHiddenMenuAccessState } from "../userManager.js";

const requireBackdoorAccess = (req, res, next) => {
  try {
    const userId = getUserIdByReq(req);
    const { canRenderHiddenMenus } = getHiddenMenuAccessState(userId);
    if (canRenderHiddenMenus) {
      return next();
    }
    return res.status(403).json({ message: "未解锁该功能" });
  } catch (error) {
    console.error("校验后门权限失败:", error);
    return res.status(500).json({ message: "校验权限失败" });
  }
};

export {
  requireBackdoorAccess
};
