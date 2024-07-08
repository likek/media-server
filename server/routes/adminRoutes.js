import express from 'express';
import db from "../dbserialize.js";
import { getUserIdByReq } from "../utils/index.js";
import {
  addToBlacklist,
  getBlacklistExpiresAtByAddedTime,
  isInBlacklist,
  removeFromBlacklist
} from "../utils/blacklistUtils.js";

const router = express.Router();

// 获取用户列表
router.post('/users', (req, res) => {
  try {
    const currentUserId = getUserIdByReq(req);
    const page = parseInt(req.body.page) || 0;
    const pageSize = parseInt(req.body.pageSize) || 20;
    const offset = (page - 1) * pageSize; // 已修改
    const keyword = String(req.body?.keyword || '').trim();
    const hasKeyword = Boolean(keyword);
    const likeKeyword = `%${keyword}%`;

    // 获取总数
    const countSql = hasKeyword
      ? `SELECT COUNT(*) as total
         FROM userInfo
         WHERE userId LIKE ?
            OR iv LIKE ?
            OR ip LIKE ?
            OR region LIKE ?
            OR device LIKE ?
            OR os LIKE ?
            OR browser LIKE ?`
      : 'SELECT COUNT(*) as total FROM userInfo';
    const countStmt = db.prepare(countSql);
    const countParams = hasKeyword
      ? [likeKeyword, likeKeyword, likeKeyword, likeKeyword, likeKeyword, likeKeyword, likeKeyword]
      : [];
    const { total } = countStmt.get(...countParams);

    // 获取分页数据
    const usersSql = hasKeyword
      ? `SELECT *
         FROM userInfo
         WHERE userId LIKE ?
            OR iv LIKE ?
            OR ip LIKE ?
            OR region LIKE ?
            OR device LIKE ?
            OR os LIKE ?
            OR browser LIKE ?
         ORDER BY update_time DESC
         LIMIT ? OFFSET ?`
      : `SELECT * FROM userInfo ORDER BY update_time DESC LIMIT ? OFFSET ?`;
    const usersStmt = db.prepare(usersSql);
    const usersParams = hasKeyword
      ? [likeKeyword, likeKeyword, likeKeyword, likeKeyword, likeKeyword, likeKeyword, likeKeyword, pageSize, offset]
      : [pageSize, offset];
    const users = usersStmt.all(...usersParams).map((user) => {
      const blacklistInfo = isInBlacklist(user.userId);
      const timeLeft = blacklistInfo?.inBlacklist ? blacklistInfo.timeLeft : null;
      return {
        ...user,
        isBlacklisted: Boolean(blacklistInfo?.inBlacklist),
        blackTimeLeft: typeof timeLeft === 'number' ? timeLeft : null,
        blacklistAddedTime: blacklistInfo?.row?.added_time || null,
        blacklistExpiresAt: blacklistInfo?.row?.added_time ? getBlacklistExpiresAtByAddedTime(blacklistInfo.row.added_time) : null
      };
    });

    res.json({
      count: total,
      data: users,
      currentUserId,
      keyword
    });
  } catch (error) {
    console.error('Error in /users route:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/blacklist/add', (req, res) => {
  try {
    const userId = String(req.body?.userId || '').trim();
    const currentUserId = getUserIdByReq(req);
    if (!userId) {
      return res.status(400).json({ message: '缺少用户ID' });
    }
    if (currentUserId && userId === currentUserId) {
      return res.status(400).json({ message: '不能把自己加入黑名单' });
    }
    const result = addToBlacklist(req, userId);
    if (!result.success) {
      return res.status(500).json({ message: '加入黑名单失败' });
    }
    res.json({
      success: true,
      timeLeft: result.timeLeft
    });
  } catch (error) {
    console.error('Error in /blacklist/add route:', error);
    res.status(500).json({ message: '加入黑名单失败' });
  }
});

router.post('/blacklist/remove', async (req, res) => {
  try {
    const userId = String(req.body?.userId || '').trim();
    if (!userId) {
      return res.status(400).json({ message: '缺少用户ID' });
    }
    const result = await removeFromBlacklist(userId);
    if (!result.success) {
      return res.status(500).json({ message: '解除黑名单失败' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Error in /blacklist/remove route:', error);
    res.status(500).json({ message: '解除黑名单失败' });
  }
});

export default router;
