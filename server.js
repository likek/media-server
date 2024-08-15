import chalk from 'chalk';
import express from 'express';
import multer from 'multer';
import cors from 'cors';
import fs from 'fs';
import path, { resolve } from 'path';
import ffmpeg from 'fluent-ffmpeg';
import extract from 'extract-zip';
import iconv from 'iconv-lite'
import jschardet from 'jschardet'
import readline from 'readline'
import { fileURLToPath } from 'url';
import requestIp from 'request-ip'
import useragent from 'useragent';
import Searcher from './ip2region.js'
import { rateLimit } from 'express-rate-limit'
import cookieParser from 'cookie-parser';
import cookie from 'cookie';
import { v4 as uuidv4 } from 'uuid';
import { createServer, get } from 'http';
import WebSocket, { WebSocketServer } from 'ws';
import db from './dbserialize.js';
import { exec } from 'child_process';
import compression from 'compression';

// 获取当前文件的目录名
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 7777;
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const THUMB_DIR = path.join(__dirname, 'thumbnails');
const cacheFilePath = path.join(__dirname, 'cache.json');
const permissionsFilePath = path.join(__dirname, 'permission.json');
let permissions = {};
const folderLockConfigPath = path.join(__dirname, 'folderLockCfg.json');
let folderLockConfig = {}

const regineDBPath =  path.join(__dirname, 'ip2region.xdb');
const vectorIndex = Searcher.loadVectorIndexFromFile(regineDBPath)
const searcher = Searcher.newWithVectorIndex(regineDBPath, vectorIndex)

const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer });
const clientsById = new Map();

const config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));
const maxRequestsPerMinute = config.maxRequestsPerMinute;
const blacklistDurationMs = config.blacklistDurationMs;

app.set('trust proxy', 1);

const normalizeIp = (ip) => {
    if (!ip) {
        return 'unknown ip';
    }
    if (ip.startsWith('::ffff:')) {
        return ip.substring(7);
    }
    return ip;
};

let limiterQueue = Promise.resolve()
const limiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: maxRequestsPerMinute,
    handler: (req, res, next) => {
        limiterQueue = limiterQueue.finally(() => {
            return new Promise((resolve, reject) => {
                const ip = normalizeIp(req.clientIp || req.ip);
                const addedTime = new Date().toISOString();
                const cookies = req.cookies;
                const userId = cookies.userId;
                
                // 检查是否存在相同 userId 且 enabled 为 1 的记录
                db.get('SELECT * FROM blacklist WHERE userId = ? AND enabled = 1', [userId], (err, row) => {
                    if (err) {
                        console.error('查询黑名单出错: ', err);
                        res.status(500).json({ message: '内部服务器错误' });
                        return reject();
                    }
        
                    if (row) {
                        // 如果存在，不进行插入操作
                        res.status(429).json({
                            message: `请求过于频繁，您已被列入黑名单，${blacklistDurationMs / 1000}秒后解除。`,
                        });
                        return resolve();
                    } else {
                        // 插入新的记录
                        db.run('INSERT INTO blacklist (ip, cookies, userId, added_time, enabled) VALUES (?, ?, ?, ?, 1)', [ip, JSON.stringify(cookies), userId, addedTime], function (err) {
                            if (err) {
                                console.error('插入黑名单出错: ', err);
                                res.status(500).json({ message: '内部服务器错误' });
                                return reject();
                            }
                            res.status(429).json({
                                message: `请求过于频繁，您已被列入黑名单，${blacklistDurationMs / 1000}秒后解除。`,
                            });
                            return resolve();
                        });
                    }
                });
            })
        })
    },
});

function checkBlacklist(req, res, next) {
    const currentTime = Date.now();
    const cookies = req.cookies;
    const userId = cookies.userId;
    db.get('SELECT added_time FROM blacklist WHERE userId = ? AND enabled = 1', [userId], (err, row) => {
        if (err) {
            console.error('查询黑名单出错: ', err);
            return res.status(500).json({ message: '内部服务器错误' });
        }
        if (row) {
            const duration = currentTime - new Date(row.added_time).getTime();
            if (duration > blacklistDurationMs) {
                // 黑名单时间已过，逻辑删除IP
                db.run('UPDATE blacklist SET enabled = 0 WHERE userId = ?', [userId], (err) => {
                    if (err) {
                        console.error('移除IP出错: ', err);
                        return res.status(500).json({ message: '内部服务器错误' });
                    }
                    next();
                });
            } else {
                const black_time_left = Math.floor((blacklistDurationMs - duration) / 1000);
                return res.status(403).json({
                    message: `您已被列入黑名单，无法访问该资源，${black_time_left}秒后解除。`,
                    black_time_left,
                });
            }
        } else {
            next();
        }
    });
}


const checkPermissions = (req, res, next) => {
    loadPermissions();

    const userIp = normalizeIp(req.clientIp || req.ip);
    let userId = req.cookies.userId;
    const requestUrl = req.originalUrl.split('?')[0];
    const allowedUsers = permissions[requestUrl];
    if (!allowedUsers) {
        return next();
    }

    if (allowedUsers === '*') {
        return next();
    }

    if (allowedUsers.includes(userId) || allowedUsers.includes(userIp)) {
        return next();
    }

    res.status(403).json({ message: '请联系管理员为你添加该权限' });
};
// 配置 multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const currentPath = req.query.path || '';
        const uploadPath = path.join(UPLOAD_DIR, currentPath);

        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }

        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        const filename = Buffer.from(file.originalname, 'latin1').toString('utf-8')
        const info = path.parse(filename);
        cb(null, `${info.name}(${Date.now()})${info.ext}`);
    }
});

const upload = multer({ storage });



const writeRequestLogToDB = (logData) => {
    // 插入日志到数据库
    const query = `
        INSERT INTO logs_request (
          requestTime, userIp, requestMethod, requestUrl, requestBody, status, userAgent, region, device, os, browser, timestamp
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
    const values = [
      logData.requestTime,
      logData.userIp,
      logData.requestMethod,
      logData.requestUrl,
      logData.requestBody,
      logData.status,
      logData.userAgent,
      logData.region,
      logData.device,
      logData.os,
      logData.browser,
      logData.timestamp,
    ];

    db.run(query, values, (err) => {
      if (err) {
        console.error("Failed to insert log into database (logs_request):", err);
      }
    });
};

const writeWsLogToDB = (logData) => {
    const query = `
    INSERT INTO logs_ws (
      time, action, userId, userIp, userRegion
    ) VALUES (?, ?, ?, ?, ?)
  `;

  const values = [
    new Date().toISOString(),
    logData.action || '',
    logData.userId || '',
    logData.userIp || '',
    logData.userRegion || ''
  ];

  db.run(query, values, (err) => {
    if (err) {
      console.error("Failed to insert log into database (logs_ws):", err);
    }
  });
};

const writeFileAccessedLogToDB = (logData) => {
    const query = `
    INSERT INTO logs_file_accessed (
      time, userId, userIp, filePath
    ) VALUES (?, ?, ?, ?)
  `;

  const values = [
    new Date().toISOString(),
    logData.userId || '',
    logData.userIp || '',
    logData.filePath || ''
  ];

  db.run(query, values, (err) => {
    if (err) {
      console.error("Failed to insert log into database (logs_ws):", err);
    }
  });
};

// 创建上传和缩略图目录
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR);
}

if (!fs.existsSync(THUMB_DIR)) {
    fs.mkdirSync(THUMB_DIR);
}

app.use(compression({ filter: shouldCompress }))
 
function shouldCompress (req, res) {
  if (req.headers['x-no-compression']) {
    return false
  }
 
  return compression.filter(req, res)
}
app.use(cookieParser());
app.use(checkBlacklist);
app.use(limiter);
app.use(cors());
app.use(requestIp.mw());
app.use(checkPermissions);

app.use((req, res, next) => {
    const path = decodeURIComponent(req.path);
    if(path.startsWith('/uploads/')) {
        const userIp = normalizeIp(req.clientIp || req.ip)
        console.log(`File accessed: ${path}, userId: `, req.cookies?.userId, userIp);
        writeFileAccessedLogToDB({
            userId: req.cookies?.userId,
            userIp,
            filePath: path
        });
        if(!req.cookies?.userId) {
            console.log('尝试注册');
            tryRegister(req, res).catch(e => {
                console.error('注册失败: ', e);
            })
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


const getRequestInfo = async (req, res) => {
    const requestTime = new Date().toISOString();
    const userIp = normalizeIp(req.clientIp || req.ip);
    const requestMethod = req.method;
    const requestUrl = decodeURIComponent(req.originalUrl);
    const requestBody = decodeURIComponent(JSON.stringify(req.body));
    const status = res?.statusCode;

    let region = '';
    try {
        region = (await searcher.search(userIp))?.region || 'unknown';
    } catch (e) {
        console.error('获取ip属地出错: ', e);
    }

    const userAgentString = req.headers['user-agent'];
    const userAgent = useragent.parse(userAgentString);

    const deviceInfo = {
        device: userAgent.device.toString(),
        os: userAgent.os.toString(),
        browser: userAgent.toAgent()
    };

    const data = {
        requestTime,
        userIp,
        requestMethod,
        requestUrl,
        requestBody,
        status,
        userAgent: userAgentString,
        region,
        device: deviceInfo.device,
        os: deviceInfo.os,
        browser: deviceInfo.browser,
        timestamp: new Date().toISOString()
    };
    
    return data;
};

const loadPermissions = () => {
    try {
        const data = fs.readFileSync(permissionsFilePath, 'utf8');
        permissions = JSON.parse(data);
    } catch (err) {
        console.error('Failed to load permissions, using default permissions:', err);
        permissions = {};
    }
};

loadPermissions();

const loadFolderLockConfig = () => {
    try {
        const data = fs.readFileSync(folderLockConfigPath, 'utf8');
        folderLockConfig = JSON.parse(data);
    } catch (err) {
        console.error('Failed to load permissions, using default permissions:', err);
        folderLockConfig = {};
    }
};

loadFolderLockConfig();

app.use('/uploads', express.static(UPLOAD_DIR));
app.use('/thumbnails', express.static(THUMB_DIR));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'static')));
app.use(pathNormalizer);

app.use(async (req, res, next) => {
    res.on('finish', async () => {
        if(!req.path.startsWith('/uploads/')) {
            const data = await getRequestInfo(req, res);
            console.log([
                chalk.blue(`${new Date(data.requestTime).toLocaleString()}`),
                chalk.green(`${data.userIp}`),
                chalk.green(`${data.region}`),
                chalk.yellow(`${data.requestMethod} ${data.requestUrl}`),
                chalk.cyan(`${data.requestBody}`),
                chalk.magenta(`${data.status}`),
                chalk.gray(`${data.device}`),
                chalk.gray(`${data.os}`),
                chalk.gray(`${data.browser}`),
                chalk.gray(`${data.userAgent}`)
            ].join(' | '))
    
            writeRequestLogToDB(data);
        }
    })
    next();
});

app.use((req, res, next) => {
    if (!req.body) {
        return next()
    }
    const requestUrl = req.originalUrl.split('?')[0];
    let sourcePath = '';
    let targetPath = '';
    if (requestUrl ==='/move') {
        const { filename, targetFolder, currentPath } = req.body || {};
        sourcePath = `${currentPath}/${filename}`
        targetPath = `${targetFolder}/${filename}`
    } else if(requestUrl === '/delete') {
        const { filename, path: currentPath } = req.body;
        sourcePath = `${currentPath}/${filename}`
    } else if(requestUrl === '/rename') {
        const { path: currentPath, oldName, newName, type } = req.body;
        sourcePath = `${currentPath}/${oldName}`
        targetPath = `${currentPath}/${newName}`
    } else if (requestUrl === '/files'){
        sourcePath = req.body?.path || ''
    } else {
        return next()
    }

    if(sourcePath?.startsWith('/')) {
        sourcePath = sourcePath.slice(1)
    }

    
    if(targetPath?.startsWith('/')) {
        targetPath = targetPath.slice(1)
    }

    loadFolderLockConfig();
    const sourceCfgPw = folderLockConfig[sourcePath]?.pw
    const targetCfgPw = targetPath && folderLockConfig[targetPath]?.pw

    if (requestUrl === '/move' || requestUrl === '/rename') {
        if (sourceCfgPw) {
            return res.status(403).send({ message: '源文件夹/文件不支持该操作' })
        }
    
        if (targetCfgPw) {
            return res.status(403).send({ message: '目标文件夹/文件不支持该操作' })
        }
    }

    if (!sourceCfgPw) {
        return next()
    }
    const lockRoutes = folderLockConfig[sourcePath].routes || ["/files", "/delete", "/rename"]
    if (lockRoutes.includes(requestUrl)) {
        if(!sourcePath) {
            return next()
        }
        const pw = req.body.pw
        if (sourceCfgPw && sourceCfgPw !== pw) {
            return res.status(403).send({ lock: true, message: !pw ? `该文件夹的操作需要密码` : '密码错误' });
        }
    }
    return next()
})

// 缓存对象
let cache = {};
// 尝试从cache.json文件中读取缓存
function loadCache() {
    if (fs.existsSync(cacheFilePath)) {
        const data = fs.readFileSync(cacheFilePath, 'utf8');
        try {
            cache = JSON.parse(data);
            console.log('Cache loaded from cache.json');
        } catch (error) {
            console.error('Error parsing cache.json:', error);
        }
    } else {
        console.log('No cache.json found, initializing empty cache');
    }
}

loadCache();

// 缓存管理函数
const updateCache = async (dirPath, req) => {
    if(dirPath.startsWith('/')) {
        dirPath = dirPath.slice(1)
    }
    const oldFileInfosStr = JSON.stringify(cache[dirPath] || []);
    const fullPath = path.join(UPLOAD_DIR, dirPath);
    const files = await new Promise((resolve, reject) => {
        fs.readdir(fullPath, (err, files) => {
            if (err) return reject(err);
            resolve(files);
        });
    });

    const fileInfos = await Promise.all(files.map(async (file) => {
        const filePath = path.join(fullPath, file);
        const stats = await fs.promises.stat(filePath);

        if (stats.isDirectory()) {
            return {
                type: 'folder',
                filename: file,
                path: path.join(dirPath, file).replace(/\\/g, '/'),
                lastModified: stats.mtime,
                size: stats.size
            };
        } else {
            const thumbnailPath = path.join(THUMB_DIR, dirPath, file + '.png');
            let thumbnail = null;

            if (fs.existsSync(thumbnailPath)) {
                thumbnail = '/thumbnails/' + path.join(dirPath, file + '.png');
            } else if (isVideo(file)) {
                await generateThumbnail(filePath, thumbnailPath);
                thumbnail = '/thumbnails/' + path.join(dirPath, file + '.png');
            }

            return {
                filename: '/uploads/' + path.join(dirPath, file),
                thumbnail: thumbnail,
                lastModified: stats.mtime,
                size: stats.size,
                type: 'file'
            };
        }
    }));

    fileInfos.sort((a, b) => {
        const isFolder = file => file.type === 'folder';
        const isVideo = file => ['mp4', 'webm', 'ogg', 'ts'].includes(file.filename.split('.').pop().toLowerCase());
        const isImage = file => ['jpg', 'jpeg', 'png', 'gif'].includes(file.filename.split('.').pop().toLowerCase());

        if (isFolder(a) && !isFolder(b)) return -1;
        if (!isFolder(a) && isFolder(b)) return 1;

        if (isVideo(a) && !isVideo(b)) return -1;
        if (!isVideo(a) && isVideo(b)) return 1;

        if (isImage(a) && !isImage(b)) return -1;
        if (!isImage(a) && isImage(b)) return 1;

        return new Date(b.lastModified) - new Date(a.lastModified);
    });

    if (oldFileInfosStr !== JSON.stringify(fileInfos)) {
        cache[dirPath] = fileInfos;
        fs.writeFileSync(cacheFilePath, JSON.stringify(cache), 'utf8');
        broadcastMessage({event: 'updateCache', data: { dirPath, fileInfos }}, req)
    }
};

const invalidateCache = (dirPath) => {
    if(dirPath.startsWith('/')) {
        dirPath = dirPath.slice(1)
    }
    delete cache[dirPath];
};


wss.on('connection', async (ws, req) => {
    const cookies = cookie.parse(req.headers.cookie || '');

    let ipAddress = req.clientIp || req.ip;
    if (!ipAddress) {
        if (req.headers['x-forwarded-for']) {
            ipAddress = req.headers['x-forwarded-for'].split(',')[0];
        } else if (req.headers['x-real-ip']) {
            ipAddress = req.headers['x-real-ip'];
        } else if (req.connection.remoteAddress) {
            ipAddress = req.connection.remoteAddress;
        }
    }
    ipAddress = normalizeIp(ipAddress);
    const userId = cookies.userId;

    let region = '';

    clientsById.set(userId, ws);
    ws.on('close', () => {
        clientsById.delete(userId);
        console.log(`[${new Date().toLocaleString()}] 用户${chalk.yellow('已断开')}: [${userId}] - [${ipAddress}] - [${region}]`);
        writeWsLogToDB({
            userId,
            userIp: ipAddress,
            userRegion: region,
            action: 'disconnect'
        });
    });

    ws.on('error', function error(err) {
        console.error('WebSocket error:', err);
    });

    try {
        region = (await searcher.search(ipAddress))?.region || 'unknown';
    } catch (e) {
        console.error('获取ip属地出错: ', e);
    }
    console.log(`[${new Date().toLocaleString()}] 用户${chalk.green('已连接')}: [${userId}] - [${ipAddress}] - [${region}]`);
    writeWsLogToDB({
        userId,
        userIp: ipAddress,
        userRegion: region,
        action: 'connect'
    });
});

async function tryRegister(req, res) {
    let userId = req.cookies.userId;

    if (!userId) {
        userId = uuidv4();
        res.cookie('userId', userId, {
            maxAge: 3650 * 24 * 60 * 60 * 1000,
            httpOnly: true,
            sameSite: 'strict'
        });
    }

    const userInfo = await getRequestInfo(req);
    db.run(`INSERT OR IGNORE INTO userInfo (userId, ip, create_time, update_time, userAgent, region, device, os, browser) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
        userId,
        userInfo.userIp,
        userInfo.requestTime,
        userInfo.requestTime,
        userInfo.userAgent,
        userInfo.region,
        userInfo.device,
        userInfo.os,
        userInfo.browser
    ], (err) => {
        if (err) {
            console.error('Error inserting user info:', err);
        }
    });

    // 修改除create_time外的其他所有字段
    db.run(`UPDATE userInfo SET ip = ?, update_time = ?, userAgent = ?, region = ?, device = ?, os = ?, browser = ? WHERE userId = ?`, [
        userInfo.userIp,
        userInfo.requestTime,
        userInfo.userAgent,
        userInfo.region,
        userInfo.device,
        userInfo.os,
        userInfo.browser,
        userId
    ],(err) => {
        if (err) {
            console.error('Error updating user info:', err);
        }
    })
    return userId;
}

app.get('/register', async (req, res) => {
    await tryRegister(req, res);
    res.send({ success: true });
});

app.post('/users', async (req, res) => {
    try {
        const page = req.body.page || 1;
        const limit = req.body.limit || 10;
        const offset = (page - 1) * limit;

        // 查询总记录数
        const countQuery = `SELECT COUNT(*) AS total FROM userInfo`;
        db.get(countQuery, [], (err, row) => {
            if (err) {
                console.error('Error executing count query:', err);
                return res.status(500).send({ message: 'Database error' });
            }

            // 分页查询
            const query = `
                SELECT * FROM userInfo
                ORDER BY update_time DESC
                LIMIT ? OFFSET ?
            `;
            
            db.all(query, [limit, offset], (err, rows) => {
                if (err) {
                    console.error('Error executing query:', err);
                    return res.status(500).send({ message: 'Database error' });
                }
                
                // 返回结果包括数据和总数
                res.json({ data: rows, count: row.total });
            });
        });
    } catch (error) {
        console.error('Error handling request:', error);
        res.status(500).send({ message: 'Internal server error' });
    }
});


app.post('/downloadFromText', async (req, res) => {
    const text = req.body.text || '';
  
    const urlRegex = /https?:\/\/[^\s]+/g;
    const allLinks = text.match(urlRegex) || [];
    const validLinkRegex = /https?:\/\/[^\s]+?\.(m3u8|pdf|mp4|mov|png|jpg|mp3|txt|zip|exe|apk)(\?[^\s]*)?/i;
    
    const links = allLinks.filter(link => validLinkRegex.test(link));
    const ignoreLinks = allLinks.filter(link => !validLinkRegex.test(link));
  
    // 获取51cg: JSON.parse(document.querySelector(`.dplayer[data-config]`).dataset.config).video.url
    if (links.length === 0) {
      return res.status(400).json({ error: '没有找到任何有效的链接', ignoreLinks });
    }
  
    console.log('开始批量下载资源: ', links);
  
    const downloadRoot = '从文本中链接提取的资源';
    const downloadSub = `${new Date().toLocaleString().replace(/[:.\/\s]/g, '_')}_${uuidv4()}`;
    const downloadDir = path.join(__dirname, 'uploads', downloadRoot, downloadSub);
    fs.mkdirSync(downloadDir, { recursive: true });
  
    const failedLinks = [];
    let completedCount = 0;
  
    const downloadLink = (link) => {
      return new Promise((resolve) => {
        const tempDir = path.join(__dirname, 'temp', 'batch_download', `${Date.now()}`);
        const command = link.endsWith('.m3u8')
          ? `N_m3u8DL-RE "${link}" --save-dir "${downloadDir}" --save-name ${path.basename(link)} --tmp-dir ${tempDir}`
          : `curl -L "${link}" -o "${path.join(downloadDir, path.basename(link))}"`;
        
        exec(command, (error, stdout, stderr) => {
          let failed = false;
          if (error || stdout.includes('One or more errors occurred')) {
            failed = true;
            console.error(`下载链接失败: ${link}\n${stdout}\n${stderr}`);
            failedLinks.push(link);
          } else {
            failed = false;
            console.log(`下载成功: ${link}`);
          }
          completedCount++;
  
          // 通知前端下载进度
          broadcastMessage({
            event: 'downloadProgress',
            data: {
              link,
              progress: completedCount,
              total: links.length,
              state: failed ? 'failed' : 'success',
            },
          }, req, true);
          resolve();
        });
      });
    };
  
    // 并行下载所有链接
    await Promise.all(links.map(downloadLink));
    await updateCache(downloadRoot, req);
    await updateCache(`${downloadRoot}/${downloadSub}`, req);
    res.json({ failedLinks, successCount: completedCount - failedLinks.length, downloadRoot, downloadSub, ignoreLinks });
  });
  


// 上传文件并生成缩略图
app.post('/upload', upload.single('file'), async (req, res) => {
    const currentPath = req.query.path || '';
    const filename = Buffer.from(req.file.filename, 'latin1').toString('utf-8')
    const filePath = path.join(UPLOAD_DIR, currentPath, filename);

    // 确保缩略图目录存在
    const thumbnailDir = path.join(THUMB_DIR, currentPath);
    if (!fs.existsSync(thumbnailDir)) {
        fs.mkdirSync(thumbnailDir, { recursive: true });
    }

    // 如果是视频文件，生成缩略图
    if (req.file.mimetype.startsWith('video/')) {
        const thumbnailPath = path.join(thumbnailDir, filename + '.png');
        try {
            await generateThumbnail(filePath, thumbnailPath);
            await updateCache(currentPath, req); // 更新缓存
            res.send({
                filename: '/uploads/' + currentPath + '/' + filename,
                thumbnail: '/thumbnails/' + currentPath + '/' + filename + '.png'
            });
        } catch (err) {
            console.error('Error generating thumbnail:', err);
            res.send({ filename: '/uploads/' + currentPath + '/' + filename });
        }
    } else {
        await updateCache(currentPath, req); // 更新缓存
        res.send({ filename: '/uploads/' + currentPath + '/' + filename });
    }
});

// 获取文件列表
app.post('/files', async (req, res) => {
    const reqPath = req.body.path || '';
    const page = parseInt(req.body.page) || 0;
    const pageSize = parseInt(req.body.pageSize); // 每页文件数

    // 从缓存中获取数据
    if (cache[reqPath]) {
        if (!pageSize || pageSize === -1) {
            return res.send(cache[reqPath]);
        }
        return res.send(cache[reqPath].slice(page * pageSize, (page + 1) * pageSize));
    }

    try {
        await updateCache(reqPath, req);
        const result = cache[reqPath] || []
        if (!pageSize || pageSize === -1) {
            return res.send(result);
        }
        return res.send(result.slice(page * pageSize, (page + 1) * pageSize));
    } catch (err) {
        console.error('Error fetching file list:', err);
        res.status(500).send({ message: 'Failed to fetch file list.' });
    }
});

app.post('/search', (req, res) => {
    let { query, path: searchPath } = req.body;

    if (!query) {
        return res.status(400).json({ message: 'Query is required' });
    }

    if (!searchPath) {
        searchPath = ''
    }

    const result = [];
    for (const folder of Object.keys(cache)) {
        if (folder.startsWith(searchPath)) {
            const items = cache[folder]
            items.forEach(item => {
                const filename = path.basename(item.filename);
                if (filename.includes(query)) {
                    result.push({
                        ...item,
                        folder
                    });
                }
            });
        }
    }

    res.send(result);
});


// 生成视频文件缩略图
async function generateThumbnail(filePath, thumbnailPath) {
    // 确保缩略图目录存在
    const thumbnailDir = path.dirname(thumbnailPath);
    if (!fs.existsSync(thumbnailDir)) {
        fs.mkdirSync(thumbnailDir, { recursive: true });
    }

    return new Promise((resolve, reject) => {
        ffmpeg(filePath)
            // windows上是取视频中间位置帧
            .screenshots({
                count: 1,
                folder: thumbnailDir,
                filename: path.basename(thumbnailPath),
                size: '320x240'
            })
            .on('end', () => resolve(true))
            .on('error', err => {
                console.error('Error generating thumbnail:', err);
                resolve(false);
            });

            // 下面是强制取第1帧
            // .on('end', () => resolve(true))
            // .on('error', err => {
            //     console.error('Error generating thumbnail:', err);
            //     resolve(false);
            // })
            // .output(path.join(thumbnailDir, path.basename(thumbnailPath)))
            // .outputOptions('-vf', 'thumbnail', '-frames:v', '1', '-s', '320x240')
            // .run();
    });
}

// 删除文件或文件夹
app.post('/delete', async (req, res) => {
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
        await updateCache(currentPath, req); // 更新缓存
        res.send({ message: `${type} deleted successfully` });
    } catch (err) {
        console.error(`Error deleting ${type}:`, err);
        res.status(500).send({ message: `Failed to delete ${type}` });
    }
});

// 新建文件夹
app.post('/createFolder', (req, res) => {
    const { path: currentPath, folderName } = req.body;
    const folderPath = path.join(UPLOAD_DIR, currentPath, folderName);

    if (fs.existsSync(folderPath)) {
        return res.status(400).send({ message: 'Folder already exists' });
    }

    fs.mkdir(folderPath, { recursive: true }, async (err) => {
        if (err) {
            console.error('Error creating folder:', err);
            return res.status(500).send({ message: 'Failed to create folder' });
        }

        await updateCache(currentPath, req); // 更新缓存

        res.send({ message: 'Folder created successfully' });
    });
});

// 重命名文件或文件夹
app.post('/rename', (req, res) => {
    const { path: currentPath, oldName, newName, type } = req.body;
    const oldPath = path.join(UPLOAD_DIR, currentPath, oldName);
    const newPath = path.join(UPLOAD_DIR, currentPath, newName);

    if (fs.existsSync(newPath)) {
        return res.status(400).send({ message: `${type} with the same name already exists` });
    }

    fs.rename(oldPath, newPath, async (err) => {
        if (err) {
            console.error(`Error renaming ${type}:`, err);
            return res.status(500).send({ message: `Failed to rename ${type}` });
        }

        invalidateCache(`${currentPath}/${oldName}`) // 如果rename的是文件夹，则该文件夹对应的缓存不应该再继续存在
        await updateCache(currentPath, req); // 更新缓存

        res.send({ message: `${type} renamed successfully` });
    });
});

app.post('/updateCache', async (req, res) => {
    try {
        const currentPath = req.body.path || '';
        await updateCache(currentPath, req);
        // res.send(cache[currentPath]);
        res.send({ message: 'Update cache successfully' });
    } catch (error) {
        console.error('Error updating cache:', error);
        res.status(500).send({message: 'Failed to update cache'});
    }
});

app.post('/move', (req, res) => {
    const { filename, targetFolder, currentPath } = req.body;

    const sourcePath = path.join(__dirname, 'uploads', currentPath, filename);
    const destinationPath = path.join(__dirname, 'uploads', targetFolder, filename);

    if (!fs.existsSync(sourcePath)) {
        return res.status(400).json({ message: 'Source file/folder does not exist' });
    }

    if (!fs.existsSync(path.join(__dirname, 'uploads', targetFolder))) {
        return res.status(400).json({ message: 'Target folder does not exist' });
    }

    fs.rename(sourcePath, destinationPath, async (err) => {
        if (err) {
            console.error('Error moving file/folder:', err);
            return res.status(500).json({ message: 'Error moving file/folder' });
        }

        invalidateCache(`${currentPath}/${filename}`) // 如果是文件夹，则该文件夹对应的缓存不应该再继续存在
        await updateCache(currentPath, req); // 更新缓存
        await updateCache(targetFolder.replace(/^\/+/, ''), req); // 更新缓存
        res.json({ success: true });
    });
});

app.post('/convert', (req, res) => {
    const { inputFilePath, outputFilePath } = req.body;

    const absoluteInputPath = path.join(UPLOAD_DIR, inputFilePath);
    const absoluteOutputPath = path.join(UPLOAD_DIR, outputFilePath);

    if (!fs.existsSync(absoluteInputPath)) {
        return res.status(400).json({ message: 'Input file does not exist' });
    }

    if (fs.existsSync(absoluteOutputPath)) {
        return res.status(400).json({ message: 'Output file already exists' });
    }

    ffmpeg(absoluteInputPath)
        .outputOptions('-c:v', 'h264_nvenc', '-preset', 'fast', '-b:v', '2M', '-threads', '8')
        .save(absoluteOutputPath)
        .on('end', async () => {
            const currentPath = path.dirname(inputFilePath);
            await updateCache(currentPath, req); // 更新缓存
            res.json({ outputFilePath: outputFilePath });
        })
        .on('error', (err) => {
            console.error('Error during conversion:', err);
            res.status(500).json({ message: 'Conversion failed' });
        })
});

app.post('/unzip', async (req, res) => {
    const { zipFilePath } = req.body;
    const currentPath = path.dirname(zipFilePath)
    const absoluteZipPath = path.join(UPLOAD_DIR, zipFilePath);
    const extractToPath = path.join(UPLOAD_DIR, currentPath);

    if (!fs.existsSync(absoluteZipPath)) {
        return res.status(400).json({ message: 'Zip file does not exist' });
    }

    const fileExtension = path.extname(zipFilePath).toLowerCase();

    if (fileExtension === '.zip') {
        extract(absoluteZipPath, { dir: extractToPath })
            .then(async () => {
                await updateCache(currentPath, req);
                res.json({ message: 'File unzipped successfully', success: true });
            })
            .catch(err => {
                console.error('Error during unzipping:', err);
                res.status(500).json({ message: 'Unzipping failed' });
            });
    } else if (fileExtension === '.rar') {
        res.status(500).json({ message: '暂不支持rar解压' });
    } else {
        res.status(400).json({ message: 'Unsupported file type' });
    }
});

app.post('/readTextFile', (req, res) => {
    const { filePath, start = 0, numLines = 50, encoding = 'utf8' } = req.body;
    const absoluteFilePath = path.join(UPLOAD_DIR, filePath);

    if (!fs.existsSync(absoluteFilePath)) {
        return res.status(400).json({ message: 'File does not exist' });
    }

    let lineCount = 0;
    let lines = [];
    let totalLines = 0; // 记录文件总行数
    const readStream = fs.createReadStream(absoluteFilePath, { encoding });
    const rl = readline.createInterface({
        input: readStream,
        crlfDelay: Infinity,
    });

    rl.on('line', (line) => {
        totalLines++; // 计算总行数
        if (lineCount >= start && lines.length < numLines) {
            lines.push(line);
        }
        lineCount++;
    });

    rl.on('close', () => {
        const content = lines.join('\n');
        const isLastPage = (start + lines.length) >= totalLines; // 判断是否为最后一页
        res.setHeader('Content-Type', `application/json; charset=${encoding}`);
        res.json({ content, start: start + lines.length, numLines, isLastPage });
    });

    rl.on('error', (err) => {
        console.error('Error reading file:', err);
        res.status(500).json({ message: 'Error reading file' });
    });
});

function convertTxtEncoding(filePath, res) {
    const extname = path.extname(filePath);
    if (extname !== '.txt') {
        res.status(400).json({ message: '不是txt文件，跳过编码转换' });
        return;
    }

    fs.readFile(filePath, (err, data) => {
        if (err) {
            console.error('读取文件失败:', err);
            res.status(500).json({ message: '读取文件失败' });
            return;
        }

        // 检测文件编码
        const detectedEncoding = jschardet.detect(data).encoding;
        if (!detectedEncoding) {
            res.status(500).json({ message: '文件编码检测失败' });
            return;
        }

        // 判断文件是否为UTF-8编码
        if (detectedEncoding.toLowerCase() === 'utf-8') {
            res.json({ message: '已经是UTF-8编码' });
            return;
        }

        // 将文件内容从原编码转换为UTF-8
        const content = iconv.decode(data, detectedEncoding);
        const utf8Content = iconv.encode(content, 'utf-8');

        // 将转换后的内容写入文件
        fs.writeFile(filePath, utf8Content, err => {
            if (err) {
                console.error('写入文件失败:', err);
                res.status(500).json({ message: '写入文件失败' });
                return;
            }
            res.json({ message: '编码修改为UTF-8成功', success: true });
        });
    });
}

app.post('/convertTxtEncoding', (req, res) => {
    const { filePath } = req.body;
    const absoluteFilePath = path.join(UPLOAD_DIR, filePath);

    if (!fs.existsSync(absoluteFilePath)) {
        return res.status(400).json({ message: 'File does not exist' });
    }

    convertTxtEncoding(absoluteFilePath, res);
});

// 根路径返回 index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'static', 'index.html'));
});

httpServer.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

function pathNormalizer(req, res, next) {
    const originalSend = res.send;
    res.send = function (body) {
        if (typeof body === 'object') {
            const normalizePaths = (obj) => {
                if (Array.isArray(obj)) {
                    return obj.map(normalizePaths);
                } else if (obj !== null && typeof obj === 'object') {
                    for (let key in obj) {
                        if (typeof obj[key] === 'string') {
                            obj[key] = obj[key].replace(/\\/g, '/');
                        } else if (typeof obj[key] === 'object') {
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

function isVideo(filename) {
    return filename.endsWith('.mp4') || filename.endsWith('.ts');
}
