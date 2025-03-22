import { getRequestInfo } from "./utils/index.js";
import chalk from "chalk";
import { writeWsLog } from "./logManager.js";
import WebSocket, { WebSocketServer } from "ws";

const clientsById = new Map();
let wss;

function wsBroadcastMessage(message, req, onlySelf = false) {
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
    const reqInfo = await getRequestInfo(req);
    const cookies = reqInfo?.cookies;
  
    let ipAddress = reqInfo.userIp;
    const userId = cookies.userId;
  
    let region = "";
  
    wsSetUser(userId, ws);
    ws.on("close", () => {
      wsRemoveUser(userId);
      console.log(
        `[${new Date().toLocaleString()}] 用户${chalk.yellow(
          "已断开"
        )}: [${userId}] - [${ipAddress}] - [${region}]`
      );
      writeWsLog({
        userId,
        userIp: ipAddress,
        userRegion: region,
        action: "disconnect",
      });
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
          switch (parsedMessage.event) {
              case "location":
                const { latitude, longitude } = parsedMessage.data;
                writeWsLog({
                  userId,
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
      )}: [${userId}] - [${ipAddress}] - [${region}]`
    );
    writeWsLog({
      userId,
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