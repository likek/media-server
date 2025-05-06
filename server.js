import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import requestIp from "request-ip";
import cookieParser from "cookie-parser";
import { createServer } from "http";
import { serializeDb } from "./server/dbserialize.js";
import compression from "compression";
import { normalizeIp } from "./server/utils/index.js";
import { limiter } from "./server/middleware/limiter.js";
import { checkBlacklist } from "./server/middleware/blackList.js";
import { checkPermissions } from "./server/middleware/apiPermission.js";
import { writeRequestLog, writeFileAccessedLog } from "./server/logManager.js";
import { MEDIA_FULL_PATH, THUMB_FULL_PATH, MEDIA_ROUTE, ENTRY_ROUTE_REGEX } from "./serverConfig.js";
import { pathNormalizer } from "./server/middleware/pathNormalizer.js";
import { wsInit } from "./server/websocketManager.js";
import { tryRegister } from "./server/userManager.js";
import adminRoutes from "./server/routes/adminRoutes.js";
import logRoutes from "./server/routes/logRoutes.js";
import userRoutes from "./server/routes/userRoutes.js";
import staticRoutes from "./server/routes/staticRoutes.js";
import {  encryptResponseMiddleware as encryptResponse, decryptRequestMiddleware as decryptRequest  } from "./server/middleware/encryptHttp.js";

serializeDb();

// 获取当前文件的目录名
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 7777;

const httpServer = createServer(app);

app.set("trust proxy", 1);

// 创建上传和缩略图目录
if (!fs.existsSync(MEDIA_FULL_PATH)) {
  fs.mkdirSync(MEDIA_FULL_PATH);
}

if (!fs.existsSync(THUMB_FULL_PATH)) {
  fs.mkdirSync(THUMB_FULL_PATH);
}

app.use(express.json({ limit: "3mb" }));
app.use(decryptRequest);

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

app.use("", staticRoutes);

app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "static")));
app.use(pathNormalizer);
app.use(encryptResponse);
app.use(writeRequestLog);

wsInit(httpServer);

app.use("/i/admin", adminRoutes);
app.use("/i/logs", logRoutes);
app.use("/i/user", userRoutes);

// 处理所有非API路由，返回index.html，支持前端路由
app.get(ENTRY_ROUTE_REGEX, (req, res) => {
  res.sendFile(path.join(__dirname, "static", "index.html"));
});

httpServer.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
