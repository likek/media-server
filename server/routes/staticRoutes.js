import express from "express";
import { getFileById } from "../fileDbManager.js";
import path from "path";
import fs from "fs";
import { MEDIA_FULL_PATH, THUMB_FULL_PATH } from "../../serverConfig.js";
import { aesDecrypt } from "../utils/encrypt.js";

const router = express.Router();

// 基于ID的文件访问路由
router.get('/media/:id', async (req, res) => {
    try {
      const fileId = req.params.id;
      const fileInfo = await getFileById(fileId);
      
      if (!fileInfo || fileInfo.type !== 'file') {
        return res.status(404).send('File not found');
      }

      if (fileInfo.mime_type.startsWith('video/')) {
        // 对于视频文件，需要验证令牌
        return validateVideoToken(req, res, () => {
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

export function validateVideoToken(req, res, next) {
  const token = req.query.vt;
  const encryptedSalt = req.query.vs;
  
  // 如果没有提供令牌或盐，则继续（可能是未加密的请求）
  if (!token || !encryptedSalt) {
    return res.status(403).json({ message: '未提供访问令牌' });
  }
  
  try {
    // 解密盐
    let salt;
    try {
      salt = aesDecrypt(encryptedSalt);
      if (!salt) {
        return res.status(403).json({ message: '无效的加密盐' });
      }
    } catch (e) {
      console.error("解密盐出错: ", e);
      return res.status(403).json({ message: '无效的加密盐' });
    }
    
    // 解密令牌
    let decryptedToken;
    try {
      decryptedToken = aesDecrypt(token, salt);
      if (!decryptedToken) {
        return res.status(403).json({ message: '无效的访问令牌' });
      }
    } catch (e) {
      console.error("解密令牌出错: ", e);
      return res.status(403).json({ message: '无效的访问令牌' });
    }
    
    // 验证令牌格式（时间戳-随机字符串）
    const tokenParts = decryptedToken.split('-');
    if (tokenParts.length !== 2) {
      return res.status(403).json({ message: '令牌格式错误' });
    }
    
    // 获取令牌中的时间戳
    const timestamp = parseInt(tokenParts[0]);
    const now = Date.now();
    
    // 验证令牌是否过期（例如，30分钟有效期）
    const tokenValidity = 10 * 60 * 1000;
    if (now - timestamp > tokenValidity) {
      return res.status(403).json({ message: '令牌已过期' });
    }
    
    next();
  } catch (error) {
    console.error('视频令牌验证失败:', error);
    return res.status(403).json({ message: '令牌验证失败' });
  }
}