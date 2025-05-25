import express from "express";
import { getFileById } from "../fileDbManager.js";
import path from "path";
import fs from "fs";
import { HLS_SOURCE_DIR, MEDIA_FULL_PATH, THUMB_FULL_PATH } from "../../serverConfig.js";
import { aesDecrypt, aesEncrypt } from "../utils/encrypt.js";
import { getUserIdByReq } from "../utils/index.js";

const router = express.Router();
const userId_audioTokenAndRangesMap_Map = new Map();

// /media/10119/240p/index.m3u8
// 多码率的ts片段 或 次级m3u8文件
router.get('/media/:id/:target/:m3u8file', (req, res) => {
  validateVideoToken(req, res, false, () => {
    const realM3u8file = req.params.m3u8file.replace(/\.7a1/, '.m3u8').replace(/\.9n4/, '.ts')
    const m3u8filePath = path.join(HLS_SOURCE_DIR, req.params.id, req.params.target, realM3u8file);
    if (fs.existsSync(m3u8filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=691200');
      if (realM3u8file.includes('.m3u8')) {
        // 处理次级m3u8文件
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        let m3u8Content = fs.readFileSync(m3u8filePath, 'utf8');
        m3u8Content = m3u8Content.split('\n').map(line => {
          if (line.trim().endsWith('.ts')) {
            // 避免重复添加参数
            if (!line.includes('?')) {
              return createEncryptedTsUrl(line, req.params.id); // Safari浏览器不支持前端videojs的请求拦截，只能后端来处理
            }
          }
          return line;
        }).join('\n');
        return res.send(m3u8Content);
      } else {
        // 处理次级ts片段
        res.setHeader('Content-Type', 'video/mp2t');
        return res.sendFile(m3u8filePath);
      }

    } else {
      res.status(404).send('Not found');
    }
  })
});

// ts片段请求,只有单码率的ts片段
router.get('/media/:id/:segment', (req, res) => {
  validateVideoToken(req, res, false, () => {
    const realSegment = req.params.segment.replace(/\.7a1/, '.m3u8').replace(/\.9n4/, '.ts')
    const segmentPath = path.join(HLS_SOURCE_DIR, req.params.id, realSegment);
    if (fs.existsSync(segmentPath)) {
      res.setHeader('Cache-Control', 'public, max-age=691200');
      res.type('.ts').sendFile(segmentPath);
    } else {
      res.status(404).send('Not found');
    }
  })
});

// 基于ID的文件访问路由
router.get('/media/:id', (req, res) => {
    try {
      const fileId = req.params.id;
      const fileInfo = getFileById(fileId);
      
      if (!fileInfo || fileInfo.type !== 'file') {
        return res.status(404).send('File not found');
      }
      res.setHeader('Cache-Control', 'public, max-age=691200');

      const isVideo = fileInfo.mime_type.startsWith('video/')
      if (isVideo) {
        // 对于视频文件，需要验证令牌
        // return validateVideoToken(req, res, !fileInfo.m3u8_path, () => {
        return validateVideoToken(req, res, false, () => {
          // 优先使用m3u8文件（如果存在）
          if (fileInfo.m3u8_path) {
            const m3u8FilePath = path.join(HLS_SOURCE_DIR, fileInfo.m3u8_path);
            if (fs.existsSync(m3u8FilePath)) {
              let m3u8Content = fs.readFileSync(m3u8FilePath, 'utf8');

              m3u8Content = m3u8Content.split('\n').map(line => {
                if (line.trim().endsWith('.m3u8') || line.trim().endsWith('.ts')) {
                  // 避免重复添加参数
                  if (!line.includes('?')) {
                    return createEncryptedTsUrl(line, fileId); // Safari浏览器不支持前端videojs的请求拦截，只能后端来处理
                  }
                }
                return line;
              }).join('\n');

              res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
              return res.send(m3u8Content);
            } else {
              console.log(`m3u8文件不存在: ${m3u8FilePath}`);
              return res.status(404).send('m3u8文件不存在');
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
    const fileInfo = getFileById(fileId);
    
    if (!fileInfo || fileInfo.type !== 'file') {
      return res.status(404).send('File not found');
    }
    
    // 对于视频文件，缩略图通常是文件名加.png
    const thumbnailPath = path.join(THUMB_FULL_PATH, fileInfo.path + '.png');
    res.setHeader('Cache-Control', 'public, max-age=691200');
    
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

function validateVideoToken(req, res, validateRanges, next) {
  const token = req.query.vt;
  const encryptedSalt = req.query.vs;

  if (!token || !encryptedSalt) {
    console.error('Invalid video token or salt:', token, encryptedSalt);
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
    if (tokenParts.length !== 2 || !/^\d+$/.test(tokenParts[0]) || !tokenParts[1].startsWith(`/media/${req.params.id}`)) {
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

    if (validateRanges) {
      const rangeHeader = req.headers.range;
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

    next();
  } catch (error) {
    console.error('视频令牌验证失败:', error);
    return res.status(403).json({ message: '请求失败' });
  }
}

export function createEncryptedTsUrl(line, fileId) {
  // 获取本周周一的00点时间戳
  const now = new Date();
  const day = now.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day; // 周日特殊处理为上周一
  const weekMonday = new Date(now);
  weekMonday.setDate(now.getDate() + diffToMonday);
  weekMonday.setHours(0, 0, 0, 0);
  const weekMondayTimestamp = weekMonday.getTime().toString().slice(2);

  // 获取加密指纹和盐
  //   const salt = `${Date.now().toString().slice(8)}${Math.random().toString(36).substring(2)}`
  const salt = `${weekMondayTimestamp}`
  const encryptedSalt = aesEncrypt(salt)

  const path = `/media/${fileId}/${line}`
  const token = `${weekMondayTimestamp}-${path}`;
  // console.log(`[video request] path: ${path}, token: ${token}, salt: ${salt}`)
  const encryptedToken = aesEncrypt(token, salt);

  // 构建URL，添加加密令牌和加密盐
  line = line.replace(/\.m3u8$/, '.7a1').replace(/\.ts$/, '.9n4')
  return `${line}?vt=${encodeURIComponent(encryptedToken)}&vs=${encodeURIComponent(encryptedSalt)}`;
}