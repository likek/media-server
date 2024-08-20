import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import fs from 'fs';
import path from 'path';
import { UPLOAD_DIR, THUMB_DIR, thumbnailDirName } from '../serverConfig.js';
import { isVideoByName, generateThumbnail } from './utils/index.js';
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPromise = open({
  filename: path.join(__dirname, '../database.db'),
  driver: sqlite3.Database
});

// 删除文件或文件夹
async function deleteItemById(id) {
  const db = await dbPromise;
  const item = await db.get('SELECT * FROM file_system WHERE id = ?', [id]);
  if (item) {
    if (item.type === 'folder') {
      const children = await db.all('SELECT id FROM file_system WHERE parent_id = ?', [id]);
      for (const child of children) {
        await deleteItemById(child.id);
      }
    }
    const fullPath = path.join(UPLOAD_DIR, item.path);
    fs.rmSync(fullPath, { recursive: true, force: true });
    await db.run('DELETE FROM file_system WHERE id = ?', [id]);
  }
  
}

// 更名文件或文件夹
async function renameItemById(id, newName) {
  const item = await db.get('SELECT * FROM file_system WHERE id = ?', [id]);
  if (item) {
    const newPath = path.join(path.dirname(item.path), newName);
    const fullPath = path.join(UPLOAD_DIR, item.path);
    const newFullPath = path.join(UPLOAD_DIR, newPath);
    fs.renameSync(fullPath, newFullPath);
    await db.run('UPDATE file_system SET name = ?, path = ? WHERE id = ?', [newName, newPath, id]);
  }
  
}

// 移动文件或文件夹
async function moveItemById(id, newParentId) {
  const db = await dbPromise;
  const item = await db.get('SELECT * FROM file_system WHERE id = ?', [id]);
  const newParent = await db.get('SELECT * FROM file_system WHERE id = ?', [newParentId]);
  if (item && newParent) {
    const newPath = path.join(newParent.path, item.name);
    const fullPath = path.join(UPLOAD_DIR, item.path);
    const newFullPath = path.join(UPLOAD_DIR, newPath);
    fs.renameSync(fullPath, newFullPath);
    await db.run('UPDATE file_system SET parent_id = ?, path = ? WHERE id = ?', [newParentId, newPath, id]);
  }
  
}

// 新建文件或文件夹
async function createItemToParentId(name, parentId, type) {
  const db = await dbPromise;
  const parent = await db.get('SELECT * FROM file_system WHERE id = ?', [parentId]);
  if (parent) {
    const newPath = path.join(parent.path, name);
    const fullPath = path.join(UPLOAD_DIR, newPath);
    if (type === 'folder') {
      fs.mkdirSync(fullPath, { recursive: true });
    } else {
      fs.writeFileSync(fullPath, '');
    }
    const stats = fs.statSync(fullPath);
    await db.run(
      'INSERT INTO file_system (name, path, type, parent_id, last_modified, size) VALUES (?, ?, ?, ?, ?, ?)',
      [name, newPath, type, parentId, stats.mtime.toISOString(), stats.size]
    );
  }
  
}

// 查询某文件夹下的所有子级文件和文件夹
async function getItemsInFolderById(parentId) {
  const db = await dbPromise;
  const rows = await db.all('SELECT * FROM file_system WHERE parent_id = ?', [parentId]);
  
  return rows;
}

// 根据关键字搜索
async function searchItems(keyword) {
  const db = await dbPromise;
  const rows = await db.all('SELECT * FROM file_system WHERE name LIKE ?', [`%${keyword}%`]);
  
  return rows;
}

async function getItemById(id) {
  const db = await dbPromise;
  const row = await db.get('SELECT * FROM file_system WHERE id = ?', [id]);
  
  return row;
}

// 遍历并更新数据库
async function updateDatabaseFromFolder(folderPath, deep = false) {
  const db = await dbPromise;
  let updated = false;

  async function recursiveUpdate(dirPath, parentId) {
    const items = fs.readdirSync(dirPath);

    // 实际文件有，但数据库没有，插入到表
    for (const item of items) {
      const fullPath = path.join(dirPath, item);
      const stats = fs.statSync(fullPath);
      const type = stats.isDirectory() ? 'folder' : 'file';
      const relativePath = path.relative(UPLOAD_DIR, fullPath);
      const existingItem = await db.get('SELECT * FROM file_system WHERE path = ?', [relativePath]);
      let thumbnail = '';
      if (isVideoByName(relativePath)) {
        const thumbnailPath = path.join(THUMB_DIR, `${relativePath}.png`);
        await generateThumbnail(fullPath, thumbnailPath);
        thumbnail = `${thumbnailDirName}/${path.relative(THUMB_DIR, thumbnailPath)}`;
      }
      if (!existingItem) {
        await db.run(
          'INSERT INTO file_system (name, path, type, parent_id, last_modified, size, thumbnail) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [item, relativePath, type, parentId, stats.mtime.toISOString(), stats.size, thumbnail]
        );
        updated = true;
      } else if (deep && type === 'folder') {
        // 更新文件夹的 last_modified 和 size
        await db.run(
          'UPDATE file_system SET last_modified = ?, size = ? WHERE path = ?',
          [stats.mtime.toISOString(), stats.size, relativePath]
        );
        updated = true;
      }

      if (deep && type === 'folder') {
        const newItem = await db.get('SELECT id FROM file_system WHERE path = ?', [relativePath]);
        await recursiveUpdate(fullPath, newItem.id);
      }
    }

    // 实际没有，但表里有，从表删除
    const dbItems = await db.all('SELECT * FROM file_system WHERE parent_id = ?', [parentId]);
    const fsPaths = items.map(item => path.join(dirPath, item));

    for (const dbItem of dbItems) {
      if (!fsPaths.includes(dbItem.path)) {
        await db.run('DELETE FROM file_system WHERE id = ?', [dbItem.id]);
        updated = true;
      }
    }
  }

  await recursiveUpdate(folderPath, 1);
  return { updated };
}

// 移除以path为根的所有文件或文件夹(包括深层嵌套的文件或文件夹)
async function removePath(path) {
  const db = await dbPromise;
  const relativePath = path;

  // 删除数据库中的记录
  const deleted = await db.run('DELETE FROM file_system WHERE path LIKE ?', [`${relativePath}/%`]);
  return deleted
}

async function createRootRow() {
    const db = await dbPromise;
    const item = '';
    const parentId = 0;
    const fullPath = UPLOAD_DIR;
    const stats = fs.statSync(fullPath);
    const type = 'folder';
    const relativePath = path.relative(UPLOAD_DIR, fullPath);
    const existingItem = await db.get('SELECT * FROM file_system WHERE path = ?', [relativePath]);
    if (!existingItem) {
        await db.run(
            'INSERT INTO file_system (name, path, type, parent_id, last_modified, size, thumbnail) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [item, relativePath, type, parentId, stats.mtime.toISOString(), stats.size, '']
        );
    }
    
}

async function initFilesDb() {
    console.log('正在初始化数据库...')
    await createRootRow();
    await updateDatabaseFromFolder(UPLOAD_DIR, true);
    console.log('数据库初始化完成')
}

export {
  deleteItemById as deleteItem,
  renameItemById as renameItem,
  moveItemById as moveItem,
  createItemToParentId as createItem,
  getItemsInFolderById as getItemsInFolder,
  searchItems,
  updateDatabaseFromFolder,
  getItemById,
  initFilesDb,
  removePath
};
