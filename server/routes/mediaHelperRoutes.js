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
        const stmt = db.prepare(`SELECT * FROM files WHERE mime_type='video/mp4' AND m3u8_path IS NULL AND size< ORDER BY created_at DESC LIMIT ? OFFSET ?`);
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

async function convertMp4ToHls(id) {
  if (!id) {
    return { message: "文件ID是必需的", code: 400, success: false }
  }

  const fileInfo = getFileById(id)
  if (!fileInfo) {
    return { message: "文件不存在", code: 404, success: false }
  }

  if (!fileInfo.mime_type?.includes("video/mp4")) {
    return { message: "只支持MP4格式的视频文件转换", code: 400, success: false }
  }

  const inputFilePath = path.join(MEDIA_FULL_PATH, fileInfo.path)
  const outputBaseDir = path.join(HLS_SOURCE_DIR, id.toString())

  if (!fs.existsSync(inputFilePath)) {
    return { message: "输入文件不存在", code: 400, success: false }
  }

  if (fileInfo.m3u8_path && fs.existsSync(outputBaseDir)) {
    return {
      message: "文件已经转换过",
      code: 200,
      success: true,
      m3u8_path: fileInfo.m3u8_path
    }
  }

  let probeData
  try {
    probeData = await new Promise((res, rej) => {
      ffmpeg.ffprobe(inputFilePath, (err, metadata) => {
        if (err) return rej(err)
        res(metadata)
      })
    })
  } catch (err) {
    return { message: "解析视频元数据失败", code: 500, success: false }
  }

  const videoStream = probeData.streams.find(s => s.codec_type === 'video')
  const { width, height } = videoStream || {}
  if (!width || !height) {
    return { message: "未找到有效的视频流", code: 400, success: false }
  }

  fs.mkdirSync(outputBaseDir, { recursive: true })

  const qualities = [
    { name: "240p", width: 426, height: 240, bitrate: "300k", maxrate: "350k", bufsize: "600k" },
    { name: "360p", width: 640, height: 360, bitrate: "600k", maxrate: "700k", bufsize: "900k" },
    { name: "720p", width: 1280, height: 720, bitrate: "1800k", maxrate: "2000k", bufsize: "3000k" }
  ]

  const variants = []

  for (const q of qualities) {
    if (width < q.width || height < q.height) continue

    const variantDir = path.join(outputBaseDir, q.name)
    fs.mkdirSync(variantDir, { recursive: true })

    const outputPath = path.join(variantDir, 'index.m3u8')

    try {
      console.log(`[${new Date().toLocaleString()}] 开始转换 ${id}/${q.name}`)

      await new Promise((res, rej) => {
        ffmpeg(inputFilePath)
          .outputOptions([
            '-vf', `scale=w=${q.width}:h=${q.height}:force_original_aspect_ratio=decrease:force_divisible_by=2`,
            '-c:v', 'libx264',
            '-b:v', q.bitrate,
            '-maxrate', q.maxrate,
            '-bufsize', q.bufsize,
            '-c:a', 'aac',
            '-b:a', '96k',
            '-hls_time', '6',
            '-hls_list_size', '0',
            '-hls_segment_filename', path.join(variantDir, 'segment_%03d.ts'),
            '-f', 'hls'
          ])
          .output(outputPath)
          .on('end', res)
          .on('error', rej)
          .run()
      })

      console.log(`[${new Date().toLocaleString()}] 转换完成 ${id}/${q.name}`)

      variants.push({
        path: `${id}/${q.name}/index.m3u8`,
        resolution: `${q.width}x${q.height}`,
        bandwidth: parseInt(q.bitrate) * 8
      })

    } catch (err) {
      console.error(`转换 ${id}/${q.name} 失败`, err)
      return { message: `转换 ${id}/${q.name} 失败`, code: 500, success: false }
    }
  }

  // 生成主 index.m3u8 文件
  const masterM3U8Path = path.join(outputBaseDir, 'index.m3u8')
  const masterContent = ['#EXTM3U']
    .concat(variants.map(v => `#EXT-X-STREAM-INF:BANDWIDTH=${v.bandwidth},RESOLUTION=${v.resolution}\n${v.path}`))
    .join('\n')

  fs.writeFileSync(masterM3U8Path, masterContent)

  db.prepare(`UPDATE files SET m3u8_path = ? WHERE id = ?`).run(`./${id}/index.m3u8`, id)

  return { message: "转换成功", code: 200, success: true, m3u8_path: `./${id}/index.m3u8` }
}

export default router;