import express from "express";
import { getFileById } from "../fileDbManager.js";
import path from "path";
import fs from "fs";
import { HLS_SOURCE_DIR, MEDIA_FULL_PATH, THUMB_FULL_PATH } from "../../serverConfig.js";
import { aesDecrypt } from "../utils/encrypt.js";
import { getUserIdByReq } from "../utils/index.js";

const router = express.Router();
const userId_audioTokenAndRangesMap_Map = new Map();

// ts片段请求
router.get('/media/:id/:segment', (req, res) => {
  const segmentPath = path.join(HLS_SOURCE_DIR, req.params.id, req.params.segment);
  if (fs.existsSync(segmentPath)) {
    res.type('.ts').sendFile(segmentPath);
  } else {
    res.status(404).send('Not found');
  }
});

// 基于ID的文件访问路由
router.get('/media/:id', (req, res) => {
    try {
      const fileId = req.params.id;
      const fileInfo = getFileById(fileId);
      
      if (!fileInfo || fileInfo.type !== 'file') {
        return res.status(404).send('File not found');
      }

      if (fileInfo.mime_type.startsWith('video/')) {
        // 对于视频文件，需要验证令牌
        return validateVideoToken(req, res, fileInfo.m3u8_path, () => {
          // 优先使用m3u8文件（如果存在）
          if (fileInfo.m3u8_path) {
            const m3u8FilePath = path.join(HLS_SOURCE_DIR, fileInfo.m3u8_path);
            if (fs.existsSync(m3u8FilePath)) {
              return res.sendFile(m3u8FilePath);
            } else {
              console.log(`m3u8文件不存在: ${m3u8FilePath}`);
            }
          }
          // 如果m3u8文件不存在，回退到原始MP4文件
          const filePath = path.join(MEDIA_FULL_PATH, fileInfo.path);
          res.sendFile(filePath);
        });
      }
      
      const filePath = path.join(MEDIA_FULL_PATH, fileInfo.path);
      res.sendFile(filePath);
    } catch (err) {
      console.error('Error serving file by ID:', err);
      res.status(500).send('Server error');
    }
});

// 基于ID的缩略图访问路由
router.get('/thumbnail/:id', async (req, res) => {
  try {
    const fileId = req.params.id;
    const fileInfo = await getFileById(fileId);
    
    if (!fileInfo || fileInfo.type !== 'file') {
      return res.status(404).send('File not found');
    }
    
    // 对于视频文件，缩略图通常是文件名加.png
    const thumbnailPath = path.join(THUMB_FULL_PATH, fileInfo.path + '.png');
    
    // 检查缩略图是否存在
    if (fs.existsSync(thumbnailPath)) {
      return res.sendFile(thumbnailPath);
    }
    
    // 如果缩略图不存在，返回404
    res.status(404).send('Thumbnail not found');
  } catch (err) {
    console.error('Error serving thumbnail by ID:', err);
    res.status(500).send('Server error');
  }
});

export default router;

function validateVideoToken(req, res, m3u8_path, next) {
  const token = req.query.vt;
  const encryptedSalt = req.query.vs;
  const rangeHeader = req.headers.range;

  if (!token || !encryptedSalt) {
    console.error('Invalid video token or salt:', token, encryptedSalt, rangeHeader);
    return res.status(403).json({ message: '请求失败' });
  }

  try {
    let salt;
    try {
      salt = aesDecrypt(encryptedSalt);
      if (!salt) {
        console.error('Failed to decrypt salt:', e);
        return res.status(403).json({ message: '非法请求' });
      }
    } catch (e) {
      console.error("解密盐出错: ", e);
      return res.status(403).json({ message: '非法请求' });
    }

    let decryptedToken;
    try {
      decryptedToken = aesDecrypt(token, salt);
      if (!decryptedToken) {
        console.error('Failed to decrypt token:', e);
        return res.status(403).json({ message: '非法请求' });
      }
    } catch (e) {
      console.error("解密令牌出错: ", e);
      return res.status(403).json({ message: '非法请求' });
    }

    const tokenParts = decryptedToken.split('-');
    if (tokenParts.length !== 2) {
      console.error('Invalid token format:', decryptedToken);
      return res.status(403).json({ message: '非法请求' });
    }

    const userId = getUserIdByReq(req);
    if (!userId) {
      console.error('User ID not found in request');
      return res.status(403).json({ message: '请求失败' });
    }

    // 初始化结构
    if (!userId_audioTokenAndRangesMap_Map.has(userId)) {
      userId_audioTokenAndRangesMap_Map.set(userId, new Map());
    }

    if (m3u8_path) {
      const audioTokenAndRangesMap = userId_audioTokenAndRangesMap_Map.get(userId);
      if (audioTokenAndRangesMap.has(decryptedToken)) {
        // 403,m3u8不能重复使用相同token
        console.warn('m3u8不能重复使用相同token', userId, decryptedToken);
        res.status(403).json({ message: '请求失败' });
        return
      }
      audioTokenAndRangesMap.set(decryptedToken, new Set());
    } else {
      const audioTokenAndRangesMap = userId_audioTokenAndRangesMap_Map.get(userId);
      if (!audioTokenAndRangesMap.has(decryptedToken)) {
        audioTokenAndRangesMap.set(decryptedToken, new Set());
      }
      const usedRanges = audioTokenAndRangesMap.get(decryptedToken);
      // 如果客户端未发送 Range，不允许通过
      if (!rangeHeader) {
        const url = new URL(req.url, `http://${req.headers.host}`)
        console.warn(`[${new Date().toLocaleString()}] userId ${userId} pathname ${ url.pathname } Token ${decryptedToken} has no range`);
        res.status(403).json({ message: '请求失败' });
        return;
      }

      if (usedRanges.has(rangeHeader)) {
        const url = new URL(req.url, `http://${req.headers.host}`)
        console.warn(`[${new Date().toLocaleString()}] userId ${userId} pathname ${ url.pathname } Token ${decryptedToken} has already used range: ${rangeHeader}, all ranges: ${Array.from(usedRanges).join(',')}`);
        return res.status(403).json({ message: '请求失败' });
      }
      usedRanges.add(rangeHeader);
      
      // 如果有range头，仍然记录它，但不进行验证
      if (rangeHeader) {
        usedRanges.add(rangeHeader);
      }
    }

    // res.setHeader('Cache-Control', 'no-store');
    // res.setHeader('Pragma', 'no-cache');
    // res.setHeader('Expires', '0');

    next();
  } catch (error) {
    console.error('视频令牌验证失败:', error);
    return res.status(403).json({ message: '请求失败' });
  }
}