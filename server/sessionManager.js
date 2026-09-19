import crypto from "crypto";
import db from "./dbserialize.js";
import { aesEncrypt, aesDecrypt } from "./utils/encrypt.js";

const SESSION_MAX_AGE_DAYS = 30;

// Cookie 键名混淆映射（防止 DevTools 中一眼看出用途）：
// _a = 加密指纹 (原 "fp")
// _b = 加密 salt (原 "s")
// _c = session token (原 "session")，值用 salt 加密，与 salt 密码学绑定
const FP_COOKIE_NAME = "_a";
const SALT_COOKIE_NAME = "_b";
const SESSION_COOKIE_NAME = "_c";

/**
 * Generate a random session token (UUID + random bytes for extra entropy).
 */
const generateSessionToken = () => {
  return `${crypto.randomUUID()}-${crypto.randomBytes(16).toString("hex")}`;
};

/**
 * 解密 session token（cookie 中的加密值 → 明文 token）
 * salt 是解密的前置条件 —— 没有 salt 无法解密，也无法查 DB。
 */
const decryptSessionToken = (encryptedToken, salt) => {
  if (!encryptedToken || !salt) return null;
  try {
    return aesDecrypt(encryptedToken, salt);
  } catch (e) {
    return null;
  }
};

/**
 * Get the userId associated with a session token.
 * 接收的是加密后的 token（cookie 原值），需先用 salt 解密再查 DB。
 * salt 为必填 —— 无 salt 直接返回 null（密码学绑定，无法跳过）。
 * - ip: prevents cross-network token theft
 * - salt: 密码学绑定 + DB 校验，双重防护
 * Returns null if token is invalid, expired, IP mismatch, or salt mismatch.
 */
const getSessionUserId = (encryptedToken, ip, salt) => {
  if (!encryptedToken || !salt) return null;
  try {
    const token = decryptSessionToken(encryptedToken, salt);
    if (!token) return null;

    const conditions = ["token = ?", "(expires_at IS NULL OR expires_at > datetime('now'))"];
    const params = [token];

    if (ip) {
      conditions.push("ip = ?");
      params.push(ip);
    }
    conditions.push("salt = ?");
    params.push(salt);

    const row = db.prepare(`
      SELECT user_id FROM sessions
      WHERE ${conditions.join(" AND ")}
    `).get(...params);

    return row?.user_id || null;
  } catch (e) {
    return null;
  }
};

/**
 * Create a new session for a user, bound to the given IP and salt.
 * DB 存明文 token，返回加密后的 token（用 salt 加密）供 cookie 使用。
 * Returns { token: encryptedToken, expiresAt }.
 */
const createSession = (userId, ip, salt) => {
  const token = generateSessionToken();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_MAX_AGE_DAYS);

  db.prepare(`
    INSERT INTO sessions (token, user_id, ip, salt, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(token, userId, ip || null, salt || null, new Date().toISOString(), expiresAt.toISOString());

  // 返回加密后的 token，直接用于 cookie
  const encryptedToken = salt ? aesEncrypt(token, salt) : token;
  return { token: encryptedToken, expiresAt };
};

/**
 * Refresh an existing session's expiration time.
 * 接收加密后的 token + salt，先解密再更新 DB。
 * Returns the new expiration date, or null if session doesn't exist.
 */
const refreshSession = (encryptedToken, salt) => {
  if (!encryptedToken || !salt) return null;
  try {
    const token = decryptSessionToken(encryptedToken, salt);
    if (!token) return null;

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + SESSION_MAX_AGE_DAYS);

    const result = db.prepare(`
      UPDATE sessions SET expires_at = ? WHERE token = ?
    `).run(expiresAt.toISOString(), token);

    return result.changes > 0 ? expiresAt : null;
  } catch (e) {
    return null;
  }
};

/**
 * Delete all expired sessions. Called periodically to keep the table clean.
 */
const cleanupExpiredSessions = () => {
  db.prepare(`DELETE FROM sessions WHERE expires_at < datetime('now')`).run();
};

/**
 * Delete all sessions for a user (revoke all their tokens).
 */
const revokeUserSessions = (userId) => {
  db.prepare(`DELETE FROM sessions WHERE user_id = ?`).run(userId);
};

export {
  SESSION_MAX_AGE_DAYS,
  FP_COOKIE_NAME,
  SALT_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  generateSessionToken,
  decryptSessionToken,
  getSessionUserId,
  createSession,
  refreshSession,
  cleanupExpiredSessions,
  revokeUserSessions,
};
