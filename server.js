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
import { getIpByReq, getUserIdByReq } from "./server/utils/index.js";
import { limiter } from "./server/middleware/limiter.js";
import { checkBlacklist } from "./server/middleware/blackList.js";
import { checkPermissions } from "./server/middleware/apiPermission.js";
import { validateFingerprint, validateSalt } from "./server/middleware/fingerprintValidator.js";
import { writeRequestLog, writeFileAccessedLog } from "./server/logManager.js";
import { MEDIA_FULL_PATH, THUMB_FULL_PATH, MEDIA_ROUTE, ENTRY_ROUTE_REGEX } from "./serverConfig.js";
import { wsInit } from "./server/websocketManager.js";
import adminRoutes from "./server/routes/adminRoutes.js";
import logRoutes from "./server/routes/logRoutes.js";
import userRoutes from "./server/routes/userRoutes.js";
import staticRoutes from "./server/routes/staticRoutes.js";
import mediaHelperRoutes from "./server/routes/mediaHelperRoutes.js";
import { encryptResponseMiddleware as encryptResponse, decryptRequestMiddleware as decryptRequest } from "./server/middleware/encryptHttp.js";
import { sqlInjectionProtection, contentSecurityPolicy, csrfProtection, securityHeaders, validateFilePath } from "./server/middleware/security.js";


serializeDb();

// 获取当前文件的目录名
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 7777;

const httpServer = createServer(app);

app.set("trust proxy", 1);

// 创建上传和缩略图目录
if (!fs.existsSync(MEDIA_FULL_PATH)) {
  fs.mkdirSync(MEDIA_FULL_PATH);
}

if (!fs.existsSync(THUMB_FULL_PATH)) {
  fs.mkdirSync(THUMB_FULL_PATH);
}

// 基础
app.use(express.json({ limit: "3mb" }));
app.use(compression({
  filter: (req, res) => {
    if (req.headers["x-no-compression"]) {
      return false;
    }
    return compression.filter(req, res);
  }
}));
app.use(cors());
app.use(cookieParser());
app.use(requestIp.mw());

// 黑名单
app.use(checkBlacklist);
app.use(limiter);

// 应用安全中间件
app.use(csrfProtection);
app.use(securityHeaders);
app.use(contentSecurityPolicy);

// 解密相关
app.use("/i/", validateFingerprint, validateSalt);
app.use(decryptRequest);

// 依赖解密后的安全中间件
app.use(sqlInjectionProtection);
app.use(validateFilePath);

// 权限
app.use(checkPermissions);

// 日志
app.use(`${MEDIA_ROUTE}/`, (req, res, next) => {
  const path = decodeURIComponent(req.path);
  const userIp = getIpByReq(req);
  const userId = getUserIdByReq(req);
  if (!userId) {
    res.status(401).send({ message: "请求失败" });
    return;
  }
  writeFileAccessedLog({
    userId,
    userIp,
    filePath: path,
  });
  next();
});
app.use("/i/", writeRequestLog);

// 静态资源
app.use("", staticRoutes);
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "static")));

// res.json改写(加密)
app.use(encryptResponse);

// API路由
app.use("/i/admin", adminRoutes);
app.use("/i/logs", logRoutes);
app.use("/i/user", userRoutes);
app.use("/i/media", mediaHelperRoutes);

wsInit(httpServer);

// 处理所有非API路由，返回index.html，支持前端路由
app.get(ENTRY_ROUTE_REGEX, (req, res) => {
  res.sendFile(path.join(__dirname, "static", "index.html"));
});

app.use((err, req, res, next) => {
  console.error(err) // 仅输出在服务端日志
  res.status(500).json({
    code: 500,
    message: '服务器内部错误'  // 不暴露 err.stack 给前端
  })
})

httpServer.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
