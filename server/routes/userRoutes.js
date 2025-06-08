import chalk from "chalk";
import express from "express";
import fs from "fs";
import path from "path";
import ffmpeg from "fluent-ffmpeg";
import extract from "extract-zip";
import readline from "readline";
import multer from "multer";
import { updateFolderByPath, getFolderContentsById, getFileById, getFileByPath, deleteFileById, renameFileById, moveFileById, initRootDirectory } from "../fileDbManager.js";
import { MEDIA_FULL_PATH, THUMB_FULL_PATH } from "../../serverConfig.js";
import { wsBroadcastMessage } from "../websocketManager.js";
import { convertTxtEncoding } from "../tools/textFileTools.js";
import { tryRegister } from "../userManager.js";
import { downloadAllMediaByLinks } from "../downloadManager.js";
import { get51PageInfo, generateThumbnail } from "../utils/index.js";
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
  const folderInfo = await getFileById(folderId);
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
        
        res.send({
          id: fileInfo ? fileInfo.id : null,
          filename: filename,
          thumbnail: folderPath + "/" + filename + ".png",
        });
      } catch (err) {
        console.error("Error generating thumbnail:", err);
        res.send({ filename: filename });
      }
    } else {
      await updateFolderByPath(folderPath); // 更新数据库
      
      // 获取新创建的文件信息
      const fileInfo = getFileByPath(path.join(folderPath, filename));
      
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
    
    // 通过ID获取文件夹信息
    const folderInfo = folderId ? await getFileById(folderId) : null;
    if (folderId && (!folderInfo || folderInfo.type !== 'folder')) {
      return res.status(404).send({ message: "Folder not found" });
    }
    
    // 更新文件夹内容
    const folderPath = folderInfo ? folderInfo.path : "";
    await updateFolderByPath(folderPath);
    
    res.send({ message: "Update cache successfully" });
  } catch (error) {
    console.error("Error updating cache:", error);
    res.status(500).send({ message: "Failed to update cache" });
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
  await generateThumbnail(videoPath, thumbnailPath, time);
  res.json({ success: true, id, time })
});

export default router;