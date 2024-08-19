import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import fs from 'fs';
import path from 'path';
import { UPLOAD_DIR, THUMB_DIR } from '../serverConfig.js';
import { isVideoByName, generateThumbnail } from './utils/index.js';
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPromise = open({
  filename: path.join(__dirname, '../database.db'),
  driver: sqlite3.Database
});

// 删除文件或文件夹
async function deleteItem(id) {
  const db = await dbPromise;
  const item = await db.get('SELECT * FROM file_system WHERE id = ?', [id]);
  if (item) {
    if (item.type === 'folder') {
      const children = await db.all('SELECT id FROM file_system WHERE parent_id = ?', [id]);
      for (const child of children) {
        await deleteItem(child.id);
      }
    }
    const fullPath = path.join(UPLOAD_DIR, item.path);
    fs.rmSync(fullPath, { recursive: true, force: true });
    await db.run('DELETE FROM file_system WHERE id = ?', [id]);
  }
  
}

// 更名文件或文件夹
async function renameItem(id, newName) {
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
async function moveItem(id, newParentId) {
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
async function createItem(name, parentId, type) {
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
async function getItemsInFolder(parentId) {
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
async function updateDatabaseFromFolder(folderPath) {
  const db = await dbPromise;
  async function recursiveUpdate(dirPath, parentId) {
    const items = fs.readdirSync(dirPath);
    for (const item of items) {
      const fullPath = path.join(dirPath, item);
      const stats = fs.statSync(fullPath);
      const type = stats.isDirectory() ? 'folder' : 'file';
      const relativePath = path.relative(UPLOAD_DIR, fullPath);
      const existingItem = await db.get('SELECT * FROM file_system WHERE path = ?', [relativePath]);
      if (!existingItem) {
        await db.run(
          'INSERT INTO file_system (name, path, type, parent_id, last_modified, size) VALUES (?, ?, ?, ?, ?, ?)',
          [item, relativePath, type, parentId, stats.mtime.toISOString(), stats.size]
        );
      }
      if (type === 'folder') {
        const newItem = await db.get('SELECT id FROM file_system WHERE path = ?', [relativePath]);
        await recursiveUpdate(fullPath, newItem.id);
      }
    }
  }
  await recursiveUpdate(folderPath, 1);
  
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
            'INSERT INTO file_system (name, path, type, parent_id, last_modified, size) VALUES (?, ?, ?, ?, ?, ?)',
            [item, relativePath, type, parentId, stats.mtime.toISOString(), stats.size]
        );
    }
    
}

async function initFilesDb() {
    console.log('正在初始化数据库...')
    await createRootRow();
    await updateDatabaseFromFolder(UPLOAD_DIR);
    console.log('数据库初始化完成')
}

export {
  deleteItem,
  renameItem,
  moveItem,
  createItem,
  getItemsInFolder,
  searchItems,
  updateDatabaseFromFolder,
  getItemById,
  initFilesDb
};
