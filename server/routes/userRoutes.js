import chalk from "chalk";
import express from "express";
import fs from "fs";
import path from "path";
import ffmpeg from "fluent-ffmpeg";
import extract from "extract-zip";
import readline from "readline";
import multer from "multer";
import { updateFolderByPath, updateFolderTreeByPath, checkFilesTreeByPath, cleanDbTreeByPath, getFolderContentsById, getFileById, getFileByPath, setFolderCoverByFileId, deleteFileById, renameFileById, moveFileById, initRootDirectory } from "../fileDbManager.js";
import { MEDIA_FULL_PATH, THUMB_FULL_PATH, TEMP_FULL_PATH } from "../../serverConfig.js";
import { wsBroadcastMessage } from "../websocketManager.js";
import { convertTxtEncoding } from "../tools/textFileTools.js";
import { tryRegister } from "../userManager.js";
import { downloadAllMediaByLinks } from "../downloadManager.js";
import { get51PageInfo, generateThumbnail } from "../utils/index.js";
import { computeDHashFromBuffer, computeDHashFromFile, hammingDistanceHex64 } from "../utils/imageHash.js";
import { computeClipEmbeddingFromFile, IMAGE_EMBEDDING_MODEL_ID } from "../utils/imageEmbedding.js";
import { validateFingerprint } from "../middleware/fingerprintValidator.js";
import db from "../dbserialize.js";

const router = express.Router();
// 配置 multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const currentPath = req.query.path || "";
    const uploadPath = path.join(MEDIA_FULL_PATH, currentPath);

    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }

    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const filename = Buffer.from(file.originalname, "latin1").toString("utf-8");
    const info = path.parse(filename);
    cb(null, `${info.name}(${Date.now()})${info.ext}`);
  },
});

const upload = multer({ storage });
const searchUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

const upsertImageDHash = (fileId, dhash) => {
  db.prepare(
    `
      INSERT INTO image_features (file_id, dhash, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(file_id) DO UPDATE SET
        dhash = excluded.dhash,
        updated_at = CURRENT_TIMESTAMP
    `
  ).run(fileId, dhash);
};

const upsertImageEmbedding = (fileId, model, dim, vector) => {
  const buffer = Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength);
  db.prepare(
    `
      INSERT INTO image_embeddings (file_id, model, dim, vector, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(file_id) DO UPDATE SET
        model = excluded.model,
        dim = excluded.dim,
        vector = excluded.vector,
        updated_at = CURRENT_TIMESTAMP
    `
  ).run(fileId, model, dim, buffer);
};

router.post("/register", validateFingerprint, async (req, res) => {
  try {
    await tryRegister(req, res);
    res.send({ success: true, message: "注册成功" });
  } catch (error) {
    console.error("注册失败:", error);
    res.status(500).json({ success: false, message: "请求失败" });
  }
});

router.post("/downloadFromText", async (req, res) => { 
  const folderId = req.body.folderId;
  let folderPath = "";
  const folderInfo = getFileById(folderId);
  if (folderInfo) {
    folderPath = folderInfo.path;
  }
  let downloadRootAll = folderPath;
  let downloadSubAll = [];
  const folder = folderPath;
  let text = (req.body.text || "").trim();
  const successItemCb = data => {
    // 单个文件下载成功，通知前端下载进度
    wsBroadcastMessage(
      {
        event: "downloadProgress",
        data
      },
      req,
      true
    );
  }

  const failedCb = (e, pageUrl) => {
    const { code, msg, ignoreLinks } = e
    // 失败
    console.error(chalk.red('下载出错:'), e, pageUrl);
    return res.status(code || 400).json({ error: msg || e, ignoreLinks: ignoreLinks || [] });
  }

  const reg = /^\W*51[:：]\W*/
  if (reg.test(text)) {
    let completedCountAll = 0;
    let ignoreLinksAll = []
    let failedLinksAll = [];
    text = text.replace(reg, '')
    const pageUrlList = text.split('\n')
    const batchTime = new Date().toLocaleTimeString()
    const total = pageUrlList.length
    for (let i = 0; i < total; i++) {
      const pageUrl = pageUrlList[i].trim()
      const processLog = `[${i + 1}/${total}_${batchTime}]`
      let pageInfo;
      try {
        pageInfo = await get51PageInfo(pageUrl);
      } catch(e) {
        console.warn(chalk.red(`${processLog}获取页面信息出错:`), e, pageUrl)
        continue
      }
      const title = pageInfo.title
      const inputText = [...pageInfo.imgLinks, ...pageInfo.videoLinks].join('\n')
      const targetFolder = `${folder}/${title}`;

      const row = db.prepare(`SELECT 1 AS found FROM files WHERE name = ? LIMIT 1`).get(title);
      if (row?.found) {
        console.warn(chalk.yellow(`\n${processLog}目标文件夹已存在, 跳过下载: ${targetFolder}`), pageUrl);
        continue;
      }

      let result;
      try {
        console.log(`${processLog}开始下载页面内所有链接`)
        result = await downloadAllMediaByLinks(inputText, targetFolder, successItemCb, processLog)
      } catch(e) {
        failedCb(e, pageUrl)
        continue
      }
      console.log(chalk.green(`${processLog}页面内所有链接下载完成`))
      // 当前页面 所有文件下载成功
      const { downloadRoot, downloadSub, completedCount, ignoreLinks, failedLinks } = result
      await updateFolderByPath(`${downloadRoot}/${downloadSub}`); // 更新数据库
      if (downloadSub.indexOf('/') !== -1) {
        await updateFolderByPath(downloadSub.substring(0, downloadSub.lastIndexOf('/'))); // 更新数据库
      }
      downloadRootAll = downloadRoot
      downloadSubAll.push(downloadSub)
      completedCountAll += completedCount
      ignoreLinksAll = ignoreLinksAll.concat(ignoreLinks)
      failedLinksAll = failedLinksAll.concat(failedLinks)
    }

    const downloadRoot = downloadRootAll
    const downloadSub = downloadSubAll[0]
    // 所有页面，所有文件下载成功
    await updateFolderByPath(downloadRoot);
    res.json({
      failedLinks: failedLinksAll,
      successCount: completedCountAll - failedLinksAll.length,
      downloadRoot,
      downloadSub,
      ignoreLinks: ignoreLinksAll,
    });

    return
  }
  
  let result;
  try {
    result = await downloadAllMediaByLinks(text, folder, successItemCb)
  } catch(e) {
    failedCb(e, text)
    return
  }
  // 所有文件下载成功
  const { downloadRoot, downloadSub, completedCount, ignoreLinks, failedLinks } = result
  await updateFolderByPath(downloadRoot);
  await updateFolderByPath(`${downloadRoot}/${downloadSub}`); // 更新数据库
  if (downloadSub.indexOf('/') !== -1) {
    await updateFolderByPath(downloadSub.substring(0, downloadSub.lastIndexOf('/'))); // 更新数据库
  }

  res.json({
    failedLinks,
    successCount: completedCount - failedLinks.length,
    downloadRoot,
    downloadSub,
    ignoreLinks,
  });
});

// 上传文件并生成缩略图
router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    const parentId = req.query.parentId;
    
    // 获取父文件夹路径
    const parentInfo = parentId ? getFileById(parentId) : null;
    if (parentId && (!parentInfo || parentInfo.type !== 'folder')) {
      return res.status(404).send({ message: "Parent folder not found" });
    }
    const folderPath = parentInfo ? parentInfo.path : "";
    
    const filename = Buffer.from(req.file.filename, "latin1").toString("utf-8");
    const filePath = path.join(MEDIA_FULL_PATH, folderPath, filename);

    // 确保缩略图目录存在
    const thumbnailDir = path.join(THUMB_FULL_PATH, folderPath);
    if (!fs.existsSync(thumbnailDir)) {
      fs.mkdirSync(thumbnailDir, { recursive: true });
    }

    // 如果是视频文件，生成缩略图
    if (req.file.mimetype.startsWith("video/")) {
      const thumbnailPath = path.join(thumbnailDir, filename + ".png");
      try {
        await generateThumbnail(filePath, thumbnailPath);
        await updateFolderByPath(folderPath); // 更新数据库
        
        // 获取新创建的文件信息
        const fileInfo = getFileByPath(path.join(folderPath, filename));

        if (fileInfo) {
          void (async () => {
            try {
              const dhash = await computeDHashFromFile(thumbnailPath);
              upsertImageDHash(fileInfo.id, dhash);
            } catch (e) {
              console.error("Error computing dhash:", e);
            }
            try {
              const { modelId, dim, vector } = await computeClipEmbeddingFromFile(thumbnailPath);
              upsertImageEmbedding(fileInfo.id, modelId, dim, vector);
            } catch (e) {
              console.error("Error computing embedding:", e);
            }
          })();
        }
        
        res.send({
          id: fileInfo ? fileInfo.id : null,
          filename: filename,
          thumbnail: folderPath + "/" + filename + ".png",
        });
      } catch (err) {
        console.error("Error generating thumbnail:", err);
        await updateFolderByPath(folderPath);
        const fileInfo = getFileByPath(path.join(folderPath, filename));
        res.send({
          id: fileInfo ? fileInfo.id : null,
          filename: filename,
        });
      }
    } else {
      await updateFolderByPath(folderPath); // 更新数据库
      
      // 获取新创建的文件信息
      const fileInfo = getFileByPath(path.join(folderPath, filename));

      if (fileInfo && req.file.mimetype.startsWith("image/")) {
        void (async () => {
          try {
            const dhash = await computeDHashFromFile(filePath);
            upsertImageDHash(fileInfo.id, dhash);
          } catch (e) {
            console.error("Error computing dhash:", e);
          }
          try {
            const { modelId, dim, vector } = await computeClipEmbeddingFromFile(filePath);
            upsertImageEmbedding(fileInfo.id, modelId, dim, vector);
          } catch (e) {
            console.error("Error computing embedding:", e);
          }
        })();
      }
      
      res.send({
        id: fileInfo ? fileInfo.id : null,
        filename: folderPath + "/" + filename
      });
    }
  } catch (err) {
    console.error("Error uploading file:", err);
    res.status(500).send({ message: "Failed to upload file" });
  }
});

router.post("/searchByImage", searchUpload.single("file"), async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).send({ message: "file must be provided" });
    }

    await initRootDirectory(req);

    const folderIdRaw = req.body.folderId;
    const folderId = folderIdRaw === undefined || folderIdRaw === null || folderIdRaw === "" ? null : Number(folderIdRaw);
    const topKRaw = req.body.topK;
    const topK = Math.min(Math.max(Number(topKRaw || 50), 1), 200);
    const mode = (req.body.mode || "semantic").toString();

    const folderInfo = folderId ? getFileById(folderId) : null;
    if (folderId && (!folderInfo || folderInfo.type !== "folder")) {
      return res.status(404).send({ message: "Folder not found" });
    }

    if (mode !== "hash") {
      try {
        fs.mkdirSync(TEMP_FULL_PATH, { recursive: true });
        const tempName = `img_search_${Date.now()}_${Math.random().toString(36).slice(2)}.bin`;
        const tempPath = path.join(TEMP_FULL_PATH, tempName);
        await fs.promises.writeFile(tempPath, req.file.buffer);
        const { modelId, dim, vector } = await computeClipEmbeddingFromFile(tempPath);
        await fs.promises.unlink(tempPath).catch(() => {});

        const candidates = [];
        let minScore = Infinity;
        let minIndex = -1;
        const updateMin = () => {
          let m = Infinity;
          let mi = -1;
          for (let i = 0; i < candidates.length; i++) {
            if (candidates[i].score < m) {
              m = candidates[i].score;
              mi = i;
            }
          }
          minScore = m;
          minIndex = mi;
        };

        let stmt;
        if (folderInfo && folderInfo.path) {
          stmt = db.prepare(
            `
              SELECT f.id, f.name, f.type, f.parent_id, f.size, f.last_modified, f.mime_type, f.m3u8_path, f.thumbnail, e.dim AS dim, e.vector AS vector
              FROM image_embeddings e
              JOIN files f ON f.id = e.file_id
              WHERE f.type = 'file'
                AND e.model = ?
                AND (f.path = ? OR f.path LIKE ?)
            `
          );
        } else {
          stmt = db.prepare(
            `
              SELECT f.id, f.name, f.type, f.parent_id, f.size, f.last_modified, f.mime_type, f.m3u8_path, f.thumbnail, e.dim AS dim, e.vector AS vector
              FROM image_embeddings e
              JOIN files f ON f.id = e.file_id
              WHERE f.type = 'file'
                AND e.model = ?
            `
          );
        }

        const iter = folderInfo && folderInfo.path
          ? stmt.iterate(modelId, folderInfo.path, `${folderInfo.path}/%`)
          : stmt.iterate(modelId);

        for (const row of iter) {
          if (!row.vector) continue;
          if (Number(row.dim) !== dim) continue;
          const v = new Float32Array(row.vector.buffer, row.vector.byteOffset, dim);
          let score = 0;
          for (let i = 0; i < dim; i++) score += vector[i] * v[i];

          if (candidates.length < topK) {
            candidates.push({ row, score });
            if (candidates.length === topK) updateMin();
          } else if (score > minScore) {
            candidates[minIndex] = { row, score };
            updateMin();
          }
        }

        if (candidates.length > 0) {
          candidates.sort((a, b) => b.score - a.score);
          res.send({
            mode: "semantic",
            model: modelId,
            files: candidates.map((x) => ({
              id: x.row.id,
              type: x.row.type,
              filename: x.row.name,
              lastModified: x.row.last_modified,
              size: x.row.size,
              parent_id: x.row.parent_id,
              favorited: false,
              m3u8_path: x.row.m3u8_path,
              mime_type: x.row.mime_type,
              thumbnail: x.row.thumbnail,
              similarity: x.score,
            })),
            total: candidates.length,
          });
          return;
        }
      } catch (e) {
        console.error("Semantic search failed:", e);
      }
    }

    const queryHash = await computeDHashFromBuffer(req.file.buffer);

    let rows;
    if (folderInfo && folderInfo.path) {
      rows = db.prepare(
        `
          SELECT f.id, f.name, f.type, f.parent_id, f.size, f.last_modified, f.mime_type, f.thumbnail, f.m3u8_path, f.path, i.dhash
          FROM image_features i
          JOIN files f ON f.id = i.file_id
          WHERE f.type = 'file'
            AND (f.path = ? OR f.path LIKE ?)
        `
      ).all(folderInfo.path, `${folderInfo.path}/%`);
    } else {
      rows = db.prepare(
        `
          SELECT f.id, f.name, f.type, f.parent_id, f.size, f.last_modified, f.mime_type, f.thumbnail, f.m3u8_path, f.path, i.dhash
          FROM image_features i
          JOIN files f ON f.id = i.file_id
          WHERE f.type = 'file'
        `
      ).all();
    }

    const ranked = rows
      .map((row) => {
        const distance = hammingDistanceHex64(queryHash, row.dhash);
        const score = 1 - distance / 64;
        return {
          file: {
            id: row.id,
            type: row.type,
            filename: row.name,
            lastModified: row.last_modified,
            size: row.size,
            parent_id: row.parent_id,
            favorited: false,
            m3u8_path: row.m3u8_path,
            mime_type: row.mime_type,
          },
          distance,
          score,
        };
      })
      .sort((a, b) => a.distance - b.distance || b.score - a.score)
      .slice(0, topK);

    res.send({
      mode: "hash",
      queryHash,
      files: ranked.map((x) => ({ ...x.file, similarity: x.score, distance: x.distance })),
      total: ranked.length,
    });
  } catch (err) {
    console.error("Error searching by image:", err);
    res.status(500).send({ message: "Failed to search by image" });
  }
});

router.post("/rebuildImageHash", async (req, res) => {
  try {
    await initRootDirectory(req);

    const maxRaw = req.body.max;
    const max = Math.min(Math.max(Number(maxRaw || 200), 1), 2000);
    const logIntervalRaw = req.body.log_interval;
    const logInterval = Math.min(Math.max(Number(logIntervalRaw || 10), 1), 100);

    const rows = db.prepare(
      `
        SELECT f.id, f.path, f.mime_type, f.thumbnail, i.file_id AS has_hash, e.file_id AS has_embed
        FROM files f
        LEFT JOIN image_features i ON i.file_id = f.id
        LEFT JOIN image_embeddings e ON e.file_id = f.id AND e.model = ?
        WHERE f.type = 'file'
          AND (
            f.mime_type LIKE 'image/%'
            OR (f.mime_type LIKE 'video/%' AND f.thumbnail IS NOT NULL)
          )
          AND (i.file_id IS NULL OR e.file_id IS NULL)
        ORDER BY f.id DESC
        LIMIT ?
      `
    ).all(IMAGE_EMBEDDING_MODEL_ID, max);

    const notify = (data) => {
      wsBroadcastMessage(
        {
          event: "rebuildImageIndexProgress",
          data,
        },
        req,
        true
      );
    };

    let hashSuccess = 0;
    let hashFailed = 0;
    let embedSuccess = 0;
    let embedFailed = 0;
    let embedLastError;
    const total = rows.length;
    const startedAt = Date.now();
    notify({
      state: "start",
      total,
      max,
      embeddingModel: IMAGE_EMBEDDING_MODEL_ID,
    });
    console.log(chalk.cyan(`[rebuildImageHash] start total=${total} max=${max} model=${IMAGE_EMBEDDING_MODEL_ID}`));

    let processed = 0;
    for (const row of rows) {
      processed += 1;
      const isVideo = typeof row.mime_type === "string" && row.mime_type.startsWith("video/");
      const mediaFullPath = path.join(MEDIA_FULL_PATH, row.path);
      const thumbnailRelPath = row.thumbnail || `${row.path}.png`;
      const thumbFullPath = path.join(THUMB_FULL_PATH, thumbnailRelPath);
      const sourceImagePath = isVideo ? thumbFullPath : mediaFullPath;
      const sourceType = isVideo ? "video_thumbnail" : "image_file";
      try {
        if (isVideo) {
          if (fs.existsSync(mediaFullPath) && !fs.existsSync(thumbFullPath)) {
            try {
              fs.mkdirSync(path.dirname(thumbFullPath), { recursive: true });
              await generateThumbnail(mediaFullPath, thumbFullPath);
            } catch (e) {
              notify({
                state: "item",
                progress: processed,
                total,
                fileId: row.id,
                path: row.path,
                level: "warning",
                stage: "thumbnail",
                message: e?.message || String(e),
              });
              console.warn(chalk.yellow(`[rebuildImageHash] thumbnail_failed fileId=${row.id} video=${row.path} thumbnail=${thumbnailRelPath} err=${e?.message || String(e)}`));
            }
          }
        }

        if (!fs.existsSync(sourceImagePath)) {
          if (!row.has_hash) hashFailed += 1;
          if (!row.has_embed) embedFailed += 1;
          notify({
            state: "item",
            progress: processed,
            total,
            fileId: row.id,
            path: row.path,
            level: "warning",
            message: isVideo ? "缩略图不存在，已跳过" : "文件不存在，已跳过",
          });
          if (isVideo) {
            console.warn(chalk.yellow(`[rebuildImageHash] thumbnail_missing fileId=${row.id} video=${row.path} thumbnail=${thumbnailRelPath}`));
          } else {
            console.warn(chalk.yellow(`[rebuildImageHash] file_missing fileId=${row.id} path=${row.path}`));
          }
          continue;
        }
        if (!row.has_hash) {
          try {
            const dhash = await computeDHashFromFile(sourceImagePath);
            upsertImageDHash(row.id, dhash);
            hashSuccess += 1;
          } catch (e) {
            hashFailed += 1;
            notify({
              state: "item",
              progress: processed,
              total,
              fileId: row.id,
              path: row.path,
              level: "warning",
              stage: "hash",
              message: e?.message || String(e),
            });
            console.error(chalk.red(`[rebuildImageHash] hash_failed fileId=${row.id} path=${row.path} sourceType=${sourceType} source=${sourceImagePath} err=${e?.message || String(e)}`), e);
          }
        }

        if (!row.has_embed) {
          try {
            const { modelId, dim, vector } = await computeClipEmbeddingFromFile(sourceImagePath);
            upsertImageEmbedding(row.id, modelId, dim, vector);
            embedSuccess += 1;
          } catch (e) {
            embedFailed += 1;
            embedLastError = e?.message || String(e);
            notify({
              state: "item",
              progress: processed,
              total,
              fileId: row.id,
              path: row.path,
              level: "warning",
              stage: "embedding",
              message: embedLastError,
            });
            console.error(chalk.red(`[rebuildImageHash] embedding_failed fileId=${row.id} path=${row.path} sourceType=${sourceType} source=${sourceImagePath} err=${embedLastError}`), e);
          }
        }
      } catch (e) {
        if (!row.has_hash) hashFailed += 1;
        if (!row.has_embed) embedFailed += 1;
        embedLastError = embedLastError || (e?.message || String(e));
        notify({
          state: "item",
          progress: processed,
          total,
          fileId: row.id,
          path: row.path,
          level: "warning",
          stage: "unknown",
          message: e?.message || String(e),
        });
        console.error(chalk.red(`[rebuildImageHash] item_failed fileId=${row.id} path=${row.path} sourceType=${sourceType} source=${sourceImagePath} err=${e?.message || String(e)}`), e);
      }

      if (processed % logInterval === 0 || processed === total) {
        const elapsedMs = Date.now() - startedAt;
        notify({
          state: "progress",
          progress: processed,
          total,
          elapsedMs,
          hash: { success: hashSuccess, failed: hashFailed },
          embedding: { success: embedSuccess, failed: embedFailed },
        });
        console.log(chalk.gray(`[rebuildImageHash] progress=${processed}/${total} hash_ok=${hashSuccess} hash_fail=${hashFailed} embed_ok=${embedSuccess} embed_fail=${embedFailed} elapsed=${elapsedMs}ms`));
      }
    }

    const elapsedMs = Date.now() - startedAt;
    notify({
      state: "done",
      total,
      elapsedMs,
      hash: { success: hashSuccess, failed: hashFailed },
      embedding: { model: IMAGE_EMBEDDING_MODEL_ID, success: embedSuccess, failed: embedFailed, lastError: embedLastError || null },
    });
    console.log(chalk.green(`[rebuildImageHash] done total=${total} hash_ok=${hashSuccess} hash_fail=${hashFailed} embed_ok=${embedSuccess} embed_fail=${embedFailed} elapsed=${elapsedMs}ms`));

    res.send({
      scanned: rows.length,
      hash: {
        success: hashSuccess,
        failed: hashFailed,
      },
      embedding: {
        model: IMAGE_EMBEDDING_MODEL_ID,
        success: embedSuccess,
        failed: embedFailed,
        lastError: embedLastError || null,
      },
    });
  } catch (err) {
    console.error("Error rebuilding image hash:", err);
    res.status(500).send({ message: "Failed to rebuild image hash" });
  }
});

router.post("/files", async (req, res) => {
  try {
    const folderId = req.body.id;
    const searchQuery = req.body.query;
    const page = parseInt(req.body.page) || 0;
    const pageSize = parseInt(req.body.pageSize); // 每页文件数
    const type = req.body.type;
    const mime_type = req.body.mime_type;
    const space = req.body.space
    const start_date = req.body.start_date
    const end_date = req.body.end_date
    
    // 初始化数据库中的文件系统（如果需要）
    await initRootDirectory(req);
    
    // 通过ID获取文件列表，传递req对象以获取用户ID和收藏状态
    let result = await getFolderContentsById(folderId, searchQuery, { type, mime_type, space, start_date, end_date }, page, pageSize, req);
    res.send(result); // 返回包含files和total的结果
  } catch (err) {
    console.error("Error fetching file list:", err);
    res.status(500).send({ message: "Failed to fetch file list." });
  }
});

// 删除文件或文件夹
router.post("/delete", async (req, res) => {
  try {
    const { id } = req.body;
    
    if (!id) {
      return res.status(400).send({ message: "id must be provided" });
    }
    
    // 通过ID删除文件或文件夹
    const result = deleteFileById(id);
    res.send(result);
  } catch (err) {
    console.error(`Error deleting file or folder:`, err);
    res.status(500).send({ message: `Failed to delete file or folder` });
  }
});

// 新建文件夹
router.post("/createFolder", async (req, res) => {
  try {
    const { folderName, parentId } = req.body;
    
    // 通过父文件夹ID创建文件夹
    const parentInfo = parentId ? await getFileById(parentId) : null;
    if (parentId && (!parentInfo || parentInfo.type !== 'folder')) {
      return res.status(404).send({ message: "Parent folder not found" });
    }
    
    // 检查物理路径是否存在
    const folderPath = parentInfo ? path.join(MEDIA_FULL_PATH, parentInfo.path, folderName) : path.join(MEDIA_FULL_PATH, folderName);
    if (fs.existsSync(folderPath)) {
      return res.status(400).send({ message: "Folder already exists" });
    }
    
    // 创建物理文件夹
    fs.mkdirSync(folderPath, { recursive: true });
    
    // 更新数据库
    const parentPath = parentInfo ? parentInfo.path : "";
    await updateFolderByPath(parentPath);
    
    res.send({ message: "Folder created successfully" });
  } catch (err) {
    console.error("Error creating folder:", err);
    res.status(500).send({ message: "Failed to create folder" });
  }
});

// 重命名文件或文件夹
router.post("/rename", async (req, res) => {
  try {
    const { newName, type, id } = req.body;
    
    if (!id) {
      return res.status(400).send({ message: "id must be provided" });
    }
    
    // 通过ID重命名文件或文件夹
    const result = renameFileById(id, newName);
    res.send(result);
  } catch (err) {
    console.error(`Error renaming file or folder:`, err);
    res.status(500).send({ message: err.message || `Failed to rename file or folder` });
  }
});

router.post("/folderInfo", async (req, res) => {
  try {
    const { id } = req.body;
    
    if (!id) {
      return res.status(400).send({ message: "Folder ID is required" });
    }
    
    // 获取文件夹信息
    const folderInfo = await getFileById(id);
    
    if (!folderInfo || folderInfo.type !== 'folder') {
      return res.status(404).send({ message: "Folder not found" });
    }
    
    res.send({
      ...folderInfo,
      path: undefined
    });
  } catch (err) {
    console.error("Error getting folder info:", err);
    res.status(500).send({ message: "Failed to get folder info" });
  }
});

router.post("/updateCache", async (req, res) => {
  try {
    const folderId = req.body.id;
    const recursive = req.body.recursive !== false;
    const maxFolders = req.body.maxFolders;
    
    // 通过ID获取文件夹信息
    const folderInfo = folderId ? await getFileById(folderId) : null;
    if (folderId && (!folderInfo || folderInfo.type !== 'folder')) {
      return res.status(404).send({ message: "Folder not found" });
    }
    
    // 更新文件夹内容
    const folderPath = folderInfo ? folderInfo.path : "";
    const result = recursive
      ? await updateFolderTreeByPath(folderPath, { maxFolders, logMissingFolderCover: true })
      : await updateFolderByPath(folderPath);
    
    res.send({ message: "Update cache successfully", result });
  } catch (error) {
    console.error("Error updating cache:", error);
    res.status(500).send({ message: "Failed to update cache" });
  }
});

router.post("/cleanDb", async (req, res) => {
  try {
    await initRootDirectory(req);
    const folderId = req.body.id;
    const dryRun = req.body.dryRun === true;
    const fixThumbnails = req.body.fixThumbnails === true;
    const maxFolders = req.body.maxFolders;

    const folderInfo = folderId ? await getFileById(folderId) : null;
    if (folderId && (!folderInfo || folderInfo.type !== 'folder')) {
      return res.status(404).send({ message: "Folder not found" });
    }

    const folderPath = folderInfo ? folderInfo.path : "";
    const result = await cleanDbTreeByPath(folderPath, { dryRun, fixThumbnails, maxFolders });
    res.send({ message: "Clean db successfully", result });
  } catch (error) {
    console.error("Error cleaning db:", error);
    res.status(500).send({ message: "Failed to clean db", error: error?.message || String(error) });
  }
});

router.post("/move", async (req, res) => {
  try {
    let { sourceId, targetId } = req.body;
    if (!targetId) {
      targetId = null;
    }
    
    if (!sourceId) {
      return res.status(400).json({ message: "sourceId must be provided" });
    }
    
    // 通过ID移动文件或文件夹
    const result = moveFileById(sourceId, targetId);
    res.json(result);
  } catch (err) {
    console.error("Error moving file/folder:", err);
    res.status(500).json({ message: err.message || "Error moving file/folder" });
  }
});

router.post("/convert", async (req, res) => {
  const inputFileId = req.body.inputFileId;
  const outputFileSuffix = req.body.outputFileSuffix;
  if (!inputFileId) {
    return res.status(400).json({ message: "inputFileId is required" });
  }
  const inputFileInfo = await getFileById(inputFileId);
  if (!inputFileInfo) {
    return res.status(404).json({ message: "File not found" });
  }
  const inputFilePath = inputFileInfo.path;
  const outputFilePath = `${inputFilePath}.${outputFileSuffix}`;

  const absoluteInputPath = path.join(MEDIA_FULL_PATH, inputFilePath);
  const absoluteOutputPath = path.join(MEDIA_FULL_PATH, outputFilePath);

  if (!fs.existsSync(absoluteInputPath)) {
    return res.status(400).json({ message: "Input file does not exist" });
  }

  if (fs.existsSync(absoluteOutputPath)) {
    return res.status(400).json({ message: "Output file already exists" });
  }

  ffmpeg(absoluteInputPath)
    .outputOptions(
      "-c:v",
      "h264_nvenc",
      "-preset",
      "fast",
      "-b:v",
      "2M",
      "-threads",
      "8"
    )
    .save(absoluteOutputPath)
    .on("end", async () => {
      const currentPath = path.dirname(inputFilePath);
      await updateFolderByPath(currentPath); // 更新数据库
      res.json({ outputFilePath: outputFilePath });
    })
    .on("error", (err) => {
      console.error("Error during conversion:", err);
      res.status(500).json({ message: "Conversion failed" });
    });
});

router.post("/unzip", async (req, res) => {
  const { fileId } = req.body;
  const fileInfo = await getFileById(fileId);
  if(!fileInfo) { return res.status(404).json({ message: "文件不存在" }); }
  const zipFilePath = fileInfo.path;
  const currentPath = path.dirname(zipFilePath);
  const absoluteZipPath = path.join(MEDIA_FULL_PATH, zipFilePath);
  const extractToPath = path.join(MEDIA_FULL_PATH, currentPath);

  if (!fs.existsSync(absoluteZipPath)) {
    return res.status(400).json({ message: "Zip file does not exist" });
  }

  const fileExtension = path.extname(zipFilePath).toLowerCase();

  if (fileExtension === ".zip") {
    extract(absoluteZipPath, { dir: extractToPath })
      .then(async () => {
        await updateFolderByPath(currentPath); // 更新数据库
        res.json({ message: "File unzipped successfully", success: true });
      })
      .catch((err) => {
        console.error("Error during unzipping:", err);
        res.status(500).json({ message: "Unzipping failed" });
      });
  } else if (fileExtension === ".rar") {
    res.status(500).json({ message: "暂不支持rar解压" });
  } else {
    res.status(400).json({ message: "Unsupported file type" });
  }
});

router.post("/readTextFile", async (req, res) => {
  const { id, start = 0, numLines = 50, encoding = "utf8" } = req.body;
  const { path: filePath } = await getFileById(id);
  const absoluteFilePath = path.join(MEDIA_FULL_PATH, filePath);

  if (!fs.existsSync(absoluteFilePath)) {
    return res.status(400).json({ message: `File does not exist: ${filePath}` });
  }

  let lineCount = 0;
  let lines = [];
  let totalLines = 0; // 记录文件总行数
  const readStream = fs.createReadStream(absoluteFilePath, { encoding });
  const rl = readline.createInterface({
    input: readStream,
    crlfDelay: Infinity,
  });

  rl.on("line", (line) => {
    totalLines++; // 计算总行数
    if (lineCount >= start && lines.length < numLines) {
      lines.push(line);
    }
    lineCount++;
  });

  rl.on("close", () => {
    const content = lines.join("\n");
    const isLastPage = start + lines.length >= totalLines; // 判断是否为最后一页
    res.setHeader("Content-Type", `application/json; charset=${encoding}`);
    res.json({ content, start: start + lines.length, numLines, isLastPage });
  });

  rl.on("error", (err) => {
    console.error("Error reading file:", err);
    res.status(500).json({ message: "Error reading file" });
  });
});

router.post("/convertTxtEncoding", async (req, res) => {
  const { id } = req.body;
  const { path: filePath  } = getFileById(id);
  const absoluteFilePath = path.join(MEDIA_FULL_PATH, filePath);

  if (!fs.existsSync(absoluteFilePath)) {
    return res.status(400).json({ message: "File does not exist" });
  }

  convertTxtEncoding(absoluteFilePath, res);
});

router.post("/updateThumbnail", async (req, res) => {
  const { id, time } = req.body;
  const { path: filePath, filename  } = getFileById(id);
  const folderPath = path.dirname(filePath);
  const fullFolderPath = path.join(MEDIA_FULL_PATH, path.dirname(filePath));

  if (!fs.existsSync(fullFolderPath)) {
    return res.status(400).json({ message: "File does not exist" });
  }

  const videoPath = path.join(fullFolderPath, filename);
  const thumbnailPath = path.join(THUMB_FULL_PATH, folderPath, filename + ".png");
  try {
    await generateThumbnail(videoPath, thumbnailPath, time);
    const warnings = [];

    try {
      const dhash = await computeDHashFromFile(thumbnailPath);
      upsertImageDHash(id, dhash);
    } catch (e) {
      const message = e?.message || String(e);
      warnings.push({ stage: "hash", message });
      console.error(chalk.red(`[updateThumbnail] hash_failed fileId=${id} path=${filePath} thumbnail=${thumbnailPath} err=${message}`), e);
    }

    try {
      const { modelId, dim, vector } = await computeClipEmbeddingFromFile(thumbnailPath);
      upsertImageEmbedding(id, modelId, dim, vector);
    } catch (e) {
      const message = e?.message || String(e);
      warnings.push({ stage: "embedding", message });
      console.error(chalk.red(`[updateThumbnail] embedding_failed fileId=${id} path=${filePath} thumbnail=${thumbnailPath} err=${message}`), e);
    }

    res.json({ success: true, id, time, warnings })
  } catch (e) {
    console.error("Error generating thumbnail:", e);
    res.status(500).json({ success: false, id, time, message: e?.message || String(e) })
  }
});

router.post("/checkFiles", async (req, res) => {
  try {
    await initRootDirectory(req);
    const folderId = req.body.id;
    const maxFolders = req.body.maxFolders;

    const folderInfo = folderId ? await getFileById(folderId) : null;
    if (folderId && (!folderInfo || folderInfo.type !== 'folder')) {
      return res.status(404).send({ message: "Folder not found" });
    }

    const folderPath = folderInfo ? folderInfo.path : "";
    const result = await checkFilesTreeByPath(folderPath, { maxFolders });
    res.send({ message: "Check files successfully", result });
  } catch (error) {
    console.error("Error checking files:", error);
    res.status(500).send({ message: "Failed to check files", error: error?.message || String(error) });
  }
});

router.post("/saveVideoFrame", async (req, res) => {
  const { id, time } = req.body;
  const fileInfo = getFileById(id);
  if (!fileInfo) {
    return res.status(404).json({ success: false, id, time, message: "File not found" });
  }

  const { path: filePath, filename } = fileInfo;
  const folderPath = path.dirname(filePath);
  const fullFolderPath = path.join(MEDIA_FULL_PATH, folderPath);
  if (!fs.existsSync(fullFolderPath)) {
    return res.status(400).json({ success: false, id, time, message: "File does not exist" });
  }

  const videoPath = path.join(fullFolderPath, filename);
  if (!fs.existsSync(videoPath)) {
    return res.status(400).json({ success: false, id, time, message: "Video does not exist" });
  }

  const parsed = path.parse(filename);
  const timeSec = Number(time);
  const timeTag = Number.isFinite(timeSec) && timeSec >= 0
    ? `${Math.round(timeSec * 1000)}ms`
    : `${Date.now()}`;

  let saveName = `${parsed.name}.frame-${timeTag}.png`;
  let savePath = path.join(fullFolderPath, saveName);
  let index = 1;
  while (fs.existsSync(savePath)) {
    saveName = `${parsed.name}.frame-${timeTag}-${index}.png`;
    savePath = path.join(fullFolderPath, saveName);
    index += 1;
  }

  try {
    await generateThumbnail(videoPath, savePath, time);
    await updateFolderByPath(folderPath === "." ? "" : folderPath);

    const savedPath = path.join(folderPath, saveName).replace(/\\/g, "/").replace(/^\.\//, "");
    res.json({ success: true, id, time, savedPath });
  } catch (e) {
    console.error("Error saving video frame:", e);
    res.status(500).json({ success: false, id, time, message: e?.message || String(e) });
  }
});

router.post("/setFolderCover", async (req, res) => {
  try {
    const { fileId } = req.body;
    const result = setFolderCoverByFileId(fileId);
    res.json(result);
  } catch (error) {
    console.error("Error setting folder cover:", error);
    res.status(400).json({ success: false, message: error?.message || String(error) });
  }
});

export default router;
