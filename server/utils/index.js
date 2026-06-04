
import Searcher from "../ip2region.js";
import cookie from "cookie";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import useragent from "useragent";
import ffmpeg from "fluent-ffmpeg";
import { aesDecrypt } from "./encrypt.js";
import { launchBrowser } from "./browser.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const regineDBPath = path.join(__dirname, "../ip2region.xdb");
const vectorIndex = Searcher.loadVectorIndexFromFile(regineDBPath);
const searcher = Searcher.newWithVectorIndex(regineDBPath, vectorIndex);

const normalizeIp = (ip) => {
  if (!ip) {
    return "unknown ip";
  }
  if(ip === '::1') {
    return "127.0.0.1";
  }
  if (ip.startsWith("::ffff:")) {
    return ip.substring(7);
  }
  return ip;
};

const getIpByReq = (req) => {
  let ipAddress = req.clientIp || req.ip;
  if (!ipAddress) {
    if (req.headers["x-forwarded-for"]) {
      ipAddress = req.headers["x-forwarded-for"].split(",")[0];
    } else if (req.headers["x-real-ip"]) {
      ipAddress = req.headers["x-real-ip"];
    } else if (req.connection.remoteAddress) {
      ipAddress = req.connection.remoteAddress;
    }
  }
  // console.log(`111:, ${req.socket?.remoteAddress}`)
  return normalizeIp(ipAddress);
}

// 如果salt或指纹没有，则可能是因为还没有“注册”
const getSaltByReq = (req, decrypted = true) => {
  let salt;
  if (req.query && req.query.s) {
    salt = req.query.s;
  }
  // 检查请求头
  else if (req.headers['x-s']) {
    salt = req.headers['x-s'];
  } else if (req.cookies && req.cookies?.s) {
    salt = req.cookies.s;
  }

  if (!salt) {
    return null;
  }
  
  if (decrypted) {
    return aesDecrypt(salt);
  } else {
    return salt;
  }
}

const getUserIdByReq = (req, decrypted = true) => {
  try {
    // 确保fingerprint存在
    const fp = req.headers['x-fp'] || req.query?.fp || req.cookies?.fp;
    if (!fp) {
      // console.error("fingerprint is empty", req.headers.upgrade, req.url);
      return null;
    }

    const salt = getSaltByReq(req);
    if (!salt) {
      // console.error("salt is empty");
      return null;
    }
    if (!decrypted) {
      return fp;
    }
    // 用解密后的salt解密fingerprint
    return aesDecrypt(fp, salt);;
  } catch (e) {
    console.error("解析用户ID失败:", e);
    return null;
  }
}

  const getRequestInfo = async (req, res) => {
    const requestTime = new Date().toISOString();
    const userIp = getIpByReq(req);
    const requestMethod = req.method;
    const requestUrl = decodeURIComponent(req.originalUrl);
    const requestBody = decodeURIComponent(JSON.stringify(req.body));
    const status = res?.statusCode;
    const cookies = cookie.parse(req.headers.cookie || "");
  
    let region = "";
    try {
      region = (await searcher.search(userIp))?.region || "unknown";
    } catch (e) {
      console.error("获取ip属地出错: ", e);
    }
  
    const userAgentString = req.headers["user-agent"];
    const userAgent = useragent.parse(userAgentString);
  
    const deviceInfo = {
      device: userAgent.device.toString(),
      os: userAgent.os.toString(),
      browser: userAgent.toAgent(),
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
      timestamp: new Date().toISOString(),
      userId: getUserIdByReq(req),

      cookies
    };
  
    return data;
  };

  function isVideoByName(filename) {
    return /\.(m3u8|mp4|ts|avi|mkv|mov|m4v|wmv|webm|flv|ogv|mpeg)$/i.test(filename);
  }

// 生成视频文件缩略图
async function generateThumbnail(videoPath, thumbnailPath, time = "80%") {
  // 确保缩略图目录存在
  const thumbnailDir = path.dirname(thumbnailPath);
  const thumbnailFileName = path.basename(thumbnailPath);
  if (!fs.existsSync(thumbnailDir)) {
    fs.mkdirSync(thumbnailDir, { recursive: true });
  }

  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .screenshots({
        count: 1,
        folder: thumbnailDir,
        filename: thumbnailFileName,
        size: "?x240",
        timestamps: [time] // 避免开头可能的黑屏
      })
      .on("end", () => {
        resolve(true);
      })
      .on("error", (err) => {
        console.error("Error generating thumbnail:", err);
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


let browser;
let page;

async function get51PageInfo(pageUrl) {
  if (!browser) {
    browser = await launchBrowser({ headless: "new" });
  }
  if (!page) {
    page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/114 Safari/537.36');
    await page.setJavaScriptEnabled(true);
  }
  await page.goto(pageUrl, { waitUntil: 'networkidle2', timeout: 60000 });

  // 等待动态内容加载完成
  try {
    await page.waitForSelector('img[data-xuid]', { timeout: 30000 })
  } catch {
    console.warn('img[data-xuid] not found, continuing anyway...')
  }

  const data = await page.evaluate(() => {
    // 获取页面标题
    const title = document.querySelector('h1.post-title').innerText;
    const sanitizedTitle = title.replace(/[<>:"/\\|?*]+/g, '_'); // 替换非法字符
    // 提取图片链接
    const imgElements = Array.from(document.querySelectorAll('img[data-xuid]'));
    const imgLinks = imgElements.map(img => img.src)
    
    // 提取视频链接
    const videoElements = Array.from(document.querySelectorAll('.dplayer[data-config]'));
    const videoLinks = videoElements.map(video => {
        try {
            const config = JSON.parse(video.dataset.config);
            return config.video?.url;
        } catch {
            return null;
        }
    }).filter(url => url);

    return {
      title: sanitizedTitle,
      imgLinks, 
      videoLinks
    };
  });

  return data
}
  
  export {
    normalizeIp,
    getRequestInfo,
    isVideoByName,
    generateThumbnail,
    get51PageInfo,
    getUserIdByReq,
    getSaltByReq,
    getIpByReq
  }
