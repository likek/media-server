import fs from "fs";
import path from "path";
import mime from 'mime-types';
import { MEDIA_FULL_PATH, THUMB_FULL_PATH } from "../serverConfig.js";
import { isVideoByName, generateThumbnail, getUserIdByReq } from "./utils/index.js";
import db from "./dbserialize.js";
import { getFavoritesStatus } from "./favoritesManager.js";

// 获取文件夹的ID
const getFolderId = (folderPath) => {
  if (!folderPath || folderPath === "/" || folderPath === "") {
    // 根目录的ID为null
    return null;
  }

  // 规范化路径
  if (folderPath.startsWith("/")) {
    folderPath = folderPath.slice(1);
  }

  // 获取父文件夹路径和当前文件夹名称
  const parentPath = path.dirname(folderPath);
  const folderName = path.basename(folderPath);

  try {
    // 如果父路径是 '.'，表示当前文件夹在根目录下
    const parentIdValue = parentPath === '.' ? null : getFolderId(parentPath);

    // 查询数据库获取文件夹ID
    const query = `SELECT id FROM files WHERE name = ? AND type = 'folder' AND parent_id ${parentIdValue === null ? 'IS NULL' : '= ?'}`;
    const params = parentIdValue === null ? [folderName] : [folderName, parentIdValue];

    const stmt = db.prepare(query);
    const row = stmt.get(...params);

    if (row) {
      return row.id;
    } else {
      // 如果文件夹不存在，创建它
      return createFolder(folderName, parentIdValue);
    }
  } catch (err) {
    throw err;
  }
};

// 创建文件夹
const createFolder = (folderName, parentId) => {
  try {
    const query = `INSERT INTO files (name, type, parent_id, path, size, last_modified) VALUES (?, 'folder', ?, ?, 0, ?)`;
    
    // 构建路径
    let folderPath = folderName;
    if (parentId !== null) {
      const stmt = db.prepare(`SELECT path FROM files WHERE id = ?`);
      const row = stmt.get(parentId);
      
      if (row) {
        folderPath = path.join(row.path, folderName);
      }
    }
    
    const now = new Date().toISOString();
    const stmt = db.prepare(query);
    const result = stmt.run(folderName, parentId, folderPath, now);
    return result.lastInsertRowid;
  } catch (err) {
    throw err;
  }
};

// 更新文件夹内容
const updateFolderContents = async (folderId, folderPath) => {
  // 规范化路径
  if (folderPath.startsWith("/")) {
    folderPath = folderPath.slice(1);
  }
  
  const fullPath = path.join(MEDIA_FULL_PATH, folderPath);
  
  try {
    // 读取文件夹内容
    const files = await fs.promises.readdir(fullPath);
    
    // 获取当前数据库中的文件列表
    let existingFiles;
    try {
      const query = `SELECT id, name FROM files WHERE parent_id ${folderId === null ? 'IS NULL' : '= ?'}`;
      const stmt = db.prepare(query);
      existingFiles = folderId !== null ? stmt.all(folderId) : stmt.all();
    } catch (err) {
      throw err;
    }
    
    // 创建现有文件的映射，用于快速查找
    const existingFileMap = {};
    existingFiles.forEach(file => {
      existingFileMap[file.name] = file.id;
    });
    
    // 处理每个文件
    const fileInfos = await Promise.all(
      files.map(async (fileName) => {
        const filePath = path.join(fullPath, fileName);
        const stats = await fs.promises.stat(filePath);
        
        // 检查文件是否已存在于数据库中
        const existingId = existingFileMap[fileName];
        
        if (stats.isDirectory()) {
          // 处理文件夹
          const folderInfo = {
            type: "folder",
            mime_type: "folder", // Add mime_type for folder
            filename: fileName,
            path: path.join(folderPath, fileName).replace(/\\/g, "/").replace(/^\//, ''),
            lastModified: stats.mtime,
            size: stats.size,
          };
          
          if (existingId) {
            // 更新现有文件夹
            try {
              // Update mime_type as well, though it should always be 'folder'
              const stmt = db.prepare(`UPDATE files SET size = ?, last_modified = ?, mime_type = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`);
              stmt.run(stats.size, stats.mtime.toISOString(), 'folder', existingId);
            } catch (err) {
              throw err;
            }
            folderInfo.id = existingId;
          } else {
            // 创建新文件夹记录
            let id;
            try {
              const stmt = db.prepare(`INSERT INTO files (name, type, mime_type, parent_id, path, size, last_modified) VALUES (?, 'folder', ?, ?, ?, ?, ?)`);
              const result = stmt.run(fileName, 'folder', folderId, folderInfo.path, stats.size, stats.mtime.toISOString());
              id = result.lastInsertRowid;
            } catch (err) {
              throw err;
            }
            folderInfo.id = id;
          }
          
          return folderInfo;
        } else {
          // 处理文件
          const thumbnailPath = path.join(THUMB_FULL_PATH, folderPath, fileName + ".png");
          const isVideo = isVideoByName(fileName);
          const mimeType = mime.lookup(fileName) || 'application/octet-stream'; // Determine mime type
          if (isVideo && !fs.existsSync(thumbnailPath)) {
            await generateThumbnail(filePath, thumbnailPath);
          }
          const thumbnail = isVideo ? path.join(folderPath, fileName + ".png").replace(/^\//, '') : undefined;
          
          const fileInfo = {
            type: "file",
            mime_type: mimeType, // Add mime_type for file
            filename: fileName,
            path: path.join(folderPath, fileName).replace(/\\/g, "/").replace(/^\//, ''),
            thumbnail: isVideo ? thumbnail : undefined,
            lastModified: stats.mtime,
            size: stats.size,
          };
          
          if (existingId) {
            // 更新现有文件
            try {
              const stmt = db.prepare(`UPDATE files SET size = ?, last_modified = ?, thumbnail = ?, mime_type = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`);
              stmt.run(stats.size, stats.mtime.toISOString(), thumbnail, mimeType, existingId);
            } catch (err) {
              throw err;
            }
            fileInfo.id = existingId;
          } else {
            // 创建新文件记录
            let id;
            try {
              const stmt = db.prepare(`INSERT INTO files (name, type, mime_type, parent_id, path, size, last_modified, thumbnail) VALUES (?, 'file', ?, ?, ?, ?, ?, ?)`);
              const result = stmt.run(fileName, mimeType, folderId, fileInfo.path, stats.size, stats.mtime.toISOString(), thumbnail);
              id = result.lastInsertRowid;
            } catch (err) {
              throw err;
            }
            fileInfo.id = id;
          }
          
          return fileInfo;
        }
      })
    );
    
    // 删除不再存在的文件
    const currentFileNames = files.map(f => f);
    const filesToDelete = existingFiles.filter(file => !currentFileNames.includes(file.name));
    
    if (filesToDelete.length > 0) {
      const idsToDelete = filesToDelete.map(file => file.id);
      try {
        const stmt = db.prepare(`DELETE FROM files WHERE id IN (${idsToDelete.map(() => '?').join(',')})`);
        stmt.run(...idsToDelete);
      } catch (err) {
        throw err;
      }
    }
    
    return {
      updated: true,
      fileInfos
    };
  } catch (err) {
    console.error("Error updating folder contents:", err);
    throw err;
  }
};

// 根据路径更新文件夹内容
const updateFolderByPath = async (folderPath) => {
  try {
    const folderId = getFolderId(folderPath);
    return await updateFolderContents(folderId, folderPath);
  } catch (err) {
    console.error("Error updating folder by path:", err);
    throw err;
  }
};

// 根据ID获取文件夹内容
const getFolderContentsById = async (folderId, searchQuery, filters, page, pageSize, req) => {
  if (!folderId) {
    folderId = null;
  }
  // 获取文件夹信息，用于后续自动刷新缓存
  let folderPath = "";
  if (folderId !== null) {
    const folderInfo = getFileById(folderId);
    if (!folderInfo) {
      return resolve({ files: [], total: 0 });
    }
    folderPath = folderInfo.path;
  }

  const filter_type = filters?.type
  const filter_mime_type = filters?.mime_type

  // 构建基础查询条件
  let whereClause = '';
  const params = [];
  
  if (searchQuery) {
    // 搜索模式
    whereClause += ` name LIKE ?`
    params.push(`%${searchQuery}%`);
    if (folderPath) {
      whereClause += ` AND (path = ? OR path LIKE ?)`;
      params.push(folderPath, `${folderPath}/%`);
    }
  } else {
    // 浏览模式
    if (folderId) {
      whereClause += ` parent_id = ?`
      params.push(folderId);
    } else {
      whereClause += ` parent_id IS NULL`
    }
  }
  
  // 添加类型过滤
  if (filter_type) {
    whereClause += ` AND type = ?`
    params.push(filter_type);
  }
  
  // 添加mime_type过滤
  if (filter_mime_type) {
    whereClause += ` AND mime_type LIKE ?`
    params.push(`${filter_mime_type}%`);
  }
  
  // 先获取总数
  const countQuery = `SELECT COUNT(*) as total FROM files WHERE ${whereClause}`;
  const stmt = db.prepare(countQuery)
  const countRow = stmt.get(...params);
  const totalCount = countRow?.total || 0;
  
  // 获取分页数据
  const orderClause = ` ORDER BY 
    CASE 
      WHEN type = 'folder' THEN 1 
      WHEN mime_type LIKE 'video/%' THEN 2 
      WHEN mime_type LIKE 'image/%' THEN 3 
      ELSE 4 
    END, 
    last_modified DESC,
    updated_at DESC, 
    created_at DESC`;
  
  let query = `SELECT * FROM files WHERE ${whereClause} ${orderClause}`;
  
  // 添加分页
  if (typeof pageSize === 'number' && typeof page === 'number') {
    query += ` LIMIT ? OFFSET ?`;
    params.push(pageSize, page * pageSize);
  }

  const stmt2 = db.prepare(query);
  const rows = stmt2.all(...params);
  
  // 转换数据库记录为前端期望的格式
  const fileInfos = rows.map(row => ({
    id: row.id,
    type: row.type,
    filename: row.name,
    // path: row.path,
    // thumbnail: row.thumbnail,
    lastModified: row.last_modified,
    size: row.size,
    parent_id: row.parent_id,
    favorited: false // 默认为未收藏状态，后续会更新
  }));
  
  // 获取用户ID
  const userId = getUserIdByReq(req);
  
  // 如果用户已登录，获取收藏状态
  if (userId && fileInfos.length > 0) {
    try {
      const fileIds = fileInfos.map(file => file.id);
      const favoritesStatus = getFavoritesStatus(userId, fileIds);
      
      // 更新文件的收藏状态
      fileInfos.forEach(file => {
        file.favorited = favoritesStatus[file.id] || false;
      });
    } catch (error) {
      console.error('获取收藏状态失败:', error);
      // 出错时继续使用默认的收藏状态
    }
  }
  
  // 如果文件夹内容为空，自动刷新缓存
  if (fileInfos.length === 0 && page === 0 && !searchQuery) {
    try {
      // 检查物理文件夹中是否有文件但数据库中没有记录
      const fullPath = path.join(MEDIA_FULL_PATH, folderPath);
      if (fs.existsSync(fullPath)) {
        const files = await fs.promises.readdir(fullPath);
        // 如果物理文件夹中有文件但数据库中没有记录，则更新缓存
        if (files.length > 0 && files.length > fileInfos.length) {
          console.log(`自动刷新文件夹缓存: ${folderPath}`);
          const updatedContents = await updateFolderContents(folderId, folderPath);
          if (updatedContents && updatedContents.fileInfos) {
            return { files: [], total: 0 }
          }
        }
      }
    } catch (error) {
      console.error("自动刷新缓存出错:", error);
      // 出错时继续使用原始数据
    }
  }
  
  // 返回文件列表和总数
  return {
    files: fileInfos,
    total: totalCount
  }
};

// 根据ID获取文件或文件夹信息
const getFileById = (fileId) => {
  const stmt = db.prepare(`SELECT * FROM files WHERE id =?`);
  const row = stmt.get(fileId);

  if (!row) {
    return null;
  }

  // 转换数据库记录为前端期望的格式
  const fileInfo = {
    id: row.id,
    type: row.type,
    filename: row.name,
    path: row.path,
    thumbnail: row.thumbnail,
    lastModified: row.last_modified,
    size: row.size,
    parent_id: row.parent_id,
    mime_type: row.mime_type
  }
  return fileInfo;
};

// 根据路径获取文件或文件夹信息
const getFileByPath = (filePath) => {
  // 规范化路径
  if (filePath.startsWith("/")) {
    filePath = filePath.slice(1);
  }

  const stmt = db.prepare(`SELECT * FROM files WHERE path =?`);
  const row = stmt.get(filePath);
  if (!row) {
    return null;
  }
  // 转换数据库记录为前端期望的格式
  const fileInfo = {
    id: row.id,
    type: row.type,
    filename: row.name,
    path: row.path,
    thumbnail: row.thumbnail,
    lastModified: row.last_modified,
    size: row.size,
    parent_id: row.parent_id,
    mime_type: row.mime_type
  };
  return fileInfo;
};

// 删除文件或文件夹
const deleteFileById = (fileId) => {
  // 首先获取文件信息
  const fileInfo = getFileById(fileId);
  if (!fileInfo) {
    reject(new Error("File not found"));
    return;
  }
  
  // 删除物理文件或文件夹
  const fullPath = path.join(MEDIA_FULL_PATH, fileInfo.path);
  
  const deleteRecursively = (filePath) => {
    if (fs.existsSync(filePath)) {
      if (fs.lstatSync(filePath).isDirectory()) {
        fs.readdirSync(filePath).forEach(file => {
          const curPath = path.join(filePath, file);
          deleteRecursively(curPath);
        });
        fs.rmdirSync(filePath);
      } else {
        fs.unlinkSync(filePath);
      }
    }
  };
  
  deleteRecursively(fullPath);
  
  // 从数据库中删除记录
  const stmt = db.prepare(`DELETE FROM files WHERE id = ? OR (parent_id = ? AND type = 'folder')`);
  stmt.run(fileId, fileId);
  return { success: true, message: `${fileInfo.type} deleted successfully` }
};

// 重命名文件或文件夹
const renameFileById = (fileId, newName) => {
  // 首先获取文件信息
  const fileInfo = getFileById(fileId)
  if (!fileInfo) {
    throw new Error("File not found");
  }
  
  // 获取父文件夹路径
  const dirPath = path.dirname(fileInfo.path);
  const oldPath = path.join(MEDIA_FULL_PATH, fileInfo.path);
  const newPath = path.join(MEDIA_FULL_PATH, dirPath, newName);
  
  // 检查新名称是否已存在
  if (fs.existsSync(newPath)) {
    throw new Error("File already exists");
  }
  fs.renameSync(oldPath, newPath)
  // 更新数据库记录
  const newFilePath = path.join(dirPath, newName).replace(/\\/g, "/");
    
  const stmt = db.prepare(`UPDATE files SET name =?, path =?, updated_at = CURRENT_TIMESTAMP WHERE id =?`);
  stmt.run(newName, newFilePath, fileId);

  // 如果是文件夹，还需要更新所有子文件和文件夹的路径
  if (fileInfo.type === 'folder') {
    const oldPathPrefix = fileInfo.path + '/';
    
    const rows = db.prepare(`SELECT id, path FROM files WHERE path LIKE ?`).all(`${oldPathPrefix}%`)
    // 批量更新子文件和文件夹的路径
    rows.map(row => {
      const newSubPath = row.path.replace(oldPathPrefix, `${newFilePath}/`);
      db.prepare(`UPDATE files SET path =? WHERE id =?`).run(newSubPath, row.id);
    });
    
    return { success: true, message: `${fileInfo.type} renamed successfully` }
  } else {
    return { success: true, message: `${fileInfo.type} renamed successfully` }
  }
};

// 移动文件或文件夹
const moveFileById = (fileId, targetFolderId) => {
  const fileInfo = getFileById(fileId);
  const targetFolderInfo = targetFolderId ? getFileById(targetFolderId) : { type: 'folder', path: '' };
  if (!fileInfo) {
    throw new Error("Source file not found")
  }
  
  if (!targetFolderInfo || targetFolderInfo.type !== 'folder') {
    throw new Error("Target folder not found");
  }
  
  // 检查是否将文件夹移动到自己的子文件夹中
  if (fileInfo.type === 'folder' && targetFolderInfo.path.startsWith(fileInfo.path + '/')) {
    throw new Error("Cannot move a folder into its own subfolder")
  }
  
  // 移动物理文件或文件夹
  const sourceFullPath = path.join(MEDIA_FULL_PATH, fileInfo.path);
  const targetFullPath = path.join(MEDIA_FULL_PATH, targetFolderInfo.path, fileInfo.filename);
  
  // 检查目标路径是否已存在同名文件或文件夹
  if (fs.existsSync(targetFullPath)) {
    throw new Error(`A file or folder with the same name already exists in the target folder`)
  }

  fs.renameSync(sourceFullPath, targetFullPath)
  // 更新数据库记录
  const newFilePath = path.join(targetFolderInfo.path, fileInfo.filename).replace(/\\/g, "/");
    
  const stmt = db.prepare(`UPDATE files SET parent_id =?, path =?, updated_at = CURRENT_TIMESTAMP WHERE id =?`);
  stmt.run(targetFolderId, newFilePath, fileId);
  // 如果是文件夹，还需要更新所有子文件和文件夹的路径
  if (fileInfo.type === 'folder') {
    const oldPathPrefix = fileInfo.path + '/';
    
    const rows = db.prepare(`SELECT id, path FROM files WHERE path LIKE ?`).all(`${oldPathPrefix}%`)
    // 批量更新子文件和文件夹的路径
    rows.map(row => {
      const newSubPath = row.path.replace(oldPathPrefix, `${newFilePath}/`);
      db.prepare(`UPDATE files SET path =? WHERE id =?`).run(newSubPath, row.id);
    });
    
    return { success: true }
  } else {
    return { success: true }
  }
};

// 初始化根目录
const initRootDirectory = async () => {
  try {
    // 检查数据库是否为空
    const isEmpty = db.prepare(`SELECT COUNT(*) as count FROM files`).get().count === 0;
    if (!isEmpty) {
      return;
    }
    
    console.log("数据库为空，开始递归扫描目录...");
    // 递归扫描整个目录结构
    async function scanDirectory(currentPath = "", parentId = null) {
      const fullPath = path.join(MEDIA_FULL_PATH, currentPath);
      const files = await fs.promises.readdir(fullPath);
      
      for (const fileName of files) {
        const filePath = path.join(fullPath, fileName);
        const stats = await fs.promises.stat(filePath);
        const relativePath = path.join(currentPath, fileName).replace(/\\/g, "/");
        
        if (stats.isDirectory()) {
          // 插入文件夹记录
          const result = db.prepare(`INSERT INTO files (name, type, parent_id, path, size, last_modified) VALUES (?, 'folder', ?, ?, ?, ?)`).run(fileName, parentId, relativePath, stats.size, stats.mtime.toISOString());
          const folderId = result.lastInsertRowid;
          // 递归处理子目录
          await scanDirectory(relativePath, folderId);
        } else {
          // 处理文件
          const isVideo = isVideoByName(fileName);
          const mimeType = mime.lookup(fileName) || 'application/octet-stream'; // Determine mime type
          const thumbnailPath = path.join(THUMB_FULL_PATH, currentPath, fileName + ".png");
          if (isVideo && !fs.existsSync(thumbnailPath)) {
            await generateThumbnail(filePath, thumbnailPath);
          }
          const thumbnail = isVideo ? path.join(currentPath, fileName + ".png") : undefined;
          
          // 插入文件记录
          db.prepare(`INSERT INTO files (name, type, mime_type, parent_id, path, size, last_modified, thumbnail) VALUES (?, 'file', ?, ?, ?, ?, ?, ?)`).run(fileName, mimeType, parentId, relativePath, stats.size, stats.mtime.toISOString(), thumbnail);
        }
      }
    }
    
    await scanDirectory();
    console.log("目录扫描完成，数据库初始化成功");
  } catch (err) {
    console.error("Error initializing root directory:", err);
    throw err;
  }
};

// 导出函数
export {
  updateFolderByPath,
  getFolderContentsById,
  getFileById,
  getFileByPath,
  deleteFileById,
  renameFileById,
  moveFileById,
  initRootDirectory,
  getFolderId
};