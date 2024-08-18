import { getRequestInfo } from "./utils/index.js";
import db from "./dbserialize.js";
import chalk from "chalk";
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

 const writeRequestLog = async (req, res, next) => {
    res.on("finish", async () => {
      if (!req.path.startsWith("/uploads/")) {
        const data = await getRequestInfo(req, res);
        console.log(
          [
            chalk.blue(`${new Date(data.requestTime).toLocaleString()}`),
            chalk.green(`${data.userIp}`),
            chalk.green(`${data.region}`),
            chalk.yellow(`${data.requestMethod} ${data.requestUrl}`),
            chalk.cyan(`${data.requestBody}`),
            chalk.magenta(`${data.status}`),
            chalk.gray(`${data.device}`),
            chalk.gray(`${data.os}`),
            chalk.gray(`${data.browser}`),
            chalk.gray(`${data.userAgent}`),
          ].join(" | ")
        );
  
        writeRequestLogToDB(data);
      }
    });
    next();
  }

  const writeWsLog = (logData) => {
    const query = `
      INSERT INTO logs_ws (
        time, action, userId, userIp, userRegion
      ) VALUES (?, ?, ?, ?, ?)
    `;
  
    const values = [
      new Date().toISOString(),
      logData.action || "",
      logData.userId || "",
      logData.userIp || "",
      logData.userRegion || "",
    ];
  
    db.run(query, values, (err) => {
      if (err) {
        console.error("Failed to insert log into database (logs_ws):", err);
      }
    });
  };


  const writeFileAccessedLog = (logData) => {
    const query = `
      INSERT INTO logs_file_accessed (
        time, userId, userIp, filePath
      ) VALUES (?, ?, ?, ?)
    `;
  
    const values = [
      new Date().toISOString(),
      logData.userId || "",
      logData.userIp || "",
      logData.filePath || "",
    ];
  
    db.run(query, values, (err) => {
      if (err) {
        console.error("Failed to insert log into database (logs_ws):", err);
      }
    });
  };

  export {
    writeRequestLog,
    writeWsLog,
    writeFileAccessedLog
  }