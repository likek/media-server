import { getRequestInfo, getSaltByReq, getUserIdByReq } from "./utils/index.js";
import chalk from "chalk";
import { writeWsLog } from "./logManager.js";
import WebSocket, { WebSocketServer } from "ws";
import { aesDecrypt } from "./utils/encrypt.js";

const clientsById = new Map();
let wss;

function wsBroadcastMessage(message, req, onlySelf = false) {
  const userId = getUserIdByReq(req);
  if (onlySelf) {
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

function wsSetUser(userId, ws) {
    clientsById.set(userId, ws);
}

function wsRemoveUser(userId) {
    clientsById.delete(userId);
}

function wsInit(httpServer) {
  if (!wss) {
    wss = new WebSocketServer({ server: httpServer });
  }
  wss.on("connection", async (ws, req) => {
    // 从URL查询参数中获取salt
    const url = new URL(req.url, `http://${req.headers.host}`);
    const encryptedSalt = url.searchParams.get('s');
    const encryptedFp = url.searchParams.get('fp');
    
    // 将salt添加到请求对象中，以便getUserIdByReq可以使用
    if (encryptedSalt) {
      req.query = req.query || {};
      req.query.s = encryptedSalt;
      req.query.fp = encryptedFp;
    }
    const reqInfo = await getRequestInfo(req);
  
    let ipAddress = reqInfo.userIp;
    let userId = getUserIdByReq(req);
    
    // 如果无法从请求中获取userId，将在收到setFingerprint消息时设置
    ws.userId = userId;
  
    let region = "";
  
    if (userId) {
      wsSetUser(userId, ws);
    }
    ws.on("close", () => {
      if (ws.userId) {
        wsRemoveUser(ws.userId);
        console.log(
          `[${new Date().toLocaleString()}] 用户${chalk.yellow(
            "已断开"
          )}: [${ws.userId}] - [${ipAddress}] - [${region}]`
        );
        writeWsLog({
          userId: ws.userId,
          userIp: ipAddress,
          userRegion: region,
          action: "disconnect",
        });
      }
    });
  
    ws.on("error", function error(err) {
      console.error("WebSocket error:", err);
    });
  
    ws.on("message", async (message) => {
      if (Buffer.isBuffer(message)) {
          message = message.toString();
      }

      try {
          const parsedMessage = JSON.parse(message);
          console.log("Received ws message:", parsedMessage);
          
          // 处理指纹设置消息
          if (parsedMessage.event === 'setFingerprint') {

            const userId = ws.userId;
            if (!userId) {
              console.error("Failed to get userId from request");
              return;
            }
            
            if (userId) {
              // 更新WebSocket连接的用户ID
              ws.userId = userId;
              wsSetUser(userId, ws);
            }
          }
          
          switch (parsedMessage.event) {
              case "location":
                const { latitude, longitude } = parsedMessage.data;
                writeWsLog({
                  userId: ws.userId,
                  userIp: ipAddress,
                  userRegion: region,
                  action: parsedMessage.event,
                  location: `${latitude},${longitude}`
                });
                break;
          }
      } catch (err) {
          console.error("Failed to parse message:", err);
      }
    });
  
    try {
      region = reqInfo?.region || "unknown";
    } catch (e) {
      console.error("获取ip属地出错: ", e);
    }
    console.log(
      `[${new Date().toLocaleString()}] 用户${chalk.green(
        "已连接"
      )}: [${ws.userId || '未知'}] - [${ipAddress}] - [${region}]`
    );
    writeWsLog({
      userId: ws.userId,
      userIp: ipAddress,
      userRegion: region,
      action: "connect",
    });
  });  
}

export {
    wsBroadcastMessage,
    wsSetUser,
    wsRemoveUser,
    wsInit
}