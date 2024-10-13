import chalk from "chalk";
import express from "express";
import multer from "multer";
import cors from "cors";
import fs from "fs";
import path from "path";
import ffmpeg from "fluent-ffmpeg";
import extract from "extract-zip";
import iconv from "iconv-lite";
import jschardet from "jschardet";
import readline from "readline";
import { fileURLToPath } from "url";
import requestIp from "request-ip";
import cookieParser from "cookie-parser";
import { v4 as uuidv4 } from "uuid";
import { createServer } from "http";
import WebSocket, { WebSocketServer } from "ws";
import db, { serializeDb } from "./server/dbserialize.js";
import { exec } from "child_process";
import compression from "compression";
import { getRequestInfo, normalizeIp, generateThumbnail, get51PageInfo } from "./server/utils/index.js";
import { limiter } from "./server/middleware/limiter.js";
import { checkBlacklist } from "./server/middleware/blackList.js";
import { checkPermissions } from "./server/middleware/apiPermission.js";
import { writeRequestLog, writeWsLog, writeFileAccessedLog } from "./server/logManager.js";
import folderLockHandler from "./server/middleware/folderLockManager.js";
import { updateCache, invalidateCache, searchFromCache, getFromCache } from "./server/fileManager.js";
import { UPLOAD_DIR, THUMB_DIR } from "./serverConfig.js";
// import axios from "axios";
// import * as cheerio from 'cheerio';

serializeDb();

// 获取当前文件的目录名
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 7777;

const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer });
const clientsById = new Map();


app.set("trust proxy", 1);

// 配置 multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const currentPath = req.query.path || "";
    const uploadPath = path.join(UPLOAD_DIR, currentPath);

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

function updateTreeCache(dirPath, req) {
  return updateCache(dirPath, req).then((res) => {
    const { updated, fileInfos } = res;
    if (updated) {
      broadcastMessage(
        { event: "updateCache", data: { dirPath, fileInfos } },
        req
      );
    }
    return res
  })
}

// 创建上传和缩略图目录
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR);
}

if (!fs.existsSync(THUMB_DIR)) {
  fs.mkdirSync(THUMB_DIR);
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
  if (path.startsWith("/uploads/")) {
    const userIp = normalizeIp(req.clientIp || req.ip);
    console.log(
      `File accessed: ${path}, userId: `,
      req.cookies?.userId,
      userIp
    );
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

function broadcastMessage(message, req, onlySelf = false) {
  const userId = req.cookies.userId;
  if (onlySelf) {
    const userId = req.cookies.userId;
    const client = clientsById.get(userId);
    if (client && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
    return;
  }
  clientsById.forEach((client, id) => {
    if (id !== userId && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}

app.use("/uploads", express.static(UPLOAD_DIR));
app.use("/thumbnails", express.static(THUMB_DIR));
app.use(express.json({ limit: "3mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "static")));
app.use(pathNormalizer);
app.use(writeRequestLog);
app.use(folderLockHandler);


wss.on("connection", async (ws, req) => {
  const reqInfo = await getRequestInfo(req);
  const cookies = reqInfo?.cookies;

  let ipAddress = reqInfo.userIp;
  const userId = cookies.userId;

  let region = "";

  clientsById.set(userId, ws);
  ws.on("close", () => {
    clientsById.delete(userId);
    console.log(
      `[${new Date().toLocaleString()}] 用户${chalk.yellow(
        "已断开"
      )}: [${userId}] - [${ipAddress}] - [${region}]`
    );
    writeWsLog({
      userId,
      userIp: ipAddress,
      userRegion: region,
      action: "disconnect",
    });
  });

  ws.on("error", function error(err) {
    console.error("WebSocket error:", err);
  });

  ws.on("message", async (message) => {
    if (Buffer.isBuffer(message)) {
        message = message.toString();
    }
    
    try {
        const parsedMessage = JSON.parse(message);
        console.log("Received ws message:", parsedMessage);
        switch (parsedMessage.event) {
            case "location":
              const { latitude, longitude } = parsedMessage.data;
              writeWsLog({
                userId,
                userIp: ipAddress,
                userRegion: region,
                action: parsedMessage.event,
                location: `${latitude},${longitude}`
              });
              break;
        }
    } catch (err) {
        console.error("Failed to parse message:", err);
    }
  });

  try {
    region = reqInfo?.region || "unknown";
  } catch (e) {
    console.error("获取ip属地出错: ", e);
  }
  console.log(
    `[${new Date().toLocaleString()}] 用户${chalk.green(
      "已连接"
    )}: [${userId}] - [${ipAddress}] - [${region}]`
  );
  writeWsLog({
    userId,
    userIp: ipAddress,
    userRegion: region,
    action: "connect",
  });
});

async function tryRegister(req, res) {
  let userId = req.cookies.userId;

  if (!userId) {
    userId = uuidv4();
    res.cookie("userId", userId, {
      maxAge: 3650 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: "strict",
    });
  }

  const userInfo = await getRequestInfo(req);
  db.run(
    `INSERT OR IGNORE INTO userInfo (userId, ip, create_time, update_time, userAgent, region, device, os, browser) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      userInfo.userIp,
      userInfo.requestTime,
      userInfo.requestTime,
      userInfo.userAgent,
      userInfo.region,
      userInfo.device,
      userInfo.os,
      userInfo.browser,
    ],
    (err) => {
      if (err) {
        console.error("Error inserting user info:", err);
      }
    }
  );

  // 修改除create_time外的其他所有字段
  db.run(
    `UPDATE userInfo SET ip = ?, update_time = ?, userAgent = ?, region = ?, device = ?, os = ?, browser = ? WHERE userId = ?`,
    [
      userInfo.userIp,
      userInfo.requestTime,
      userInfo.userAgent,
      userInfo.region,
      userInfo.device,
      userInfo.os,
      userInfo.browser,
      userId,
    ],
    (err) => {
      if (err) {
        console.error("Error updating user info:", err);
      }
    }
  );
  return userId;
}

async function downloadAllMediaByLinks(text, folder, successItemCb) {
  console.log('开始下载：')
  console.log(text)
  console.log(folder)
  // Match HTTP links
  const urlRegex = /https?:\/\/[^\s]+/g;
  const allLinks = text.match(urlRegex) || [];
  const validLinkRegex =
    /https?:\/\/[^\s]+?\.(m3u8|mp4|ts|avi|mkv|mov|wmv|webm|flv|ogv|mpeg|pdf|png|jpg|mp3|txt|zip|exe|apk)(\?[^\s]*)?/i;

  const links = allLinks.filter((link) => validLinkRegex.test(link));
  const ignoreLinks = allLinks.filter((link) => !validLinkRegex.test(link));

  // Match base64-encoded images
  const base64Regex = /data:image\/(png|jpeg|jpg|gif);base64,([a-zA-Z0-9+/=]+)/g;
  const base64Images = [];
  let match;
  while ((match = base64Regex.exec(text)) !== null) {
    base64Images.push({
      mimeType: match[1],
      base64: match[2],
    });
  }

  if (links.length === 0 && base64Images.length === 0) {
    return Promise.reject({
      code: 400,
      msg: "没有找到任何有效的链接",
      ignoreLinks
    })
  }

  console.log("开始批量下载资源: ", links, `${base64Images.length}个base64图片`);

  let downloadRoot = "";
  let downloadSub = "";
  let downloadDir = "";
  if (folder) {
    downloadRoot = "";
    downloadSub = folder;
  } else {
    downloadRoot = "从文本中链接提取的资源";
    downloadSub = `${new Date()
      .toLocaleString()
      .replace(/[:.\/\s]/g, "_")}_${uuidv4()}`;
  }
  downloadDir = path.join(__dirname, "uploads", downloadRoot, downloadSub);
  if (!fs.existsSync(downloadDir)) {
    fs.mkdirSync(downloadDir, { recursive: true });
  }

  const failedLinks = [];
  let completedCount = 0;

  const downloadLink = (link) => {
    return new Promise((resolve) => {
      const tempDir = path.join(
        __dirname,
        "temp",
        "batch_download",
        `${Date.now()}`
      );
      const m3u8Regex = /https?:\/\/[^\s]+?\.m3u8(\?[^\s]*)?/i;
      const saveName = `${Date.now()}${Math.floor(Math.random() * 100000)}`;
      const command = m3u8Regex.test(link)
        ? `N_m3u8DL-RE --auto-select "${link}" --save-dir "${downloadDir}" --save-name ${saveName} --tmp-dir ${tempDir} --ui-language en-US`
        : `curl -L "${link}" -o "${path.join(downloadDir, saveName)}"`;

      console.log(`开始执行: ${command}`);

      const child = exec(command, {
        env: { ...process.env, LANG: "en-US.UTF-8" },
      });

      child.stdout.on("data", (data) => {
        process.stdout.write(`stdout: ${data}`);
      });

      child.stderr.on("data", (data) => {
        process.stderr.write(`stderr: ${data}`);
      });

      child.on("close", (code) => {
        let failed = false;
        if (code !== 0) {
          failed = true;
          console.error(`${chalk.red("下载失败")}: ${link}`);
          failedLinks.push(link);
        } else {
          console.log(`${chalk.green("下载成功")}: ${link}`);
        }
        completedCount++;

        successItemCb({
          link,
          progress: completedCount,
          total: links.length + base64Images.length,
          state: failed ? "failed" : "success",
        })
        resolve();
      });
    });
  };

  // Save base64 images
  const saveBase64Image = (image, index) => {
    return new Promise((resolve) => {
      const fileName = `image_${index}.${image.mimeType}`;
      const filePath = path.join(downloadDir, fileName);
      const imageBuffer = Buffer.from(image.base64, 'base64');

      fs.writeFile(filePath, imageBuffer, (err) => {
        if (err) {
          console.error(`${chalk.red("保存失败")}: ${filePath}`);
          failedLinks.push(filePath);
        } else {
          console.log(`${chalk.green("保存成功")}: ${filePath}`);
        }
        completedCount++;
        
        successItemCb({
          link: fileName,
          progress: completedCount,
          total: links.length + base64Images.length,
          state: err ? "failed" : "success",
        })
        resolve();
      });
    });
  };

  // 并行下载所有 HTTP 链接和保存 base64 图片
  await Promise.all([...links.map(downloadLink), ...base64Images.map(saveBase64Image)]);
  return Promise.resolve({
    downloadRoot, downloadSub, completedCount, ignoreLinks, failedLinks
  });
}

app.get("/register", async (req, res) => {
  await tryRegister(req, res);
  res.send({ success: true });
});

app.post("/users", async (req, res) => {
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

app.post("/downloadFromText", async (req, res) => { 
  const folder = req.body.folder;
  let text = req.body.text || "";
  const successItemCb = data => {
    // 单个文件下载成功，通知前端下载进度
    broadcastMessage(
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
    return res.status(code || 400).json({ error: msg || e, ignoreLinks: ignoreLinks || [] });
  }

  const reg = /^\W*51[:：]\W*/
  if (reg.test(text)) {
    let completedCountAll = 0;
    let ignoreLinksAll = []
    let failedLinksAll = [];
    let downloadRootAll = ''
    let downloadSubAll = []
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
      await updateTreeCache(`${downloadRoot}/${downloadSub}`, req)
      if (downloadSub.indexOf('/') !== -1) {
        await updateTreeCache(downloadSub.substring(0, downloadSub.lastIndexOf('/')), req);
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
    await updateTreeCache(downloadRoot, req);
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
  await updateTreeCache(downloadRoot, req);
  await updateTreeCache(`${downloadRoot}/${downloadSub}`, req);
  if (downloadSub.indexOf('/') !== -1) {
    await updateTreeCache(downloadSub.substring(0, downloadSub.lastIndexOf('/')), req);
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
app.post("/upload", upload.single("file"), async (req, res) => {
  const currentPath = req.query.path || "";
  const filename = Buffer.from(req.file.filename, "latin1").toString("utf-8");
  const filePath = path.join(UPLOAD_DIR, currentPath, filename);

  // 确保缩略图目录存在
  const thumbnailDir = path.join(THUMB_DIR, currentPath);
  if (!fs.existsSync(thumbnailDir)) {
    fs.mkdirSync(thumbnailDir, { recursive: true });
  }

  // 如果是视频文件，生成缩略图
  if (req.file.mimetype.startsWith("video/")) {
    const thumbnailPath = path.join(thumbnailDir, filename + ".png");
    try {
      await generateThumbnail(filePath, thumbnailPath);
      await updateTreeCache(currentPath, req); // 更新缓存
      res.send({
        filename: "/uploads/" + currentPath + "/" + filename,
        thumbnail: "/thumbnails/" + currentPath + "/" + filename + ".png",
      });
    } catch (err) {
      console.error("Error generating thumbnail:", err);
      res.send({ filename: "/uploads/" + currentPath + "/" + filename });
    }
  } else {
    await updateTreeCache(currentPath, req); // 更新缓存
    res.send({ filename: "/uploads/" + currentPath + "/" + filename });
  }
});

// 获取文件列表
app.post("/files", async (req, res) => {
  const reqPath = req.body.path || "";
  const page = parseInt(req.body.page) || 0;
  const pageSize = parseInt(req.body.pageSize); // 每页文件数

  // 从缓存中获取数据
  const cacheData = getFromCache(reqPath)
  if (cacheData) {
    if (!pageSize || pageSize === -1) {
      return res.send(cacheData);
    }
    return res.send(
      cacheData.slice(page * pageSize, (page + 1) * pageSize)
    );
  }

  try {
    await updateTreeCache(reqPath, req);
    const result = getFromCache(reqPath) || [];
    if (!pageSize || pageSize === -1) {
      return res.send(result);
    }
    return res.send(result.slice(page * pageSize, (page + 1) * pageSize));
  } catch (err) {
    console.error("Error fetching file list:", err);
    res.status(500).send({ message: "Failed to fetch file list." });
  }
});

app.post("/search", (req, res) => {
  let { query, path: searchPath } = req.body;

  if (!query) {
    return res.status(400).json({ message: "Query is required" });
  }

  if (!searchPath) {
    searchPath = "";
  }
  const result = searchFromCache(searchPath, query);
  res.send(result);
});

// 删除文件或文件夹
app.post("/delete", async (req, res) => {
  const { filename, path: currentPath, type } = req.body;
  const filePath = path.join(UPLOAD_DIR, currentPath, filename);

  const deleteRecursively = async (filePath) => {
    if (fs.lstatSync(filePath).isDirectory()) {
      fs.readdirSync(filePath).forEach((file, index) => {
        const curPath = path.join(filePath, file);
        deleteRecursively(curPath);
      });
      fs.rmdirSync(filePath);
    } else {
      fs.unlinkSync(filePath);
    }
  };

  try {
    await deleteRecursively(filePath);
    await updateTreeCache(currentPath, req); // 更新缓存
    res.send({ message: `${type} deleted successfully` });
  } catch (err) {
    console.error(`Error deleting ${type}:`, err);
    res.status(500).send({ message: `Failed to delete ${type}` });
  }
});

// 新建文件夹
app.post("/createFolder", (req, res) => {
  const { path: currentPath, folderName } = req.body;
  const folderPath = path.join(UPLOAD_DIR, currentPath, folderName);

  if (fs.existsSync(folderPath)) {
    return res.status(400).send({ message: "Folder already exists" });
  }

  fs.mkdir(folderPath, { recursive: true }, async (err) => {
    if (err) {
      console.error("Error creating folder:", err);
      return res.status(500).send({ message: "Failed to create folder" });
    }

    await updateTreeCache(currentPath, req); // 更新缓存

    res.send({ message: "Folder created successfully" });
  });
});

// 重命名文件或文件夹
app.post("/rename", (req, res) => {
  const { path: currentPath, oldName, newName, type } = req.body;
  const oldPath = path.join(UPLOAD_DIR, currentPath, oldName);
  const newPath = path.join(UPLOAD_DIR, currentPath, newName);

  if (fs.existsSync(newPath)) {
    return res
      .status(400)
      .send({ message: `${type} with the same name already exists` });
  }

  fs.rename(oldPath, newPath, async (err) => {
    if (err) {
      console.error(`Error renaming ${type}:`, err);
      return res.status(500).send({ message: `Failed to rename ${type}` });
    }

    invalidateCache(`${currentPath}/${oldName}`); // 如果rename的是文件夹，则该文件夹对应的缓存不应该再继续存在
    await updateTreeCache(currentPath, req); // 更新缓存

    res.send({ message: `${type} renamed successfully` });
  });
});

app.post("/updateCache", async (req, res) => {
  try {
    const currentPath = req.body.path || "";
    await updateTreeCache(currentPath, req);
    res.send({ message: "Update cache successfully" });
  } catch (error) {
    console.error("Error updating cache:", error);
    res.status(500).send({ message: "Failed to update cache" });
  }
});

app.post("/move", (req, res) => {
  const { filename, targetFolder, currentPath } = req.body;

  const sourcePath = path.join(__dirname, "uploads", currentPath, filename);
  const destinationPath = path.join(
    __dirname,
    "uploads",
    targetFolder,
    filename
  );

  if (!fs.existsSync(sourcePath)) {
    return res
      .status(400)
      .json({ message: "Source file/folder does not exist" });
  }

  if (!fs.existsSync(path.join(__dirname, "uploads", targetFolder))) {
    return res.status(400).json({ message: "Target folder does not exist" });
  }

  fs.rename(sourcePath, destinationPath, async (err) => {
    if (err) {
      console.error("Error moving file/folder:", err);
      return res.status(500).json({ message: "Error moving file/folder" });
    }

    invalidateCache(`${currentPath}/${filename}`); // 如果是文件夹，则该文件夹对应的缓存不应该再继续存在
    await updateTreeCache(currentPath, req); // 更新缓存
    await updateTreeCache(targetFolder.replace(/^\/+/, ""), req); // 更新缓存
    res.json({ success: true });
  });
});

app.post("/convert", (req, res) => {
  const { inputFilePath, outputFilePath } = req.body;

  const absoluteInputPath = path.join(UPLOAD_DIR, inputFilePath);
  const absoluteOutputPath = path.join(UPLOAD_DIR, outputFilePath);

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
      await updateTreeCache(currentPath, req); // 更新缓存
      res.json({ outputFilePath: outputFilePath });
    })
    .on("error", (err) => {
      console.error("Error during conversion:", err);
      res.status(500).json({ message: "Conversion failed" });
    });
});

app.post("/unzip", async (req, res) => {
  const { zipFilePath } = req.body;
  const currentPath = path.dirname(zipFilePath);
  const absoluteZipPath = path.join(UPLOAD_DIR, zipFilePath);
  const extractToPath = path.join(UPLOAD_DIR, currentPath);

  if (!fs.existsSync(absoluteZipPath)) {
    return res.status(400).json({ message: "Zip file does not exist" });
  }

  const fileExtension = path.extname(zipFilePath).toLowerCase();

  if (fileExtension === ".zip") {
    extract(absoluteZipPath, { dir: extractToPath })
      .then(async () => {
        await updateTreeCache(currentPath, req);
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

app.post("/readTextFile", (req, res) => {
  const { filePath, start = 0, numLines = 50, encoding = "utf8" } = req.body;
  const absoluteFilePath = path.join(UPLOAD_DIR, filePath);

  if (!fs.existsSync(absoluteFilePath)) {
    return res.status(400).json({ message: "File does not exist" });
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

function convertTxtEncoding(filePath, res) {
  const extname = path.extname(filePath);
  if (extname !== ".txt") {
    res.status(400).json({ message: "不是txt文件，跳过编码转换" });
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      console.error("读取文件失败:", err);
      res.status(500).json({ message: "读取文件失败" });
      return;
    }

    // 检测文件编码
    const detectedEncoding = jschardet.detect(data).encoding;
    if (!detectedEncoding) {
      res.status(500).json({ message: "文件编码检测失败" });
      return;
    }

    // 判断文件是否为UTF-8编码
    if (detectedEncoding.toLowerCase() === "utf-8") {
      res.json({ message: "已经是UTF-8编码" });
      return;
    }

    // 将文件内容从原编码转换为UTF-8
    const content = iconv.decode(data, detectedEncoding);
    const utf8Content = iconv.encode(content, "utf-8");

    // 将转换后的内容写入文件
    fs.writeFile(filePath, utf8Content, (err) => {
      if (err) {
        console.error("写入文件失败:", err);
        res.status(500).json({ message: "写入文件失败" });
        return;
      }
      res.json({ message: "编码修改为UTF-8成功", success: true });
    });
  });
}

app.post("/convertTxtEncoding", (req, res) => {
  const { filePath } = req.body;
  const absoluteFilePath = path.join(UPLOAD_DIR, filePath);

  if (!fs.existsSync(absoluteFilePath)) {
    return res.status(400).json({ message: "File does not exist" });
  }

  convertTxtEncoding(absoluteFilePath, res);
});

// 根路径返回 index.html
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "static", "index.html"));
});

httpServer.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

function pathNormalizer(req, res, next) {
  const originalSend = res.send;
  res.send = function (body) {
    if (typeof body === "object") {
      const normalizePaths = (obj) => {
        if (Array.isArray(obj)) {
          return obj.map(normalizePaths);
        } else if (obj !== null && typeof obj === "object") {
          for (let key in obj) {
            if (typeof obj[key] === "string") {
              obj[key] = obj[key].replace(/\\/g, "/");
            } else if (typeof obj[key] === "object") {
              obj[key] = normalizePaths(obj[key]);
            }
          }
          return obj;
        }
        return obj;
      };
      body = normalizePaths(body);
    }
    return originalSend.call(this, body);
  };
  next();
}