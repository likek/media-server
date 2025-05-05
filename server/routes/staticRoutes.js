import express from "express";
import { getFileById } from "../fileDbManager.js";
import path from "path";
import fs from "fs";
import { MEDIA_FULL_PATH, MEDIA_ROUTE, THUMB_FULL_PATH, THUMB_ROUTE } from "../../serverConfig.js";

const router = express.Router();

router.use(`${MEDIA_ROUTE}`, express.static(MEDIA_FULL_PATH));
router.use(`${THUMB_ROUTE}`, express.static(THUMB_FULL_PATH));

// 基于ID的文件访问路由
router.get('/media/:id', async (req, res) => {
    try {
      const fileId = req.params.id;
      const fileInfo = await getFileById(fileId);
      
      if (!fileInfo || fileInfo.type !== 'file') {
        return res.status(404).send('File not found');
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