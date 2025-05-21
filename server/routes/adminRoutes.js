import express from 'express';
import db from "../dbserialize.js";

const router = express.Router();

// 获取用户列表
router.post('/users', (req, res) => {
  try {
    const page = parseInt(req.body.page) || 0;
    const pageSize = parseInt(req.body.pageSize) || 20;
    const offset = (page - 1) * pageSize; // 已修改

    // 获取总数
    const countStmt = db.prepare('SELECT COUNT(*) as total FROM userInfo');
    const { total } = countStmt.get();

    // 获取分页数据
    const usersStmt = db.prepare(
      `SELECT * FROM userInfo ORDER BY update_time DESC LIMIT ? OFFSET ?`
    );
    const users = usersStmt.all(pageSize, offset);

    res.json({
      count: total,
      data: users
    });
  } catch (error) {
    console.error('Error in /users route:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;