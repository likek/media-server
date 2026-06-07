import fs from "fs";
import path from "path";
import mime from 'mime-types';
import { MEDIA_FULL_PATH, THUMB_FULL_PATH } from "../serverConfig.js";
import { isVideoByName, generateThumbnail, getUserIdByReq } from "./utils/index.js";
import db from "./dbserialize.js";
import { getFavoritesStatus } from "./favoritesManager.js";
import { generateSegmentedWhereClause, rankResultsByRelevance } from "./utils/segmentUtils.js"; 

const normalizeRelPath = (input = "") => String(input || "").replace(/\\/g, "/").replace(/^\//, "");
const isImageMimeType = (mimeType = "") => typeof mimeType === "string" && mimeType.startsWith("image/");

let folderCoverStatements;
const getFolderCoverStatements = () => {
  if (!folderCoverStatements) {
    folderCoverStatements = {
      upsert: db.prepare(`
        INSERT INTO folder_covers (folder_id, cover_file_id, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(folder_id) DO UPDATE SET
          cover_file_id = excluded.cover_file_id,
          updated_at = CURRENT_TIMESTAMP
      `),
      deleteByFolderId: db.prepare(`DELETE FROM folder_covers WHERE folder_id = ?`),
      deleteByCoverFileId: db.prepare(`DELETE FROM folder_covers WHERE cover_file_id = ?`),
      selectByFolderId: db.prepare(`
        SELECT
          fc.folder_id,
          fc.cover_file_id,
          f.parent_id AS cover_parent_id,
          f.mime_type AS cover_mime_type
        FROM folder_covers fc
        LEFT JOIN files f ON f.id = fc.cover_file_id
        WHERE fc.folder_id = ?
      `)
    };
  }
  return folderCoverStatements;
};

const getFolderCoverMap = (folderIds = []) => {
  const validFolderIds = Array.from(new Set(folderIds.filter(id => id !== null && id !== undefined)));
  if (validFolderIds.length === 0) return {};
  const placeholders = validFolderIds.map(() => "?").join(",");
  const rows = db.prepare(`SELECT folder_id, cover_file_id FROM folder_covers WHERE folder_id IN (${placeholders})`).all(...validFolderIds);
  return rows.reduce((acc, row) => {
    acc[row.folder_id] = row.cover_file_id;
    return acc;
  }, {});
};

const chooseFirstImageChild = (fileInfos = []) => {
  const imageCandidates = fileInfos
    .filter(item => item && item.type === "file" && isImageMimeType(item.mime_type))
    .sort((a, b) => String(a.filename || "").localeCompare(String(b.filename || "")));
  return imageCandidates[0] || null;
};

const ensureFolderCoverForFolder = (folderPath, fileInfos, options = {}) => {
  const { upsert, deleteByFolderId, selectByFolderId } = getFolderCoverStatements();
  const normalizedPath = normalizeRelPath(folderPath);
  if (!normalizedPath) {
    return { skippedRoot: true, autoSet: false, missingImage: false, clearedInvalid: false };
  }

  const folderInfo = getFileByPath(normalizedPath);
  if (!folderInfo || folderInfo.type !== "folder") {
    return { skippedRoot: false, autoSet: false, missingImage: false, clearedInvalid: false };
  }

  const currentCover = selectByFolderId.get(folderInfo.id);
  const hasValidCover =
    !!currentCover &&
    Number(currentCover.cover_parent_id) === Number(folderInfo.id) &&
    isImageMimeType(currentCover.cover_mime_type);

  let clearedInvalid = false;
  if (currentCover && !hasValidCover) {
    deleteByFolderId.run(folderInfo.id);
    clearedInvalid = true;
  }

  if (hasValidCover) {
    return { skippedRoot: false, autoSet: false, missingImage: false, clearedInvalid };
  }

  const firstImage = chooseFirstImageChild(fileInfos);
  if (firstImage) {
    upsert.run(folderInfo.id, firstImage.id);
    return { skippedRoot: false, autoSet: true, missingImage: false, clearedInvalid, folderId: folderInfo.id, coverFileId: firstImage.id };
  }

  if (options.logMissing) {
    console.warn(`[folder_cover] missing_image folderId=${folderInfo.id} path=${normalizedPath}`);
  }

  return { skippedRoot: false, autoSet: false, missingImage: true, clearedInvalid, folderId: folderInfo.id };
};

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
    const files = (await fs.promises.readdir(fullPath)).filter(name => name !== '.DS_Store');
    
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
          let thumbnail;
          if (isVideo) {
            const thumbnailRel = path.join(folderPath, fileName + ".png").replace(/^\//, '');
            if (!fs.existsSync(thumbnailPath)) {
              try {
                await generateThumbnail(filePath, thumbnailPath);
              } catch (e) {
                console.warn(`[updateFolderContents] thumbnail_failed file=${filePath} thumbnail=${thumbnailPath} err=${e?.message || String(e)}`);
              }
            }
            if (fs.existsSync(thumbnailPath)) {
              thumbnail = thumbnailRel;
            }
          }
          
          const fileInfo = {
            type: "file",
            mime_type: mimeType, // Add mime_type for file
            filename: fileName,
            path: path.join(folderPath, fileName).replace(/\\/g, "/").replace(/^\//, ''),
            thumbnail,
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

const updateFolderTreeByPath = async (rootFolderPath, options = {}) => {
  const maxFolders = Number(options.maxFolders || 20000);
  const root = (rootFolderPath || "").replace(/\\/g, "/").replace(/^\//, "");
  const queue = [root];
  const visited = new Set();
  let processedFolders = 0;
  let errors = 0;
  let truncated = false;
  let autoSetFolderCovers = 0;
  let missingFolderCoverImages = 0;
  let clearedInvalidFolderCovers = 0;

  while (queue.length > 0) {
    const current = (queue.shift() || "").replace(/\\/g, "/").replace(/^\//, "");
    if (visited.has(current)) continue;
    visited.add(current);

    processedFolders += 1;
    if (processedFolders > maxFolders) {
      truncated = true;
      break;
    }

    let result;
    try {
      result = await updateFolderByPath(current);
    } catch (e) {
      errors += 1;
      continue;
    }

    const children = (result?.fileInfos || [])
      .filter((x) => x && x.type === "folder" && typeof x.path === "string")
      .map((x) => x.path.replace(/\\/g, "/").replace(/^\//, ""));

    const coverResult = ensureFolderCoverForFolder(current, result?.fileInfos || [], {
      logMissing: options.logMissingFolderCover === true
    });
    if (coverResult.autoSet) autoSetFolderCovers += 1;
    if (coverResult.missingImage) missingFolderCoverImages += 1;
    if (coverResult.clearedInvalid) clearedInvalidFolderCovers += 1;

    for (const child of children) {
      if (!visited.has(child)) queue.push(child);
    }
  }

  return {
    processedFolders: visited.size,
    errors,
    truncated,
    maxFolders,
    autoSetFolderCovers,
    missingFolderCoverImages,
    clearedInvalidFolderCovers,
  };
};

const cleanDbTreeByPath = async (rootFolderPath, options = {}) => {
  const maxFolders = Number(options.maxFolders || 20000);
  const dryRun = options.dryRun === true;
  const fixThumbnails = options.fixThumbnails === true;

  const root = (rootFolderPath || "").replace(/\\/g, "/").replace(/^\//, "");
  const queue = [root];
  const visited = new Set();
  let scannedFolders = 0;
  let deleted = 0;
  let deletedFolders = 0;
  let deletedFiles = 0;
  let clearedThumbnails = 0;
  let regeneratedThumbnails = 0;
  let errors = 0;
  let truncated = false;

  const selectFolderIdByPath = db.prepare(`SELECT id FROM files WHERE type = 'folder' AND path = ?`);
  const selectChildrenByParent = db.prepare(`SELECT id, name, type, path, mime_type, thumbnail FROM files WHERE parent_id = ?`);
  const selectChildrenRoot = db.prepare(`SELECT id, name, type, path, mime_type, thumbnail FROM files WHERE parent_id IS NULL`);
  const deleteById = db.prepare(`DELETE FROM files WHERE id = ?`);
  const clearThumbnailById = db.prepare(`UPDATE files SET thumbnail = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`);
  const selectOrphans = root
    ? db.prepare(`
        SELECT c.id, c.type, c.path
        FROM files c
        LEFT JOIN files p ON c.parent_id = p.id
        WHERE c.parent_id IS NOT NULL
          AND p.id IS NULL
          AND (c.path = ? OR c.path LIKE ?)
      `)
    : db.prepare(`
        SELECT c.id, c.type, c.path
        FROM files c
        LEFT JOIN files p ON c.parent_id = p.id
        WHERE c.parent_id IS NOT NULL
          AND p.id IS NULL
      `);

  while (queue.length > 0) {
    const current = (queue.shift() || "").replace(/\\/g, "/").replace(/^\//, "");
    if (visited.has(current)) continue;
    visited.add(current);
    scannedFolders += 1;
    if (scannedFolders > maxFolders) {
      truncated = true;
      break;
    }

    const fullFolderPath = path.join(MEDIA_FULL_PATH, current);
    let folderEntries;
    try {
      folderEntries = (await fs.promises.readdir(fullFolderPath)).filter(name => name !== '.DS_Store');
    } catch (e) {
      errors += 1;
      continue;
    }
    const folderEntrySet = new Set(folderEntries);

    let parentId;
    if (!current) {
      parentId = null;
    } else {
      const row = selectFolderIdByPath.get(current);
      parentId = row ? row.id : null;
    }

    let dbChildren;
    try {
      dbChildren = parentId === null ? selectChildrenRoot.all() : selectChildrenByParent.all(parentId);
    } catch (e) {
      errors += 1;
      continue;
    }

    for (const child of dbChildren) {
      const existsInFs = folderEntrySet.has(child.name);
      const childRelPath = (child.path || "").replace(/\\/g, "/").replace(/^\//, "");
      const childFullPath = path.join(MEDIA_FULL_PATH, childRelPath);
      if (!existsInFs || !fs.existsSync(childFullPath)) {
        if (!dryRun) {
          try {
            deleteById.run(child.id);
          } catch (e) {
            errors += 1;
            continue;
          }
        }
        deleted += 1;
        if (child.type === "folder") deletedFolders += 1;
        else deletedFiles += 1;
        continue;
      }

      if (child.type === "folder") {
        queue.push(childRelPath);
        continue;
      }

      const isVideo = (child.mime_type || "").startsWith("video/") || isVideoByName(child.name || "");
      if (!isVideo) continue;

      const thumbnailRel = child.thumbnail ? String(child.thumbnail).replace(/^\//, "") : "";
      const thumbFullPath = thumbnailRel ? path.join(THUMB_FULL_PATH, thumbnailRel) : "";
      const thumbOk = thumbnailRel && fs.existsSync(thumbFullPath);

      if (!thumbOk && thumbnailRel) {
        if (fixThumbnails) {
          try {
            fs.mkdirSync(path.dirname(thumbFullPath), { recursive: true });
            await generateThumbnail(childFullPath, thumbFullPath);
          } catch {}
        }

        const afterOk = thumbnailRel && fs.existsSync(thumbFullPath);
        if (afterOk) {
          regeneratedThumbnails += 1;
        } else {
          if (!dryRun) {
            try {
              clearThumbnailById.run(child.id);
            } catch (e) {
              errors += 1;
              continue;
            }
          }
          clearedThumbnails += 1;
        }
      }
    }
  }

  const orphans = root ? selectOrphans.all(root, `${root}/%`) : selectOrphans.all();
  for (const orphan of orphans) {
    if (!dryRun) {
      try {
        deleteById.run(orphan.id);
      } catch (e) {
        errors += 1;
        continue;
      }
    }
    deleted += 1;
    if (orphan.type === "folder") deletedFolders += 1;
    else deletedFiles += 1;
  }

  return {
    dryRun,
    fixThumbnails,
    root,
    scannedFolders,
    deleted,
    deletedFolders,
    deletedFiles,
    clearedThumbnails,
    regeneratedThumbnails,
    errors,
    truncated,
    maxFolders
  };
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
  const filter_space = filters?.space || '' // 全局 or 当前目录下
  const start_date = filters?.start_date
  const end_date = filters?.end_date

  // 构建基础查询条件
  let whereClause = '';
  const params = [];
  const isEnterFolder = !searchQuery && Object.values(filters).filter(v => typeof v !== 'undefined' && v !== null && String(v).trim() !== '').length === 0
  
  if (isEnterFolder) {
    // 浏览文件夹内容
    // 添加parent_id过滤
    if (folderId) {
      whereClause += ` parent_id = ?`
      params.push(folderId);
    } else {
      whereClause += ` parent_id IS NULL`
    }
  } else {
    // 搜索内容
    // 添加名称过滤，使用分词搜索
    if (searchQuery) {
      // 使用分词工具生成查询条件
      const segmentedSearch = generateSegmentedWhereClause(searchQuery, 'name');
      whereClause += segmentedSearch.whereClause;
      params.push(...segmentedSearch.params);
    }

    // 添加搜索范围约束
    if (filter_space === 'children') {
      // 当前folder及其子目录
      if (folderId) {
        whereClause += whereClause ? ' AND' : '' 
        whereClause += ` (path = ? OR path LIKE ?)`;
        params.push(folderPath, `${folderPath}/%`); 
      } else {
        // 根目录
        // 相当于全局
      }
    } else if (filter_space === 'level_1') {
      // 当前folder一级
      whereClause += whereClause ? ' AND' : '' 
      if (folderId) {
        whereClause += ` parent_id = ?`;
        params.push(folderId);
      } else {
        // 根目录
        whereClause += ` parent_id IS NULL`;
      }
    } else {
      // 全局
      // ...
    }
    
    // 添加类型过滤
    if (filter_type === 'folder' || filter_type === 'file') {
      whereClause += whereClause ? ' AND' : '' 
      whereClause += ` type = ?`
      params.push(filter_type);
    }
    
    // 添加mime_type过滤
    if ((filter_mime_type && (filter_mime_type.startsWith('video') || filter_mime_type.startsWith('image'))) && filter_type !== 'folder') {
      whereClause += whereClause ? ' AND' : '' 
      whereClause += ` mime_type LIKE ?`
      params.push(`${filter_mime_type}%`);
    }

    // 添加起始日期过滤
    if (start_date && /^\d{4}-\d{2}-\d{2}$/.test(start_date)) {
      whereClause += whereClause ? ' AND' : ''
      whereClause += ` last_modified >= ?`
      params.push(`${start_date}T00:00:00.000Z`)
    }
    
    if (end_date && /^\d{4}-\d{2}-\d{2}$/.test(end_date)) {
      whereClause += whereClause ? ' AND' : ''
      whereClause += ` last_modified <= ?`
      params.push(`${end_date}T23:59:59.999Z`)
    }
  }
  
  // 先获取总数
  const countQuery = `SELECT COUNT(*) as total FROM files WHERE ${whereClause || '1=1'}`;
  // console.log('countQuery: ', countQuery, params)
  // console.log('params:', filters, searchQuery, page, pageSize)
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
  const folderCoverMap = getFolderCoverMap(rows.filter(row => row.type === "folder").map(row => row.id));
  
  // 转换数据库记录为前端期望的格式
  let fileInfos = rows.map(row => ({
    id: row.id,
    type: row.type,
    filename: row.name,
    // path: row.path,
    // thumbnail: row.thumbnail,
    lastModified: row.last_modified,
    size: row.size,
    parent_id: row.parent_id,
    favorited: false, // 默认为未收藏状态，后续会更新
    m3u8_path: row.m3u8_path,
    mime_type: row.mime_type,
    cover_file_id: row.type === "folder" ? (folderCoverMap[row.id] || null) : null
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
  if (fileInfos.length === 0 && page === 0 && isEnterFolder) {
    try {
      // 检查物理文件夹中是否有文件但数据库中没有记录
      const fullPath = path.join(MEDIA_FULL_PATH, folderPath);
      if (fs.existsSync(fullPath)) {
        const files = (await fs.promises.readdir(fullPath)).filter(name => name !== '.DS_Store');
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

  // 在返回结果前，对结果进行相关性排序
  if (searchQuery && fileInfos.length > 0) {
    fileInfos = rankResultsByRelevance(fileInfos, searchQuery, 'filename');
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
    mime_type: row.mime_type,
    m3u8_path: row.m3u8_path,
    cover_file_id: row.type === "folder" ? (getFolderCoverMap([row.id])[row.id] || null) : null,
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
    mime_type: row.mime_type,
    m3u8_path: row.m3u8_path,
    cover_file_id: row.type === "folder" ? (getFolderCoverMap([row.id])[row.id] || null) : null,
  };
  return fileInfo;
};

const setFolderCoverByFileId = (fileId) => {
  const { upsert } = getFolderCoverStatements();
  const fileInfo = getFileById(fileId);
  if (!fileInfo) {
    throw new Error("Image file not found");
  }
  if (fileInfo.type !== "file" || !isImageMimeType(fileInfo.mime_type)) {
    throw new Error("Only image files can be used as folder cover");
  }
  if (fileInfo.parent_id === null || fileInfo.parent_id === undefined) {
    throw new Error("Root folder images cannot be used as folder cover");
  }

  const folderInfo = getFileById(fileInfo.parent_id);
  if (!folderInfo || folderInfo.type !== "folder") {
    throw new Error("Parent folder not found");
  }

  upsert.run(folderInfo.id, fileInfo.id);
  return {
    success: true,
    folderId: folderInfo.id,
    folderPath: folderInfo.path,
    coverFileId: fileInfo.id,
    coverFilePath: fileInfo.path
  };
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
  const { deleteByCoverFileId } = getFolderCoverStatements();
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
  if (fileInfo.type === "file" && isImageMimeType(fileInfo.mime_type) && Number(fileInfo.parent_id) !== Number(targetFolderId)) {
    deleteByCoverFileId.run(fileId);
  }
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
      const files = (await fs.promises.readdir(fullPath)).filter(name => name !== '.DS_Store');
      
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
          let thumbnail;
          if (isVideo) {
            const thumbnailRel = path.join(currentPath, fileName + ".png");
            if (!fs.existsSync(thumbnailPath)) {
              try {
                await generateThumbnail(filePath, thumbnailPath);
              } catch (e) {
                console.warn(`[initRootDirectory] thumbnail_failed file=${filePath} thumbnail=${thumbnailPath} err=${e?.message || String(e)}`);
              }
            }
            if (fs.existsSync(thumbnailPath)) {
              thumbnail = thumbnailRel;
            }
          }
          
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
  updateFolderTreeByPath,
  cleanDbTreeByPath,
  getFolderContentsById,
  getFileById,
  getFileByPath,
  setFolderCoverByFileId,
  deleteFileById,
  renameFileById,
  moveFileById,
  initRootDirectory,
  getFolderId
};
