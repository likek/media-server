import express from "express";
import path from "path";
import fs from "fs";
import ffmpeg from "fluent-ffmpeg";
import { getFileById } from "../fileDbManager.js";
import { MEDIA_FULL_PATH, HLS_SOURCE_DIR } from "../../serverConfig.js";
import db from "../dbserialize.js";

const router = express.Router();

const convertList = new Set(); // 正在转换的文件id列表

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
    if (convertList.has(id)) {
        console.error("文件正在转换中", id);
        res.status(400).json({ message: "文件正在转换中", success: false });
        return;
    }
    convertList.add(id);
    convertMp4ToHls(id).then(result => {
        if (result.success) {
            res.json({
                message: "转换成功",
                m3u8_path: result.m3u8_path,
                success: true
            })
        } else {
            res.status(result.code).json({ message: result.message, success: false })
        }
    }).catch(err => {
        console.error("转换请求处理出错:", err);
        res.status(500).json({ message: "服务器内部错误", error: err.message });
    }).finally(() => {
        convertList.delete(id);
    });
  } catch (err) {
    console.error("转换请求处理出错:", err);
    res.status(500).json({ message: "服务器内部错误", error: err.message });
    convertList.delete(id);
  }
});

/**
 * 查找files表中所有没有m3u8_path的mp4文件，全部进行转换
 * @returns 
 */
router.post("/convertToHlsBatch", async (req, res) => {
    try {
        const page  = req.body.page || 1;
        const pageSize = req.body.pageSize || 10;
        // 优先处理最新的(created_at)的文件
        const stmt = db.prepare(`SELECT * FROM files WHERE mime_type='video/mp4' AND m3u8_path IS NULL ORDER BY created_at DESC LIMIT ? OFFSET ?`);
        const offset = (page - 1) * pageSize;
        const rows = stmt.all(pageSize, offset);

        if (rows.length === 0) {
            res.json({
                message: "没有需要转换的文件",
                success: true
            })
            return;
        }
        let total = rows.length;
        let successCount = 0;
        let failCount = 0;
        let failList = [];
        for (const row of rows) {
            if (convertList.has(row.id)) {
                console.error("文件正在转换中", row.id);
                failCount++;
                failList.push({
                    id: row.id,
                    message: "文件正在转换中",
                    error: "文件正在转换中"
                })
                total--;
                continue;
            }
            convertList.add(row.id);
            await convertMp4ToHls(row.id).then(result => {
                if (result.success) {
                    successCount++;
                } else {
                    failCount++;
                    failList.push({
                        id: row.id,
                        message: result.message,
                        error: result.error
                    })
                }
                if (total === 0) {
                    res.json({
                        message: "转换完成",
                        success: true,
                        successCount,
                        failCount,
                        failList
                    })
                }
            }).catch(err => {
                console.error("转换请求处理出错:", err);
            }).finally(() => {
                total--;
                convertList.delete(row.id);
            })
        }
    } catch (err) {
        console.error("转换请求处理出错:", err);
        res.status(500).json({ message: "服务器内部错误", error: err.message });
    }
})


function convertMp4ToHls(id) {
    return new Promise((resolve, reject) => {
        if (!id) {
            console.error("文件ID是必需的");
            resolve({
                message: "文件ID是必需的",
                code: 400,
                success: false
            })
            return;
        }
        
        // 获取文件信息
        const fileInfo = getFileById(id);
        if (!fileInfo) {
            console.error("文件不存在", id);
            resolve({
                message: "文件不存在",
                code: 404,
                success: false
            })
            return;
        }
        
        // 检查文件是否为MP4
        if (!fileInfo.mime_type || !fileInfo.mime_type.includes("video/mp4")) {
            console.error("只支持MP4格式的视频文件转换", fileInfo.mime_type, fileInfo.filename);
            resolve({
                message: "只支持MP4格式的视频文件转换",
                code: 400,
                success: false
            })
            return;
        }
        
        // 检查是否已经转换过
        if (fileInfo.m3u8_path) {
            console.error("文件已经转换过", fileInfo.m3u8_path);
            resolve({
                message: "文件已经转换过",
                code: 200,
                success: true,
                m3u8_path: fileInfo.m3u8_path
            })
            return;
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
            resolve({
                message: "输入文件不存在",
                code: 400,
                success: false
            })
            return;
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
                resolve({
                    message: "转换成功", 
                    m3u8_path,
                    code: 200,
                    success: true
                })
            })
            .on("error", (err) => {
                console.error("转换过程中出错:", err);
                resolve({
                    message: "转换失败",
                    code: 500,
                    success: false,
                    error: err.message
                })
            })
            .run();
    })
}

export default router;