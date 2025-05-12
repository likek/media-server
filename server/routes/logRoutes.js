import express from 'express';
import db from '../dbserialize.js';

const router = express.Router();

// 请求日志分页与筛选
router.post('/request', (req, res) => {
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
  const countSql = `SELECT COUNT(*) as total FROM logs_request ${whereSql}`;
  db.get(countSql, params, (err, countRow) => {
    if (err) {
      console.error('数据库查询错误:', err);
      return res.status(500).json({ message: '请求失败' });
    }
    const total = countRow.total;
    const offset = (page - 1) * pageSize;
    // 使用参数化查询，避免SQL注入
    const sql = `SELECT * FROM logs_request ${whereSql} ORDER BY time DESC LIMIT ? OFFSET ?`;
    db.all(sql, [...params, pageSize, offset], (err, rows) => {
      if (err) {
        console.error('数据库查询错误:', err);
        return res.status(500).json({ message: '请求失败' });
      }
      res.json({ data: { list: rows, total } });
    });
  });
});

// 文件访问日志分页与筛选
router.post('/file', (req, res) => {
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
  const countSql = `SELECT COUNT(*) as total FROM logs_file_accessed ${whereSql}`;
  db.get(countSql, params, (err, countRow) => {
    if (err) {
      console.error('数据库查询错误:', err);
      return res.status(500).json({ message: '请求失败' });
    }
    const total = countRow.total;
    const offset = (page - 1) * pageSize;
    // 使用参数化查询，避免SQL注入
    const sql = `SELECT * FROM logs_file_accessed ${whereSql} ORDER BY time DESC LIMIT ? OFFSET ?`;
    db.all(sql, [...params, pageSize, offset], (err, rows) => {
      if (err) {
        console.error('数据库查询错误:', err);
        return res.status(500).json({ message: '请求失败' });
      }
      res.json({ data: { list: rows, total } });
    });
  });
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
  db.get(countSql, params, (err, countRow) => {
    if (err) {
      console.error('数据库查询错误:', err);
      return res.status(500).json({ message: '请求失败' });
    }
    const total = countRow.total;
    const offset = (page - 1) * pageSize;
    // 使用参数化查询，避免SQL注入
    const sql = `SELECT * FROM logs_ws ${whereSql} ORDER BY time DESC LIMIT ? OFFSET ?`;
    db.all(sql, [...params, pageSize, offset], (err, rows) => {
      if (err) {
        console.error('数据库查询错误:', err);
        return res.status(500).json({ message: '请求失败' });
      }
      res.json({ data: { list: rows, total } });
    });
  });
});

export default router;