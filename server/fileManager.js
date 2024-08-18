
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { UPLOAD_DIR, THUMB_DIR } from "../serverConfig.js";
import { isVideoByName, generateThumbnail } from "./utils/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const cacheFilePath = path.join(__dirname, "../cache.json");

// 缓存对象
let cache = {};
// 尝试从cache.json文件中读取缓存
function loadCache() {
  if (fs.existsSync(cacheFilePath)) {
    const data = fs.readFileSync(cacheFilePath, "utf8");
    try {
      cache = JSON.parse(data);
      console.log("Cache loaded from cache.json");
    } catch (error) {
      console.error("Error parsing cache.json:", error);
    }
  } else {
    console.log("No cache.json found, initializing empty cache");
  }
}

loadCache();

// 缓存管理函数
const updateCache = async (dirPath, req) => {
  if (dirPath.startsWith("/")) {
    dirPath = dirPath.slice(1);
  }
  const oldFileInfosStr = JSON.stringify(cache[dirPath] || []);
  const fullPath = path.join(UPLOAD_DIR, dirPath);
  const files = await new Promise((resolve, reject) => {
    fs.readdir(fullPath, (err, files) => {
      if (err) return reject(err);
      resolve(files);
    });
  });

  const fileInfos = await Promise.all(
    files.map(async (file) => {
      const filePath = path.join(fullPath, file);
      const stats = await fs.promises.stat(filePath);

      if (stats.isDirectory()) {
        return {
          type: "folder",
          filename: file,
          path: path.join(dirPath, file).replace(/\\/g, "/"),
          lastModified: stats.mtime,
          size: stats.size,
        };
      } else {
        const thumbnailPath = path.join(THUMB_DIR, dirPath, file + ".png");
        let thumbnail = null;

        if (fs.existsSync(thumbnailPath)) {
          thumbnail = "/thumbnails/" + path.join(dirPath, file + ".png");
        } else if (isVideoByName(file)) {
          await generateThumbnail(filePath, thumbnailPath);
          thumbnail = "/thumbnails/" + path.join(dirPath, file + ".png");
        }

        return {
          filename: "/uploads/" + path.join(dirPath, file),
          thumbnail: thumbnail,
          lastModified: stats.mtime,
          size: stats.size,
          type: "file",
        };
      }
    })
  );

  fileInfos.sort((a, b) => {
    const isFolder = (file) => file.type === "folder";
    const isVideoByName = (file) =>
      ["mp4", "webm", "ogg", "ts"].includes(
        file.filename.split(".").pop().toLowerCase()
      );
    const isImage = (file) =>
      ["jpg", "jpeg", "png", "gif"].includes(
        file.filename.split(".").pop().toLowerCase()
      );

    if (isFolder(a) && !isFolder(b)) return -1;
    if (!isFolder(a) && isFolder(b)) return 1;

    if (isVideoByName(a) && !isVideoByName(b)) return -1;
    if (!isVideoByName(a) && isVideoByName(b)) return 1;

    if (isImage(a) && !isImage(b)) return -1;
    if (!isImage(a) && isImage(b)) return 1;

    return new Date(b.lastModified) - new Date(a.lastModified);
  });

  if (oldFileInfosStr !== JSON.stringify(fileInfos)) {
    cache[dirPath] = fileInfos;
    fs.writeFileSync(cacheFilePath, JSON.stringify(cache), "utf8");
    return {
        updated: true,
        fileInfos
    }
  }
  return {
    updated: false,
    fileInfos
  }
};

const invalidateCache = (dirPath) => {
  if (dirPath.startsWith("/")) {
    dirPath = dirPath.slice(1);
  }
  delete cache[dirPath];
};

const searchFromCache = (dirPath, query) => {
    if (dirPath.startsWith("/")) {
        dirPath = dirPath.slice(1);
    }
    const result = [];
    for (const folder of Object.keys(cache)) {
      if (folder.startsWith(dirPath)) {
        const items = cache[folder];
        items.forEach((item) => {
          const filename = path.basename(item.filename);
          if (filename.includes(query)) {
            result.push({
              ...item,
              folder,
            });
          }
        });
      }
    }
};

const getFromCache = (dirPath) => {
  if (dirPath.startsWith("/")) {
    dirPath = dirPath.slice(1);
  }
  return cache[dirPath];
};

export {
    updateCache,
    invalidateCache,
    getFromCache,
    searchFromCache
}