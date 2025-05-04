import db from "./dbserialize.js";

// 添加收藏
export const addToFavorites = (userId, fileId) => {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT OR IGNORE INTO favorites (user_id, file_id, created_at) VALUES (?, ?, datetime('now'))`,
      [userId, fileId],
      function (err) {
        if (err) {
          console.error('Error adding to favorites:', err);
          reject(err);
        } else {
          resolve({ id: this.lastID, added: this.changes > 0 });
        }
      }
    );
  });
};

// 移除收藏
export const removeFromFavorites = (userId, fileId) => {
  return new Promise((resolve, reject) => {
    db.run(
      `DELETE FROM favorites WHERE user_id = ? AND file_id = ?`,
      [userId, fileId],
      function (err) {
        if (err) {
          console.error('Error removing from favorites:', err);
          reject(err);
        } else {
          resolve({ removed: this.changes > 0 });
        }
      }
    );
  });
};

// 获取用户的所有收藏
export const getUserFavorites = (userId, page = 0, pageSize = 20) => {
  return new Promise((resolve, reject) => {
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
        f.updated_at DESC,
        f.created_at DESC
      ${pageSize > 0 ? `LIMIT ? OFFSET ?` : ''}
    `;
    
    const params = pageSize > 0 
      ? [userId, pageSize, page * pageSize]
      : [userId];
    
    db.all(query, params, (err, rows) => {
      if (err) {
        console.error('Error getting user favorites:', err);
        reject(err);
      } else {
        resolve(rows.map(row => ({
            id: row.id,
            type: row.type,
            mime_type: row.mime_type,
            filename: row.name,
            path: row.path,
            thumbnail: row.thumbnail,
            lastModified: row.last_modified,
            size: row.size,
            parent_id: row.parent_id
          })));
      }
    });
  });
};

// 检查文件是否已收藏
export const isFileFavorited = (userId, fileId) => {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT id FROM favorites WHERE user_id = ? AND file_id = ?`,
      [userId, fileId],
      (err, row) => {
        if (err) {
          console.error('Error checking if file is favorited:', err);
          reject(err);
        } else {
          resolve(!!row);
        }
      }
    );
  });
};

// 获取文件的收藏状态
export const getFavoritesStatus = async (userId, fileIds) => {
  if (!fileIds || fileIds.length === 0) {
    return {};
  }

  return new Promise((resolve, reject) => {
    const placeholders = fileIds.map(() => '?').join(',');
    const query = `
      SELECT file_id 
      FROM favorites 
      WHERE user_id = ? AND file_id IN (${placeholders})
    `;
    
    db.all(query, [userId, ...fileIds], (err, rows) => {
      if (err) {
        console.error('Error getting favorites status:', err);
        reject(err);
      } else {
        const favoritedIds = rows.map(row => row.file_id);
        const result = {};
        
        fileIds.forEach(id => {
          result[id] = favoritedIds.includes(id);
        });
        
        resolve(result);
      }
    });
  });
};