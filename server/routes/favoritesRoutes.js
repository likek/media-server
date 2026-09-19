import express from 'express';
import { addToFavorites, getUserFavorites, removeFromFavorites, getMostFavorites } from "../favoritesManager.js";
import { getUserIdByReq } from "../utils/index.js";
import { getLockedStatusMap, stripLockedFields, isAdminReq } from "../lockManager.js";
const router = express.Router();

// 添加收藏
router.post("/add", async (req, res) => {
    const userId = getUserIdByReq(req);
    const { fileId } = req.body;
    if (!userId) {
      return res.status(401).json({ message: "请求失败" });
    }
    try {
      const result = addToFavorites(userId, fileId);
      res.json(result);
    } catch (err) {
      res.status(500).json({ message: "请求失败" });
    }
  });
  
  // 移除收藏
  router.post("/remove", async (req, res) => {
    const userId = getUserIdByReq(req);
    const { fileId } = req.body;
    if (!userId) {
      return res.status(401).json({ message: "请求失败" });
    }
    try {
      const result = removeFromFavorites(userId, fileId);
      res.json(result);
    } catch (err) {
      res.status(500).json({ message: "请求失败" });
    }
  });
  
  // 获取收藏列表
router.post("/list", async (req, res) => {
    const userId = getUserIdByReq(req);
    const { page = 0, pageSize = 20 } = req.body;
    if (!userId) {
      return res.status(401).json({ message: "请求失败" });
    }
    try {
      const result = getUserFavorites(userId, page, pageSize);
      // 应用上锁状态
      if (result.files && result.files.length > 0) {
        const admin = isAdminReq(req);
        const lockStatusMap = getLockedStatusMap(result.files.map(f => f.id));
        result.files = result.files.map(file => {
          const status = lockStatusMap.get(file.id) || { locked: false, directlyLocked: false };
          if (status.locked && !admin) {
            return stripLockedFields(file);
          }
          return { ...file, locked: status.locked, directlyLocked: status.directlyLocked };
        });
      }
      res.json(result); // 返回包含files和total的结果
    } catch (err) {
      res.status(500).json({ message: "请求失败" });
    }
});

// 获取最多收藏列表
router.post("/most", async (req, res) => {
    const userId = getUserIdByReq(req);
    const { page = 0, pageSize = 20 } = req.body;
    if (!userId) {
      return res.status(401).json({ message: "请求失败" });
    }
    try {
      const result = getMostFavorites(page, pageSize, userId);
      // 应用上锁状态
      if (result.files && result.files.length > 0) {
        const admin = isAdminReq(req);
        const lockStatusMap = getLockedStatusMap(result.files.map(f => f.id));
        result.files = result.files.map(file => {
          const status = lockStatusMap.get(file.id) || { locked: false, directlyLocked: false };
          if (status.locked && !admin) {
            return stripLockedFields(file);
          }
          return { ...file, locked: status.locked, directlyLocked: status.directlyLocked };
        });
      }
      res.json(result); // 返回包含files和total的结果
    } catch (err) {
      res.status(500).json({ message: "请求失败" });
    }
});

export default router;