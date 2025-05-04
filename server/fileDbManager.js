import fs from "fs";
import path from "path";
import mime from 'mime-types';
import { MEDIA_FULL_PATH, THUMB_FULL_PATH } from "../serverConfig.js";
import { isVideoByName, generateThumbnail } from "./utils/index.js";
import db from "./dbserialize.js";
import { getFavoritesStatus } from "./favoritesManager.js";

// 获取文件夹的ID
const getFolderId = (folderPath) => {
  return new Promise((resolve, reject) => {
    if (!folderPath || folderPath === "/" || folderPath === "") {
      // 根目录的ID为null
      resolve(null);
      return;
    }

    // 规范化路径
    if (folderPath.startsWith("/")) {
      folderPath = folderPath.slice(1);
    }

    // 获取父文件夹路径和当前文件夹名称
    const parentPath = path.dirname(folderPath);
    const folderName = path.basename(folderPath);

    // 如果父路径是 '.'，表示当前文件夹在根目录下
    const parentId = parentPath === '.' ? null : getFolderId(parentPath);

    // 查询数据库获取文件夹ID
    Promise.resolve(parentId).then(parentIdValue => {
      const query = `SELECT id FROM files WHERE name = ? AND type = 'folder' AND parent_id ${parentIdValue === null ? 'IS NULL' : '= ?'}`;
      const params = parentIdValue === null ? [folderName] : [folderName, parentIdValue];

      db.get(query, params, (err, row) => {
        if (err) {
          reject(err);
          return;
        }

        if (row) {
          resolve(row.id);
        } else {
          // 如果文件夹不存在，创建它
          createFolder(folderName, parentIdValue).then(id => {
            resolve(id);
          }).catch(err => {
            reject(err);
          });
        }
      });
    }).catch(reject);
  });
};

// 创建文件夹
const createFolder = (folderName, parentId) => {
  return new Promise((resolve, reject) => {
    const query = `INSERT INTO files (name, type, parent_id, path, size, last_modified) VALUES (?, 'folder', ?, ?, 0, ?)`;
    
    // 构建路径
    let folderPath = folderName;
    if (parentId !== null) {
      db.get(`SELECT path FROM files WHERE id = ?`, [parentId], (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        
        if (row) {
          folderPath = path.join(row.path, folderName);
        }
        
        insertFolder();
      });
    } else {
      insertFolder();
    }
    
    function insertFolder() {
      const now = new Date().toISOString();
      db.run(query, [folderName, parentId, folderPath, now], function(err) {
        if (err) {
          reject(err);
          return;
        }
        resolve(this.lastID);
      });
    }
  });
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
    const existingFiles = await new Promise((resolve, reject) => {
      db.all(`SELECT id, name FROM files WHERE parent_id ${folderId === null ? 'IS NULL' : '= ?'}`, 
        folderId !== null ? [folderId] : [], 
        (err, rows) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(rows || []);
        });
    });
    
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
            path: path.join(folderPath, fileName).replace(/\\/g, "/"),
            lastModified: stats.mtime,
            size: stats.size,
          };
          
          if (existingId) {
            // 更新现有文件夹
            await new Promise((resolve, reject) => {
              // Update mime_type as well, though it should always be 'folder'
              db.run(`UPDATE files SET size = ?, last_modified = ?, mime_type = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                [stats.size, stats.mtime.toISOString(), 'folder', existingId],
                err => {
                  if (err) reject(err);
                  else resolve();
                });
            });
            folderInfo.id = existingId;
          } else {
            // 创建新文件夹记录
            const id = await new Promise((resolve, reject) => {
              db.run(`INSERT INTO files (name, type, mime_type, parent_id, path, size, last_modified) VALUES (?, 'folder', ?, ?, ?, ?, ?)`, // Add mime_type
                [fileName, 'folder', folderId, folderInfo.path, stats.size, stats.mtime.toISOString()],
                function(err) {
                  if (err) reject(err);
                  else resolve(this.lastID);
                });
            });
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
          const thumbnail = isVideo ? path.join(folderPath, fileName + ".png") : undefined;
          
          const fileInfo = {
            type: "file",
            mime_type: mimeType, // Add mime_type for file
            filename: fileName,
            path: path.join(folderPath, fileName).replace(/\\/g, "/"),
            thumbnail: isVideo ? thumbnail : undefined,
            lastModified: stats.mtime,
            size: stats.size,
          };
          
          if (existingId) {
            // 更新现有文件
            await new Promise((resolve, reject) => {
              db.run(`UPDATE files SET size = ?, last_modified = ?, thumbnail = ?, mime_type = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, // Add mime_type
                [stats.size, stats.mtime.toISOString(), thumbnail, mimeType, existingId],
                err => {
                  if (err) reject(err);
                  else resolve();
                });
            });
            fileInfo.id = existingId;
          } else {
            // 创建新文件记录
            const id = await new Promise((resolve, reject) => {
              db.run(`INSERT INTO files (name, type, mime_type, parent_id, path, size, last_modified, thumbnail) VALUES (?, 'file', ?, ?, ?, ?, ?, ?, ?)`, // Add mime_type
                [fileName, mimeType, folderId, fileInfo.path, stats.size, stats.mtime.toISOString(), thumbnail],
                function(err) {
                  if (err) reject(err);
                  else resolve(this.lastID);
                });
            });
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
      await new Promise((resolve, reject) => {
        db.run(`DELETE FROM files WHERE id IN (${idsToDelete.map(() => '?').join(',')})`,
          idsToDelete,
          err => {
            if (err) reject(err);
            else resolve();
          });
      });
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
    const folderId = await getFolderId(folderPath);
    return await updateFolderContents(folderId, folderPath);
  } catch (err) {
    console.error("Error updating folder by path:", err);
    throw err;
  }
};

// 根据ID获取文件夹内容
const getFolderContentsById = (folderId, searchQuery, page, pageSize, req) => {
  return new Promise(async (resolve, reject) => {
    try {
      // 获取文件夹信息，用于后续自动刷新缓存
      let folderPath = "";
      if (folderId !== null) {
        const folderInfo = await getFileById(folderId);
        if (folderInfo) {
          folderPath = folderInfo.path;
        }
      }

      const params = [];
      let query = `SELECT * FROM files`;
      if (searchQuery) {
        // 搜索模式
        query += ` WHERE name LIKE ?`
        params.push(`%${searchQuery}%`);
        if (folderPath) {
          query += ` AND (path = ? OR path LIKE ?)`;
          params.push(folderPath, `${folderPath}/%`);
        }
      } else {
        // 浏览模式
        if (folderId) {
          query += ` WHERE parent_id = ?`
          params.push(folderId);
        } else {
          query += ` WHERE parent_id IS NULL`
        }
      }
      // New sorting logic: Folder > Video > Image > Others, then by updated_at DESC
      query += ` ORDER BY 
                  CASE 
                    WHEN type = 'folder' THEN 1 
                    WHEN mime_type LIKE 'video/%' THEN 2 
                    WHEN mime_type LIKE 'image/%' THEN 3 
                    ELSE 4 
                  END, 
                  last_modified DESC,
                  updated_at DESC, 
                  created_at DESC`
      // 添加分页
      if (typeof pageSize === 'number' && typeof page === 'number') {
        query += ` LIMIT ? OFFSET ?`;
        params.push(pageSize, page * pageSize);
      }

      db.all(query, params, async (err, rows) => {
        if (err) {
          reject(err);
          return;
        }
        
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
        const userId = req?.cookies?.userId;
        
        // 如果用户已登录，获取收藏状态
        if (userId && fileInfos.length > 0) {
          try {
            const fileIds = fileInfos.map(file => file.id);
            const favoritesStatus = await getFavoritesStatus(userId, fileIds);
            
            // 更新文件的收藏状态
            fileInfos.forEach(file => {
              file.favorited = favoritesStatus[file.id] || false;
            });
          } catch (error) {
            console.error('获取收藏状态失败:', error);
            // 出错时继续使用默认的收藏状态
          }
        }
        
        if (searchQuery) {
          // 如果是搜索模式，则返回所有结果
          resolve(fileInfos);
          return;
        }
        // 如果文件夹内容为空，自动刷新缓存
        if (fileInfos.length === 0 && page === 0) {
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
                  resolve(updatedContents.fileInfos);
                  return;
                }
              }
            }
          } catch (error) {
            console.error("自动刷新缓存出错:", error);
            // 出错时继续使用原始数据
          }
        }
        
        resolve(fileInfos);
      });
    } catch (error) {
      reject(error);
    }
  });
};

// 根据ID获取文件或文件夹信息
const getFileById = (fileId) => {
  return new Promise((resolve, reject) => {
    db.get(`SELECT * FROM files WHERE id = ?`, [fileId], (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      
      if (!row) {
        resolve(null);
        return;
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
        parent_id: row.parent_id
      };
      
      resolve(fileInfo);
    });
  });
};

// 根据路径获取文件或文件夹信息
const getFileByPath = (filePath) => {
  return new Promise((resolve, reject) => {
    // 规范化路径
    if (filePath.startsWith("/")) {
      filePath = filePath.slice(1);
    }
    
    db.get(`SELECT * FROM files WHERE path = ?`, [filePath], (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      
      if (!row) {
        resolve(null);
        return;
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
        parent_id: row.parent_id
      };
      
      resolve(fileInfo);
    });
  });
};

// 删除文件或文件夹
const deleteFileById = (fileId) => {
  return new Promise((resolve, reject) => {
    // 首先获取文件信息
    getFileById(fileId).then(fileInfo => {
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
      
      try {
        deleteRecursively(fullPath);
        
        // 从数据库中删除记录
        db.run(`DELETE FROM files WHERE id = ? OR (parent_id = ? AND type = 'folder')`, [fileId, fileId], function(err) {
          if (err) {
            reject(err);
            return;
          }
          
          resolve({ success: true, message: `${fileInfo.type} deleted successfully` });
        });
      } catch (err) {
        reject(err);
      }
    }).catch(reject);
  });
};

// 重命名文件或文件夹
const renameFileById = (fileId, newName) => {
  return new Promise((resolve, reject) => {
    // 首先获取文件信息
    getFileById(fileId).then(fileInfo => {
      if (!fileInfo) {
        reject(new Error("File not found"));
        return;
      }
      
      // 获取父文件夹路径
      const dirPath = path.dirname(fileInfo.path);
      const oldPath = path.join(MEDIA_FULL_PATH, fileInfo.path);
      const newPath = path.join(MEDIA_FULL_PATH, dirPath, newName);
      
      // 检查新名称是否已存在
      if (fs.existsSync(newPath)) {
        reject(new Error(`${fileInfo.type} with the same name already exists`));
        return;
      }
      
      // 重命名物理文件或文件夹
      fs.rename(oldPath, newPath, err => {
        if (err) {
          reject(err);
          return;
        }
        
        // 更新数据库记录
        const newFilePath = path.join(dirPath, newName).replace(/\\/g, "/");
        
        db.run(`UPDATE files SET name = ?, path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [newName, newFilePath, fileId],
          function(err) {
            if (err) {
              reject(err);
              return;
            }
            
            // 如果是文件夹，还需要更新所有子文件和文件夹的路径
            if (fileInfo.type === 'folder') {
              const oldPathPrefix = fileInfo.path + '/';
              
              db.all(`SELECT id, path FROM files WHERE path LIKE ?`, [`${oldPathPrefix}%`], (err, rows) => {
                if (err) {
                  reject(err);
                  return;
                }
                
                // 批量更新子文件和文件夹的路径
                const updatePromises = rows.map(row => {
                  const newSubPath = row.path.replace(oldPathPrefix, `${newFilePath}/`);
                  
                  return new Promise((resolveUpdate, rejectUpdate) => {
                    db.run(`UPDATE files SET path = ? WHERE id = ?`, [newSubPath, row.id], err => {
                      if (err) rejectUpdate(err);
                      else resolveUpdate();
                    });
                  });
                });
                
                Promise.all(updatePromises)
                  .then(() => resolve({ success: true, message: `${fileInfo.type} renamed successfully` }))
                  .catch(reject);
              });
            } else {
              resolve({ success: true, message: `${fileInfo.type} renamed successfully` });
            }
          });
      });
    }).catch(reject);
  });
};

// 移动文件或文件夹
const moveFileById = (fileId, targetFolderId) => {
  return new Promise((resolve, reject) => {
    // 获取文件信息和目标文件夹信息
    Promise.all([
      getFileById(fileId),
      getFileById(targetFolderId)
    ]).then(([fileInfo, targetFolderInfo]) => {
      if (!fileInfo) {
        reject(new Error("Source file not found"));
        return;
      }
      
      if (!targetFolderInfo || targetFolderInfo.type !== 'folder') {
        reject(new Error("Target folder not found"));
        return;
      }
      
      // 检查是否将文件夹移动到自己的子文件夹中
      if (fileInfo.type === 'folder' && targetFolderInfo.path.startsWith(fileInfo.path + '/')) {
        reject(new Error("Cannot move a folder into its own subfolder"));
        return;
      }
      
      // 移动物理文件或文件夹
      const sourceFullPath = path.join(MEDIA_FULL_PATH, fileInfo.path);
      const targetFullPath = path.join(MEDIA_FULL_PATH, targetFolderInfo.path, fileInfo.filename);
      
      // 检查目标路径是否已存在同名文件或文件夹
      if (fs.existsSync(targetFullPath)) {
        reject(new Error(`A file or folder with the same name already exists in the target folder`));
        return;
      }
      
      fs.rename(sourceFullPath, targetFullPath, err => {
        if (err) {
          reject(err);
          return;
        }
        
        // 更新数据库记录
        const newFilePath = path.join(targetFolderInfo.path, fileInfo.filename).replace(/\\/g, "/");
        
        db.run(`UPDATE files SET parent_id = ?, path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [targetFolderId, newFilePath, fileId],
          function(err) {
            if (err) {
              reject(err);
              return;
            }
            
            // 如果是文件夹，还需要更新所有子文件和文件夹的路径
            if (fileInfo.type === 'folder') {
              const oldPathPrefix = fileInfo.path + '/';
              
              db.all(`SELECT id, path FROM files WHERE path LIKE ?`, [`${oldPathPrefix}%`], (err, rows) => {
                if (err) {
                  reject(err);
                  return;
                }
                
                // 批量更新子文件和文件夹的路径
                const updatePromises = rows.map(row => {
                  const newSubPath = row.path.replace(oldPathPrefix, `${newFilePath}/`);
                  
                  return new Promise((resolveUpdate, rejectUpdate) => {
                    db.run(`UPDATE files SET path = ? WHERE id = ?`, [newSubPath, row.id], err => {
                      if (err) rejectUpdate(err);
                      else resolveUpdate();
                    });
                  });
                });
                
                Promise.all(updatePromises)
                  .then(() => resolve({ success: true }))
                  .catch(reject);
              });
            } else {
              resolve({ success: true });
            }
          });
      });
    }).catch(reject);
  });
};

// 初始化根目录
const initRootDirectory = async () => {
  try {
    // 检查数据库是否为空
    const isEmpty = await new Promise((resolve, reject) => {
      db.get(`SELECT COUNT(*) as count FROM files`, [], (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(row.count === 0);
      });
    });
    
    if (isEmpty) {
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
            const folderId = await new Promise((resolve, reject) => {
              // Add mime_type = 'folder'
              db.run(
                `INSERT INTO files (name, type, mime_type, parent_id, path, size, last_modified) VALUES (?, 'folder', 'folder', ?, ?, ?, ?)`, // Add mime_type
                [fileName, parentId, relativePath, stats.size, stats.mtime.toISOString()],
                function(err) {
                  if (err) reject(err);
                  else resolve(this.lastID);
                }
              );
            });
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
            await new Promise((resolve, reject) => {
              db.run(
                `INSERT INTO files (name, type, mime_type, parent_id, path, size, last_modified, thumbnail) VALUES (?, 'file', ?, ?, ?, ?, ?, ?)`,
                [fileName, mimeType, parentId, relativePath, stats.size, stats.mtime.toISOString(), thumbnail],
                err => {
                  if (err) reject(err);
                  else resolve();
                }
              );
            });
          }
        }
      }
      
      await scanDirectory();
      console.log("目录扫描完成，数据库初始化成功");
    }
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