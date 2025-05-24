import express from "express";
import path from "path";
import fs from "fs";
import ffmpeg from "fluent-ffmpeg";
import { getFileById } from "../fileDbManager.js";
import { MEDIA_FULL_PATH, HLS_SOURCE_DIR } from "../../serverConfig.js";
import db from "../dbserialize.js";

const router = express.Router();

// 创建HLS源文件夹
if (!fs.existsSync(HLS_SOURCE_DIR)) {
  fs.mkdirSync(HLS_SOURCE_DIR, { recursive: true });
}

/**
 * 将MP4文件转换为HLS格式
 * 接口入参是文件id
 * 转换成功后更新数据库中对应id的mp4文件的m3u8_path字段
 */
router.post("/convertToHls", (req, res) => {
  try {
    const { id } = req.body;
    
    if (!id) {
        console.error("文件ID是必需的");
        return res.status(400).json({ message: "文件ID是必需的" });
    }
    
    // 获取文件信息
    const fileInfo = getFileById(id);
    if (!fileInfo) {
        console.error("文件不存在", id);
        return res.status(404).json({ message: "文件不存在" });
    }
    
    // 检查文件是否为MP4
    if (!fileInfo.mime_type || !fileInfo.mime_type.includes("video/mp4")) {
        console.error("只支持MP4格式的视频文件转换", fileInfo.mime_type, fileInfo.filename);
        return res.status(400).json({ message: "只支持MP4格式的视频文件转换" });
    }
    
    // 检查是否已经转换过
    if (fileInfo.m3u8_path) {
        console.error("文件已经转换过", fileInfo.m3u8_path);
        return res.status(200).json({
            message: "文件已经转换过", 
            m3u8_path: fileInfo.m3u8_path,
            success: true
        });
    }

    const m3u8_path = `./${id}/index.m3u8`;
    
    // 创建HLS输出目录
    const hlsOutputDir = path.join(HLS_SOURCE_DIR, id.toString());
    if (!fs.existsSync(hlsOutputDir)) {
      fs.mkdirSync(hlsOutputDir, { recursive: true });
    }
    
    // 设置输入和输出路径
    const inputFilePath = path.join(MEDIA_FULL_PATH, fileInfo.path);
    const outputFilePath = path.join(hlsOutputDir, "index.m3u8");
    
    // 检查输入文件是否存在
    if (!fs.existsSync(inputFilePath)) {
        console.error("输入文件不存在", inputFilePath);
        return res.status(400).json({ message: "输入文件不存在" });
    }
    
    console.log(`开始转换文件(HLS): ${id}, ${inputFilePath}`);
    // 使用ffmpeg转换为HLS格式
    ffmpeg(inputFilePath)
      .outputOptions([
        "-c:v", "libx264", // 使用H.264编码
        "-crf", "23", "-preset", "medium", // 设置编码质量
        "-c:a", "aac", // 使用AAC音频编码
        "-hls_time", "6", // 每个分片的时长（秒）
        "-hls_list_size", "0", // 保留所有分片
        "-hls_segment_filename", path.join(hlsOutputDir, "segment_%03d.ts"), // 分片文件命名格式
        "-f", "hls" // 输出格式为HLS
      ])
      .output(outputFilePath)
      .on("end", async () => {
        // 更新数据库中的m3u8_path字段
        db.prepare(`UPDATE files SET m3u8_path = ? WHERE id = ?`).run(m3u8_path, id);
        console.log("转换完成", m3u8_path);
        res.json({
          message: "转换成功", 
          m3u8_path,
          success: true
        });
      })
      .on("error", (err) => {
        console.error("转换过程中出错:", err);
        res.status(500).json({ message: "转换失败", error: err.message });
      })
      .run();
  } catch (err) {
    console.error("转换请求处理出错:", err);
    res.status(500).json({ message: "服务器内部错误", error: err.message });
  }
});

export default router;