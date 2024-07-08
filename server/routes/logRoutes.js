import express from 'express';
import db from "../dbserialize.js";

const router = express.Router();

// 请求日志分页与筛选
router.post('/request', async (req, res) => {
  try {
    const { page = 1, pageSize = 10, userId = '', userIp = '', startTime = '', endTime = '' } = req.body;
    let where = [];
    let params = [];
    if (userId) {
      where.push('userId LIKE ?');
      params.push(`%${userId}%`);
    }
    if (userIp) {
      where.push('userIp LIKE ?');
      params.push(`%${userIp}%`);
    }
    if (startTime) {
      where.push('time >= ?');
      params.push(startTime);
    }
    if (endTime) {
      where.push('time <= ?');
      params.push(endTime + ' 23:59:59');
    }
    const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';

    // 获取总数
    const countStmt = db.prepare(`SELECT COUNT(*) as total FROM logs_request ${whereSql}`);
    const { total } = countStmt.get(...params);
    
    const offset = (page - 1) * pageSize;
    // 获取分页数据
    const stmt = db.prepare(`SELECT * FROM logs_request ${whereSql} ORDER BY time DESC LIMIT ? OFFSET ?`);
    const rows = stmt.all(...[...params, pageSize, offset]);
    
    res.json({ data: { data: rows, count: total } });
  } catch (error) {
    console.error('Error in /request route:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// 文件访问日志分页与筛选
router.post('/file', (req, res) => {
  try {
    const { page = 1, pageSize = 10, userId = '', userIp = '', startTime = '', endTime = '' } = req.body;
    let where = [];
    let params = [];
    if (userId) {
      where.push('userId LIKE ?');
      params.push(`%${userId}%`);
    }
    if (userIp) {
      where.push('userIp LIKE ?');
      params.push(`%${userIp}%`);
    }
    if (startTime) {
      where.push('time >= ?');
      params.push(startTime);
    }
    if (endTime) {
      where.push('time <= ?');
      params.push(endTime + ' 23:59:59');
    }
    const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
    
    // 获取总数
    const countStmt = db.prepare(`SELECT COUNT(*) as total FROM logs_file_accessed ${whereSql}`);
    const { total } = countStmt.get(...params);
    
    const offset = (page - 1) * pageSize;
    // 获取分页数据
    const stmt = db.prepare(`SELECT * FROM logs_file_accessed ${whereSql} ORDER BY time DESC LIMIT ? OFFSET ?`);
    const rows = stmt.all(...[...params, pageSize, offset]);
    
    res.json({ data: { data: rows, count: total } });
  } catch (error) {
    console.error('数据库查询错误:', error);
    res.status(500).json({ message: '请求失败' });
  }
});

// WS日志分页与筛选
router.post('/ws', (req, res) => {
  const { page = 1, pageSize = 10, userId = '', userIp = '', startTime = '', endTime = '' } = req.body;
  let where = [];
  let params = [];
  if (userId) {
    where.push('userId LIKE ?');
    params.push(`%${userId}%`);
  }
  if (userIp) {
    where.push('userIp LIKE ?');
    params.push(`%${userIp}%`);
  }
  if (startTime) {
    where.push('time >= ?');
    params.push(startTime);
  }
  if (endTime) {
    where.push('time <= ?');
    params.push(endTime + ' 23:59:59');
  }
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const countSql = `SELECT COUNT(*) as total FROM logs_ws ${whereSql}`;
  const countStmt = db.prepare(countSql);
  const countRow = countStmt.get(...params);
  const total = countRow.total;
  const offset = (page - 1) * pageSize;
  const sql = `SELECT * FROM logs_ws ${whereSql} ORDER BY time DESC LIMIT? OFFSET?`;
  const stmt = db.prepare(sql);
  const rows = stmt.all(...[...params, pageSize, offset]);
  res.json({ data: { data: rows, count: total } });
});

export default router;