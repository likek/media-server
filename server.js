const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');

const app = express();
const PORT = 3000;
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const THUMB_DIR = path.join(__dirname, 'thumbnails');

// 创建上传和缩略图目录
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR);
}

if (!fs.existsSync(THUMB_DIR)) {
    fs.mkdirSync(THUMB_DIR);
}

// 缓存对象
const cache = {};

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
        const info = path.parse(file.originalname);
        cb(null, `${info.name}(${Date.now()})${info.ext}`);
    }
});

const upload = multer({ storage });

// 提供静态文件服务
app.use(cors());
app.use('/uploads', express.static(UPLOAD_DIR));
app.use('/thumbnails', express.static(THUMB_DIR));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));
app.use(pathNormalizer);

// 缓存管理函数
const updateCache = async (dirPath) => {
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

    cache[dirPath] = fileInfos;
};

const invalidateCache = (dirPath) => {
    delete cache[dirPath];
};

// 上传文件并生成缩略图
app.post('/upload', upload.single('file'), async (req, res) => {
    const currentPath = req.query.path || ''; // 从请求体获取当前路径，默认为空
    const filePath = path.join(UPLOAD_DIR, currentPath, req.file.filename);

    // 确保缩略图目录存在
    const thumbnailDir = path.join(THUMB_DIR, currentPath);
    if (!fs.existsSync(thumbnailDir)) {
        fs.mkdirSync(thumbnailDir, { recursive: true });
    }

    // 如果是视频文件，生成缩略图
    if (req.file.mimetype.startsWith('video/')) {
        const thumbnailPath = path.join(thumbnailDir, req.file.filename + '.png');
        try {
            await generateThumbnail(filePath, thumbnailPath);
            invalidateCache(currentPath); // 更新缓存
            await updateCache(currentPath); // 更新缓存
            res.send({
                filename: '/uploads/' + currentPath + '/' + req.file.filename,
                thumbnail: '/thumbnails/' + currentPath + '/' + req.file.filename + '.png'
            });
        } catch (err) {
            console.error('Error generating thumbnail:', err);
            res.send({ filename: '/uploads/' + currentPath + '/' + req.file.filename });
        }
    } else {
        invalidateCache(currentPath); // 更新缓存
        await updateCache(currentPath); // 更新缓存
        res.send({ filename: '/uploads/' + currentPath + '/' + req.file.filename });
    }
});

// 获取文件列表
app.get('/files', async (req, res) => {
    const reqPath = req.query.path || '';
    const page = parseInt(req.query.page) || 0;
    const pageSize = parseInt(req.query.pageSize); // 每页文件数

    // 从缓存中获取数据
    if (cache[reqPath]) {
        if (!pageSize || pageSize === -1) {
            return res.send(cache[reqPath]);
        }
        return res.send(cache[reqPath].slice(page * pageSize, (page + 1) * pageSize));
    }

    try {
        await updateCache(reqPath);
        if (!pageSize || pageSize === -1) {
            return res.send(cache[reqPath]);
        }
        return res.send(cache[reqPath].slice(page * pageSize, (page + 1) * pageSize));
    } catch (err) {
        console.error('Error fetching file list:', err);
        res.status(500).send('Failed to fetch file list.');
    }
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
        invalidateCache(currentPath); // 更新缓存
        await updateCache(currentPath); // 更新缓存
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

        invalidateCache(currentPath); // 更新缓存
        await updateCache(currentPath); // 更新缓存

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

        invalidateCache(currentPath); // 更新缓存
        await updateCache(currentPath); // 更新缓存

        res.send({ message: `${type} renamed successfully` });
    });
});

app.post('/updateCache', async (req, res) => {
    try {
        const currentPath = req.body.path || '';
        invalidateCache(currentPath); // 更新缓存，这里需要确保该函数能处理可能的异常
        await updateCache(currentPath); // 更新缓存，这里需要确保该函数能处理可能的异常
        // res.send(cache[currentPath]);
        res.send({ message: 'Update cache successfully' });
    } catch (error) {
        console.error('Error updating cache:', error);
        res.status(500).send('Failed to update cache');
    }
});

app.post('/move', (req, res) => {
    const { filename, targetFolder, currentPath } = req.body;

    const sourcePath = path.join(__dirname, 'uploads', currentPath, filename);
    const destinationPath = path.join(__dirname, 'uploads', targetFolder, filename);

    if (!fs.existsSync(sourcePath)) {
        return res.status(400).json({ success: false, message: 'Source file/folder does not exist' });
    }

    if (!fs.existsSync(path.join(__dirname, 'uploads', targetFolder))) {
        return res.status(400).json({ success: false, message: 'Target folder does not exist' });
    }

    fs.rename(sourcePath, destinationPath, async (err) => {
        if (err) {
            console.error('Error moving file/folder:', err);
            return res.status(500).json({ success: false, message: 'Error moving file/folder' });
        }

        invalidateCache(currentPath); // 更新缓存
        await updateCache(currentPath); // 更新缓存
        invalidateCache(targetFolder.replace(/^\/+/, '')); // 更新缓存
        await updateCache(targetFolder.replace(/^\/+/, '')); // 更新缓存
        res.json({ success: true });
    });
});

app.post('/convert', (req, res) => {
    const { inputFilePath, outputFilePath } = req.body;

    const uploadsDir = path.join(__dirname, 'uploads');
    const absoluteInputPath = path.join(uploadsDir, inputFilePath);
    const absoluteOutputPath = path.join(uploadsDir, outputFilePath);

    if (!fs.existsSync(absoluteInputPath)) {
        return res.status(400).json({ message: 'Input file does not exist' });
    }

    if (fs.existsSync(absoluteOutputPath)) {
        return res.status(400).json({ message: 'Output file already exists' });
    }

    ffmpeg(absoluteInputPath)
        // .output(absoluteOutputPath)
        // .on('end', async () => {
        //     invalidateCache(currentPath); // 更新缓存
        //     await updateCache(currentPath); // 更新缓存
        //     res.json({ outputFilePath: outputFilePath });
        // })
        // .on('error', (err) => {
        //     console.error('Error during conversion:', err);
        //     res.status(500).json({ message: 'Conversion failed' });
        // })
        // .run();

        .outputOptions('-c:v', 'h264_nvenc', '-preset', 'fast', '-b:v', '2M', '-threads', '8')
        // .outputOptions('-threads', '8')
        .save(absoluteOutputPath)
        .on('end', async () => {
            const currentPath = path.dirname(inputFilePath);
            invalidateCache(currentPath); // 更新缓存
            await updateCache(currentPath); // 更新缓存
            res.json({ outputFilePath: outputFilePath });
        })
        .on('error', (err) => {
            console.error('Error during conversion:', err);
            res.status(500).json({ message: 'Conversion failed' });
        })
});

// 根路径返回 index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
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
