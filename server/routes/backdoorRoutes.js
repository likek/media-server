import express from "express";
import { getUserIdByReq } from "../utils/index.js";
import { getHiddenMenuAccessState, recordHomeTapCount } from "../userManager.js";

const router = express.Router();

router.post("/homeTap", (req, res) => {
  try {
    const userId = getUserIdByReq(req);
    const result = recordHomeTapCount(userId, req.body?.count);
    res.json({
      success: true,
      canRenderHiddenMenus: result.canRenderHiddenMenus
    });
  } catch (error) {
    console.error("记录主页连点次数失败:", error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "记录主页连点次数失败"
    });
  }
});

router.post("/menuStatus", (req, res) => {
  try {
    const userId = getUserIdByReq(req);
    const result = getHiddenMenuAccessState(userId);
    res.json({
      success: true,
      canRenderHiddenMenus: result.canRenderHiddenMenus
    });
  } catch (error) {
    console.error("获取隐藏菜单状态失败:", error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "获取隐藏菜单状态失败"
    });
  }
});

export default router;
