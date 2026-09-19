import db from "./dbserialize.js";
import { getUserIdByReq } from "./utils/index.js";
import { getHiddenMenuAccessState } from "./userManager.js";

const MAX_ANCESTOR_DEPTH = 50;

/**
 * Check if a folder is directly locked (has a record in folder_locks).
 */
const isLockedDirectly = (folderId) => {
  if (!folderId) return false;
  const row = db.prepare(`SELECT 1 FROM folder_locks WHERE folder_id = ?`).get(folderId);
  return Boolean(row);
};

/**
 * Walk up the parent_id chain to check if any ancestor folder is directly locked.
 * Returns the locked ancestor's folder_id, or null if none.
 */
const getLockedAncestorId = (fileId) => {
  if (!fileId) return null;
  let currentId = fileId;
  let depth = 0;

  while (currentId && depth < MAX_ANCESTOR_DEPTH) {
    const row = db.prepare(`SELECT parent_id FROM files WHERE id = ?`).get(currentId);
    if (!row || !row.parent_id) return null;

    const ancestorId = row.parent_id;
    const lockRow = db.prepare(`SELECT 1 FROM folder_locks WHERE folder_id = ?`).get(ancestorId);
    if (lockRow) return ancestorId;

    currentId = ancestorId;
    depth += 1;
  }

  return null;
};

/**
 * Check if a file/folder is locked — either directly (folders only) or via an ancestor.
 */
const isLocked = (fileId) => {
  if (!fileId) return false;
  // Check if this item itself is directly locked (only applies to folders)
  if (isLockedDirectly(fileId)) return true;
  // Check if any ancestor is locked
  return getLockedAncestorId(fileId) !== null;
};

/**
 * Batch-check lock status for a list of file IDs.
 * Returns a Map: id -> { locked: boolean, directlyLocked: boolean }
 */
const getLockedStatusMap = (fileIds) => {
  const result = new Map();
  if (!fileIds || fileIds.length === 0) return result;

  // Get all directly locked folder IDs in one query
  const placeholders = fileIds.map(() => "?").join(",");
  const directLockRows = db.prepare(
    `SELECT folder_id FROM folder_locks WHERE folder_id IN (${placeholders})`
  ).all(...fileIds);
  const directLockSet = new Set(directLockRows.map(r => r.folder_id));

  for (const id of fileIds) {
    const directlyLocked = directLockSet.has(id);
    let lockedByAncestor = false;

    if (!directlyLocked) {
      // Walk up parent chain
      let currentId = id;
      let depth = 0;
      while (currentId && depth < MAX_ANCESTOR_DEPTH) {
        const row = db.prepare(`SELECT parent_id FROM files WHERE id = ?`).get(currentId);
        if (!row || !row.parent_id) break;

        const ancestorId = row.parent_id;
        if (directLockSet.has(ancestorId)) {
          lockedByAncestor = true;
          break;
        }

        // Also check ancestors not in the initial set
        const lockRow = db.prepare(`SELECT 1 FROM folder_locks WHERE folder_id = ?`).get(ancestorId);
        if (lockRow) {
          lockedByAncestor = true;
          break;
        }

        currentId = ancestorId;
        depth += 1;
      }
    }

    result.set(id, {
      locked: directlyLocked || lockedByAncestor,
      directlyLocked
    });
  }

  return result;
};

/**
 * Determine if the current request is from an admin (backdoor-unlocked user).
 */
const isAdminReq = (req) => {
  const userId = getUserIdByReq(req);
  if (!userId) return false;
  const { canRenderHiddenMenus } = getHiddenMenuAccessState(userId);
  return Boolean(canRenderHiddenMenus);
};

/**
 * Lock a folder. Refuses if any ancestor is already locked.
 * Returns { success, message }.
 */
const lockFolder = (folderId, userId) => {
  if (!folderId) {
    return { success: false, message: "缺少文件夹ID" };
  }

  // Check if the folder exists and is a folder
  const folder = db.prepare(`SELECT id, type FROM files WHERE id = ?`).get(folderId);
  if (!folder) {
    return { success: false, message: "文件夹不存在" };
  }
  if (folder.type !== "folder") {
    return { success: false, message: "只能对文件夹上锁" };
  }

  // Check if already directly locked
  if (isLockedDirectly(folderId)) {
    return { success: false, message: "该文件夹已被上锁" };
  }

  // Check if any ancestor is locked — no double-locking
  const lockedAncestorId = getLockedAncestorId(folderId);
  if (lockedAncestorId) {
    return { success: false, message: "父文件夹已上锁，无需再次上锁" };
  }

  db.prepare(`INSERT INTO folder_locks (folder_id, locked_by) VALUES (?, ?)`).run(folderId, userId || null);
  return { success: true, message: "上锁成功" };
};

/**
 * Unlock a folder. Refuses if any ancestor is still locked (must unlock parent first).
 * Returns { success, message }.
 */
const unlockFolder = (folderId) => {
  if (!folderId) {
    return { success: false, message: "缺少文件夹ID" };
  }

  // Check if the folder exists
  const folder = db.prepare(`SELECT id, type FROM files WHERE id = ?`).get(folderId);
  if (!folder) {
    return { success: false, message: "文件夹不存在" };
  }

  // Check if this folder is directly locked
  if (!isLockedDirectly(folderId)) {
    // Maybe it's locked via an ancestor
    const lockedAncestorId = getLockedAncestorId(folderId);
    if (lockedAncestorId) {
      return { success: false, message: "父文件夹已上锁，请先解锁父文件夹", lockedAncestorId };
    }
    return { success: false, message: "该文件夹未被上锁" };
  }

  // Check if any ancestor is locked — must unlock parent first
  const lockedAncestorId = getLockedAncestorId(folderId);
  if (lockedAncestorId) {
    return { success: false, message: "父文件夹已上锁，请先解锁父文件夹", lockedAncestorId };
  }

  db.prepare(`DELETE FROM folder_locks WHERE folder_id = ?`).run(folderId);
  return { success: true, message: "解锁成功" };
};

/**
 * Strip a fileInfo object down to minimal fields for locked items shown to non-admin users.
 */
const stripLockedFields = (fileInfo) => {
  if (!fileInfo) return null;
  return {
    id: fileInfo.id,
    type: fileInfo.type,
    filename: fileInfo.filename,
    locked: true
  };
};

export {
  isLockedDirectly,
  getLockedAncestorId,
  isLocked,
  getLockedStatusMap,
  isAdminReq,
  lockFolder,
  unlockFolder,
  stripLockedFields
};
