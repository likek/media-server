
import { exec } from "child_process";
import { v4 as uuidv4 } from "uuid";
import fs from "fs";
import path from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import chalk from "chalk";
import { TEMP_FULL_PATH, MEDIA_FULL_PATH } from "../serverConfig.js";
import pLimit from 'p-limit';
const limit = pLimit(5) // 最多同时5个

const DEFAULT_DOWNLOAD_HEADERS = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36',
  accept: '*/*'
}

const CONTENT_TYPE_EXTENSION_MAP = {
  'application/x-msdownload': '.exe',
  'application/octet-stream': '.bin',
  'application/json': '.json',
  'application/javascript': '.js',
  'application/pdf': '.pdf',
  'application/zip': '.zip',
  'application/x-zip-compressed': '.zip',
  'application/vnd.android.package-archive': '.apk',
  'application/xml': '.xml',
  'application/xhtml+xml': '.html',
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
  'audio/mpeg': '.mp3',
  'video/mp4': '.mp4',
  'text/plain': '.txt',
  'text/html': '.html',
  'text/css': '.css',
  'text/javascript': '.js',
  'text/xml': '.xml',
  'text/csv': '.csv'
}

function normalizeTextDownloadLink(rawLink) {
  if (!rawLink) {
    return null
  }

  const candidate = rawLink.trim().replace(/^['"`]+|['"`]+$/g, '')
  if (!candidate) {
    return null
  }

  const normalizedLink = candidate.startsWith('://') ? `https${candidate}` : candidate

  try {
    const url = new URL(normalizedLink)
    if (!['http:', 'https:'].includes(url.protocol)) {
      return null
    }
    return url.toString()
  } catch {
    return null
  }
}

function getFilenameFromContentDisposition(contentDisposition = '') {
  if (!contentDisposition) {
    return ''
  }

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i)
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1])
    } catch {
      return utf8Match[1]
    }
  }

  const basicMatch = contentDisposition.match(/filename="?([^";]+)"?/i)
  return basicMatch?.[1] || ''
}

function resolveDownloadExtension(link, response) {
  const contentDisposition = response.headers.get('content-disposition') || ''
  const filenameFromHeader = getFilenameFromContentDisposition(contentDisposition)
  const extFromHeader = filenameFromHeader ? path.extname(filenameFromHeader) : ''

  if (extFromHeader) {
    return extFromHeader
  }

  const pathname = decodeURIComponent(new URL(link).pathname)
  const extFromPath = path.extname(pathname)
  if (extFromPath) {
    return extFromPath
  }

  const contentType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
  return CONTENT_TYPE_EXTENSION_MAP[contentType] || '.bin'
}

async function downloadBinaryFile(link, downloadDir, saveName) {
  const response = await fetch(link, {
    redirect: 'follow',
    headers: DEFAULT_DOWNLOAD_HEADERS
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`)
  }

  if (!response.body) {
    throw new Error('响应体为空')
  }

  const ext = resolveDownloadExtension(link, response)
  const savePath = path.join(downloadDir, `${saveName}${ext}`)
  const fileStream = fs.createWriteStream(savePath)

  try {
    await pipeline(Readable.fromWeb(response.body), fileStream)
    return savePath
  } catch (error) {
    fileStream.destroy()
    if (fs.existsSync(savePath)) {
      fs.unlinkSync(savePath)
    }
    throw error
  }
}

async function downloadAllMediaByLinks(text, folder, successItemCb, processLog = '') {
    console.log(`${processLog}开始下载：`, text.length > 300 ? `${text.slice(0, 300)}......` : text, folder)
    // Accept any HTTP(S) style link and leave file-type handling to download time.
    const urlCandidateRegex = /(?:https?:\/\/|:\/\/)[^\s]+/g;
    const urlCandidates = text.match(urlCandidateRegex) || [];
    const links = [];
    const ignoreLinks = [];
    const seenLinks = new Set();

    for (const candidate of urlCandidates) {
      const normalizedLink = normalizeTextDownloadLink(candidate);
      if (!normalizedLink) {
        ignoreLinks.push(candidate);
        continue;
      }
      if (seenLinks.has(normalizedLink)) {
        continue;
      }
      seenLinks.add(normalizedLink);
      links.push(normalizedLink);
    }
  
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
  
    console.log(`${processLog}开始批量下载资源: `, links, `${base64Images.length}个base64图片`);
  
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
    downloadDir = path.join(MEDIA_FULL_PATH, downloadRoot, downloadSub);
    if (!fs.existsSync(downloadDir)) {
      fs.mkdirSync(downloadDir, { recursive: true });
    }
  
    const failedLinks = [];
    let completedCount = 0;
  
    const downloadLink = async (link) => {    
      const tempDir = path.join(
        TEMP_FULL_PATH,
        'batch_download',
        `${Date.now()}`
      )
      const m3u8Regex = /\.m3u8(?:$|[?#])/i
      const saveName = `${Date.now()}${Math.floor(Math.random() * 100000)}`
  
      if (m3u8Regex.test(link)) {
        return new Promise(resolve => {
          const command = `N_m3u8DL-RE --auto-select "${link}" --save-dir "${downloadDir}" --save-name ${saveName} --tmp-dir ${tempDir} --ui-language en-US`
          console.log(`${processLog}开始执行: ${command}`)
    
          const child = exec(command, {
            env: { ...process.env, LANG: 'en-US.UTF-8' },
          })
    
          child.stdout.on('data', (data) => {
            process.stdout.write(`\n${processLog}stdout: ${data}`)
          })
    
          child.stderr.on('data', (data) => {
            process.stderr.write(`\n${processLog}stderr: ${data}`)
          })
    
          child.on('close', (code) => {
            let failed = false
            if (code !== 0) {
              failed = true
              console.error(`${chalk.red(`${processLog}下载失败`)}: ${link}`)
              failedLinks.push(link)
            } else {
              console.log(`${chalk.green(`${processLog}下载成功`)}: ${link}`)
            }
            completedCount++
            successItemCb({
              link,
              progress: completedCount,
              total: links.length + base64Images.length,
              state: failed ? 'failed' : 'success',
            })
            resolve()
          })
        })
      } else {
        try {
          const savePath = await downloadBinaryFile(link, downloadDir, saveName)
          console.log(`${processLog}已保存到: ${savePath}`)
          console.log(`${chalk.green(`${processLog}下载成功`)}: ${link}`)
        } catch (err) {
          console.error(`${chalk.red(`${processLog}下载失败`)}: ${link}`, err)
          failedLinks.push(link)
        }
        completedCount++
        successItemCb({
          link,
          progress: completedCount,
          total: links.length + base64Images.length,
          state: failedLinks.includes(link) ? 'failed' : 'success',
        })
      }
    }
  
    // Save base64 images
    const saveBase64Image = (image, index) => {
      return new Promise((resolve) => {
        const fileName = `image_${index}.${image.mimeType}`;
        const filePath = path.join(downloadDir, fileName);
        const imageBuffer = Buffer.from(image.base64, 'base64');
  
        fs.writeFile(filePath, imageBuffer, (err) => {
          if (err) {
            console.error(`${chalk.red(`${processLog}保存失败`)}: ${filePath}`);
            failedLinks.push(filePath);
          } else {
            console.log(`${chalk.green(`${processLog}保存成功`)}: ${filePath}`);
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
    await Promise.all([
      ...links.map(link => limit(() => downloadLink(link))),
      ...base64Images.map((img, i) => limit(() => saveBase64Image(img, i)))
    ])
    return Promise.resolve({
      downloadRoot, downloadSub, completedCount, ignoreLinks, failedLinks
    });
  }

  export {
    downloadAllMediaByLinks
  }
