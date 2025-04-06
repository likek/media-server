import chalk from "chalk";
import express from "express";
import multer from "multer";
import cors from "cors";
import fs from "fs";
import path from "path";
import ffmpeg from "fluent-ffmpeg";
import extract from "extract-zip";
import readline from "readline";
import { fileURLToPath } from "url";
import requestIp from "request-ip";
import cookieParser from "cookie-parser";
import { createServer } from "http";
import db, { serializeDb } from "./server/dbserialize.js";
import compression from "compression";
import { normalizeIp, generateThumbnail, get51PageInfo } from "./server/utils/index.js";
import { limiter } from "./server/middleware/limiter.js";
import { checkBlacklist } from "./server/middleware/blackList.js";
import { checkPermissions } from "./server/middleware/apiPermission.js";
import { writeRequestLog, writeFileAccessedLog } from "./server/logManager.js";
import { updateFolderByPath, getFolderContentsById, getFileById, getFileByPath, deleteFileById, renameFileById, moveFileById, initRootDirectory } from "./server/fileDbManager.js";
import { MEDIA_FULL_PATH, THUMB_FULL_PATH, MEDIA_ROUTE, THUMB_ROUTE, ENTRY_ROUTE_REGEX } from "./serverConfig.js";
import { pathNormalizer } from "./server/middleware/pathNormalizer.js";
import { wsBroadcastMessage, wsInit } from "./server/websocketManager.js";
import { convertTxtEncoding } from "./server/tools/textFileTools.js";
import { tryRegister } from "./server/userManager.js";
import { downloadAllMediaByLinks } from "./server/downloadManager.js";

serializeDb();

// 获取当前文件的目录名
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 7777;

const httpServer = createServer(app);

app.set("trust proxy", 1);

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

// 创建上传和缩略图目录
if (!fs.existsSync(MEDIA_FULL_PATH)) {
  fs.mkdirSync(MEDIA_FULL_PATH);
}

if (!fs.existsSync(THUMB_FULL_PATH)) {
  fs.mkdirSync(THUMB_FULL_PATH);
}

app.use(compression({
  filter: (req, res) => {
    if (req.headers["x-no-compression"]) {
      return false;
    }

    return compression.filter(req, res);
  }
}));

app.use(cookieParser());
app.use(checkBlacklist);
app.use(limiter);
app.use(cors());
app.use(requestIp.mw());
app.use(checkPermissions);

app.use((req, res, next) => {
  const path = decodeURIComponent(req.path);
  if (path.startsWith(`${MEDIA_ROUTE}/`)) {
    const userIp = normalizeIp(req.clientIp || req.ip);
    writeFileAccessedLog({
      userId: req.cookies?.userId,
      userIp,
      filePath: path,
    });
    if (!req.cookies?.userId) {
      console.log("尝试注册");
      tryRegister(req, res).catch((e) => {
        console.error("注册失败: ", e);
      });
    }
  }
  next();
});

app.use(`${MEDIA_ROUTE}`, express.static(MEDIA_FULL_PATH));
app.use(`${THUMB_ROUTE}`, express.static(THUMB_FULL_PATH));
app.use(express.json({ limit: "3mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "static")));
app.use(pathNormalizer);
app.use(writeRequestLog);

wsInit(httpServer);

app.get("/api/register", async (req, res) => {
  await tryRegister(req, res);
  res.send({ success: true });
});

app.post("/api/users", async (req, res) => {
  try {
    const page = req.body.page || 1;
    const limit = req.body.limit || 10;
    const offset = (page - 1) * limit;

    // 查询总记录数
    const countQuery = `SELECT COUNT(*) AS total FROM userInfo`;
    db.get(countQuery, [], (err, row) => {
      if (err) {
        console.error("Error executing count query:", err);
        return res.status(500).send({ message: "Database error" });
      }

      // 分页查询
      const query = `
                SELECT * FROM userInfo
                ORDER BY update_time DESC
                LIMIT ? OFFSET ?
            `;

      db.all(query, [limit, offset], (err, rows) => {
        if (err) {
          console.error("Error executing query:", err);
          return res.status(500).send({ message: "Database error" });
        }

        // 返回结果包括数据和总数
        res.json({ data: rows, count: row.total });
      });
    });
  } catch (error) {
    console.error("Error handling request:", error);
    res.status(500).send({ message: "Internal server error" });
  }
});

app.post("/api/downloadFromText", async (req, res) => { 
  const folderId = req.body.folderId;
  let folderPath = "";
  const folderInfo = await getFileById(folderId);
  if (folderInfo) {
    folderPath = folderInfo.path;
  }
  let downloadRootAll = folderPath;
  let downloadSubAll = [];
  const folder = folderPath;
  let text = req.body.text || "";
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

  const failedCb = (e) => {
    const { code, msg, ignoreLinks } = e
    // 失败
    console.error(chalk.red('下载出错:'), e);
    return res.status(code || 400).json({ error: msg || e, ignoreLinks: ignoreLinks || [] });
  }

  const reg = /^\W*51[:：]\W*/
  if (reg.test(text)) {
    let completedCountAll = 0;
    let ignoreLinksAll = []
    let failedLinksAll = [];
    text = text.replace(reg, '')
    const pageUrlList = text.split('\n')
    for (const pageUrl of pageUrlList) {
      // 使用cheerio获取title, document.querySelector('h1.post-title').innerText
      // const { data: pageData } = await axios.get(pageUrl)
      // const $ = cheerio.load(pageData)
      // const title = $('h1.post-title').text()
      // const inputText = $('img[data-xuid]').map((i, item) => item.attribs.src).toArray().join('\n') + '\n' + $('.dplayer[data-config]').map((i, item) => JSON.parse(item?.dataset?.config || "{}").video?.url).toArray().join('\n')
      const pageInfo = await get51PageInfo(pageUrl);
      const title = pageInfo.title
      const inputText = [...pageInfo.imgLinks, ...pageInfo.videoLinks].join('\n')
      
      const targetFolder = `${folder}/${title}`;
      let result;
      try {
        result = await downloadAllMediaByLinks(inputText, targetFolder, successItemCb)
      } catch(e) {
        failedCb(e)
        return
      }
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
    failedCb(e)
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
app.post("/api/upload", upload.single("file"), async (req, res) => {
  try {
    const parentId = req.query.parentId;
    
    // 获取父文件夹路径
    const parentInfo = parentId ? await getFileById(parentId) : null;
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
        const fileInfo = await getFileByPath(path.join(folderPath, filename));
        
        res.send({
          id: fileInfo ? fileInfo.id : null,
          filename: `${MEDIA_ROUTE}/` + folderPath + "/" + filename,
          thumbnail: `${THUMB_ROUTE}/` + folderPath + "/" + filename + ".png",
        });
      } catch (err) {
        console.error("Error generating thumbnail:", err);
        res.send({ filename: `${MEDIA_ROUTE}/` + folderPath + "/" + filename });
      }
    } else {
      await updateFolderByPath(folderPath); // 更新数据库
      
      // 获取新创建的文件信息
      const fileInfo = await getFileByPath(path.join(folderPath, filename));
      
      res.send({
        id: fileInfo ? fileInfo.id : null,
        filename: `${MEDIA_ROUTE}/` + folderPath + "/" + filename
      });
    }
  } catch (err) {
    console.error("Error uploading file:", err);
    res.status(500).send({ message: "Failed to upload file" });
  }
});

// 获取文件列表
app.post("/api/files", async (req, res) => {
  try {
    const folderId = req.body.id;
    const searchQuery = req.body.query;
    const page = parseInt(req.body.page) || 0;
    const pageSize = parseInt(req.body.pageSize); // 每页文件数
    
    // 初始化数据库中的文件系统（如果需要）
    await initRootDirectory(req);
    
    // 通过ID获取文件列表
    let result = await getFolderContentsById(folderId, searchQuery, page, pageSize);
    res.send(result);
  } catch (err) {
    console.error("Error fetching file list:", err);
    res.status(500).send({ message: "Failed to fetch file list." });
  }
});

// 删除文件或文件夹
app.post("/api/delete", async (req, res) => {
  try {
    const { id } = req.body;
    
    if (!id) {
      return res.status(400).send({ message: "id must be provided" });
    }
    
    // 通过ID删除文件或文件夹
    const result = await deleteFileById(id);
    res.send(result);
  } catch (err) {
    console.error(`Error deleting file or folder:`, err);
    res.status(500).send({ message: `Failed to delete file or folder` });
  }
});

// 新建文件夹
app.post("/api/createFolder", async (req, res) => {
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
app.post("/api/rename", async (req, res) => {
  try {
    const { newName, type, id } = req.body;
    
    if (!id) {
      return res.status(400).send({ message: "id must be provided" });
    }
    
    // 通过ID重命名文件或文件夹
    const result = await renameFileById(id, newName);
    res.send(result);
  } catch (err) {
    console.error(`Error renaming file or folder:`, err);
    res.status(500).send({ message: err.message || `Failed to rename file or folder` });
  }
});

app.post("/api/folderInfo", async (req, res) => {
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
    
    res.send(folderInfo);
  } catch (err) {
    console.error("Error getting folder info:", err);
    res.status(500).send({ message: "Failed to get folder info" });
  }
});

app.post("/api/updateCache", async (req, res) => {
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

app.post("/api/move", async (req, res) => {
  try {
    const { sourceId, targetId } = req.body;
    
    if (!sourceId || !targetId) {
      return res.status(400).json({ message: "sourceId and targetId must be provided" });
    }
    
    // 通过ID移动文件或文件夹
    const result = await moveFileById(sourceId, targetId);
    res.json(result);
  } catch (err) {
    console.error("Error moving file/folder:", err);
    res.status(500).json({ message: err.message || "Error moving file/folder" });
  }
});

app.post("/api/convert", (req, res) => {
  const { inputFilePath, outputFilePath } = req.body;

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

app.post("/api/unzip", async (req, res) => {
  const { zipFilePath } = req.body;
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

app.post("/api/readTextFile", async (req, res) => {
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

app.post("/api/convertTxtEncoding", async (req, res) => {
  const { id } = req.body;
  const { path: filePath  } = await getFileById(id);
  const absoluteFilePath = path.join(MEDIA_FULL_PATH, filePath);

  if (!fs.existsSync(absoluteFilePath)) {
    return res.status(400).json({ message: "File does not exist" });
  }

  convertTxtEncoding(absoluteFilePath, res);
});

// 处理所有非API路由，返回index.html，支持前端路由
app.get(ENTRY_ROUTE_REGEX, (req, res) => {
  res.sendFile(path.join(__dirname, "static", "index.html"));
});

httpServer.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
