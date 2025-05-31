import express from 'express';
import { addToFavorites, getUserFavorites, removeFromFavorites } from "../favoritesManager.js";
import { getUserIdByReq } from "../utils/index.js";
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
      res.json(result); // 返回包含files和total的结果
    } catch (err) {
      res.status(500).json({ message: "请求失败" });
    }
});

export default router;