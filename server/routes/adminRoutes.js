import express from 'express';
import db from '../dbserialize.js';

const router = express.Router();

// 获取用户列表
router.post('/users', async (req, res) => {
  try {
    const page = req.body.page || 1;
    const limit = req.body.limit || 10;
    const offset = (page - 1) * limit;

    // 查询总记录数
    const countQuery = `SELECT COUNT(*) AS total FROM userInfo`;
    db.get(countQuery, [], (err, row) => {
      if (err) {
        console.error("Error executing count query:", err);
        return res.status(500).send({ message: "Database error" });
      }

      // 分页查询
      const query = `
                SELECT * FROM userInfo
                ORDER BY update_time DESC
                LIMIT ? OFFSET ?
            `;

      db.all(query, [limit, offset], (err, rows) => {
        if (err) {
          console.error("Error executing query:", err);
          return res.status(500).send({ message: "Database error" });
        }

        // 返回结果包括数据和总数
        res.json({ data: rows, count: row.total });
      });
    });
  } catch (error) {
    console.error("Error handling request:", error);
    res.status(500).send({ message: "Internal server error" });
  }
});

export default router;