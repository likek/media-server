
import Searcher from "../ip2region.js";
import cookie from "cookie";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import useragent from "useragent";
import ffmpeg from "fluent-ffmpeg";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const regineDBPath = path.join(__dirname, "../ip2region.xdb");
const vectorIndex = Searcher.loadVectorIndexFromFile(regineDBPath);
const searcher = Searcher.newWithVectorIndex(regineDBPath, vectorIndex);

const normalizeIp = (ip) => {
    if (!ip) {
      return "unknown ip";
    }
    if(ip === '::1'){
      return "127.0.0.1";
    }
    if (ip.startsWith("::ffff:")) {
      return ip.substring(7);
    }
    return ip;
  };


  const getRequestInfo = async (req, res) => {
    const requestTime = new Date().toISOString();
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
    const userIp = normalizeIp(ipAddress);
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

      cookies
    };
  
    return data;
  };

  function isVideoByName(filename) {
    return /\.(m3u8|mp4|ts|avi|mkv|mov|wmv|webm|flv|ogv|mpeg)$/i.test(filename);
  }

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
        size: "320x240",
      })
      .on("end", () => resolve(true))
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


function convertTxtEncoding(filePath, res) {
  return new Promise((resolve, reject) => {
    const extname = path.extname(filePath);
    if (extname !== ".txt") {
      reject({ status: 400, message: "不是txt文件，跳过编码转换" });
      return;
    }

    fs.readFile(filePath, (err, data) => {
      if (err) {
        console.error("读取文件失败:", err);
        reject({ status: 500, message: "读取文件失败" });
        return;
      }

      // 检测文件编码
      const detectedEncoding = jschardet.detect(data).encoding;
      if (!detectedEncoding) {
        reject({ status: 500, message: "文件编码检测失败" });
        return;
      }

      // 判断文件是否为UTF-8编码
      if (detectedEncoding.toLowerCase() === "utf-8") {
        resolve();
        return;
      }

      // 将文件内容从原编码转换为UTF-8
      const content = iconv.decode(data, detectedEncoding);
      const utf8Content = iconv.encode(content, "utf-8");

      // 将转换后的内容写入文件
      fs.writeFile(filePath, utf8Content, (err) => {
        if (err) {
          console.error("写入文件失败:", err);
          reject({ status: 500, message: "写入文件失败" });
          return;
        }
        resolve();
      });
    });
  })
}
  
  export {
    normalizeIp,
    getRequestInfo,
    isVideoByName,
    generateThumbnail,
    convertTxtEncoding
  }