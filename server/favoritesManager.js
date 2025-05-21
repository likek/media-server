import db from "./dbserialize.js";

// 添加收藏
export const addToFavorites = (userId, fileId) => {
  try {
    const stmt = db.prepare(`INSERT OR IGNORE INTO favorites (user_id, file_id, created_at) VALUES (?, ?, datetime('now'))`);
    const result = stmt.run(userId, fileId);
    return { id: result.lastInsertRowid, added: result.changes > 0, success: true };
  } catch (err) {
    console.error('Error adding to favorites:', err);
    throw err;
  }
};

// 移除收藏
export const removeFromFavorites = (userId, fileId) => {
  try {
    const stmt = db.prepare(`DELETE FROM favorites WHERE user_id = ? AND file_id = ?`);
    const result = stmt.run(userId, fileId);
    return { removed: result.changes > 0, success: true };
  } catch (err) {
    console.error('Error removing from favorites:', err);
    throw err;
  }
};

// 获取用户的所有收藏
export const getUserFavorites = (userId, page = 0, pageSize = 20) => {
  try {
    // 首先获取总数
    const countStmt = db.prepare(`
      SELECT COUNT(*) as total
      FROM files f
      JOIN favorites fav ON f.id = fav.file_id
      WHERE fav.user_id = ?
    `);
    
    const countRow = countStmt.get(userId);
    const total = countRow?.total || 0;
    
    // 然后获取分页数据
    const query = `
      SELECT f.id, f.name, f.type, f.mime_type, f.path, f.size, f.last_modified, f.thumbnail, f.parent_id, f.created_at, f.updated_at
      FROM files f
      JOIN favorites fav ON f.id = fav.file_id
      WHERE fav.user_id = ?
      ORDER BY 
        CASE f.type
          WHEN 'folder' THEN 1
          ELSE 2
        END,
        CASE 
          WHEN f.mime_type LIKE 'video/%' THEN 1
          WHEN f.mime_type LIKE 'image/%' THEN 2
          ELSE 3
        END,
        f.last_modified DESC,
        f.updated_at DESC,
        f.created_at DESC
      ${pageSize > 0 ? `LIMIT ? OFFSET ?` : ''}
    `;
    
    const params = pageSize > 0 
      ? [userId, pageSize, page * pageSize]
      : [userId];
    
    const stmt = db.prepare(query);
    const rows = stmt.all(...params);
    
    const files = rows.map(row => ({
      id: row.id,
      type: row.type,
      mime_type: row.mime_type,
      filename: row.name,
      path: row.path,
      thumbnail: row.thumbnail,
      lastModified: row.last_modified,
      size: row.size,
      parent_id: row.parent_id
    }));
    
    return { files, total };
  } catch (err) {
    console.error('Error getting user favorites:', err);
    throw err;
  }
};

// 检查文件是否已收藏
export const isFileFavorited = (userId, fileId) => {
  try {
    const stmt = db.prepare(`SELECT id FROM favorites WHERE user_id =? AND file_id =?`);
    const row = stmt.get(userId, fileId);
    return !!row;
  } catch (err) {
    console.error('Error checking if file is favorited:', err);
    throw err;
  }
};

// 获取文件的收藏状态
export const getFavoritesStatus = (userId, fileIds) => {
  if (!fileIds || fileIds.length === 0) {
    return {};
  }

  try {
    const placeholders = fileIds.map(() => '?').join(',');
    const query = `
      SELECT file_id 
      FROM favorites 
      WHERE user_id = ? AND file_id IN (${placeholders})
    `;

    const rows = db.prepare(query).all(userId, ...fileIds)
    const favoritedIds = rows.map(row => row.file_id);
    const result = {};
    
    fileIds.forEach(id => {
      result[id] = favoritedIds.includes(id);
    });
    
    return result
  } catch (err) {
    console.error('Error getting favorites status:', err);
    throw err;
  }
};