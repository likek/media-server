
import { exec } from "child_process";
import { v4 as uuidv4 } from "uuid";
import fs from "fs";
import path from "path";
import chalk from "chalk";
import { TEMP_FULL_PATH, MEDIA_FULL_PATH } from "../serverConfig.js";


async function downloadAllMediaByLinks(text, folder, successItemCb, processLog = '') {
    console.log(`${processLog}开始下载：`, text.length > 300 ? `${text.slice(0, 300)}......` : text, folder)
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
  
    const downloadLink = (link) => {
      return new Promise((resolve) => {
        const tempDir = path.join(
          TEMP_FULL_PATH,
          "batch_download",
          `${Date.now()}`
        );
        const m3u8Regex = /https?:\/\/[^\s]+?\.m3u8(\?[^\s]*)?/i;
        const saveName = `${Date.now()}${Math.floor(Math.random() * 100000)}`;
        const command = m3u8Regex.test(link)
          ? `N_m3u8DL-RE --auto-select "${link}" --save-dir "${downloadDir}" --save-name ${saveName} --tmp-dir ${tempDir} --ui-language en-US`
          : `curl -L "${link}" -o "${path.join(downloadDir, saveName)}"`;
  
        console.log(`${processLog}开始执行: ${command}`);
  
        const child = exec(command, {
          env: { ...process.env, LANG: "en-US.UTF-8" },
        });
  
        child.stdout.on("data", (data) => {
          process.stdout.write(`\n${processLog}stdout: ${data}`);
        });
  
        child.stderr.on("data", (data) => {
          process.stderr.write(`\n${processLog}stderr: ${data}`);
        });
  
        child.on("close", (code) => {
          let failed = false;
          if (code !== 0) {
            failed = true;
            console.error(`${chalk.red(`${processLog}下载失败`)}: ${link}`);
            failedLinks.push(link);
          } else {
            console.log(`${chalk.green(`${processLog}下载成功`)}: ${link}`);
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
    await Promise.all([...links.map(downloadLink), ...base64Images.map(saveBase64Image)]);
    return Promise.resolve({
      downloadRoot, downloadSub, completedCount, ignoreLinks, failedLinks
    });
  }

  export {
    downloadAllMediaByLinks
  }