import { getRequestInfo, getSaltByReq, getUserIdByReq } from "./utils/index.js";
import { getHiddenMenuAccessState } from "./userManager.js";
import chalk from "chalk";
import { writeWsLog } from "./logManager.js";
import WebSocket, { WebSocketServer } from "ws";
import { aesDecrypt, aesEncrypt } from "./utils/encrypt.js";

const clientsById = new Map();
let wss;
const NO_PERMISSION_TEXT = "无权限";
const ENVELOPE_KEYS = ["d", "i"];

const pickEnvelopeKey = () => ENVELOPE_KEYS[Math.floor(Math.random() * ENVELOPE_KEYS.length)];

const getEnvelopePayload = (payload) => {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  for (const key of ENVELOPE_KEYS) {
    if (typeof payload[key] === "string") {
      return payload[key];
    }
  }
  return null;
};

const encodeWsPayload = (payload, salt) => {
  if (!salt) {
    return payload;
  }
  const encrypted = aesEncrypt(JSON.stringify(payload), salt);
  return {
    [pickEnvelopeKey()]: encrypted,
  };
};

const decodeWsPayload = (payload, salt) => {
  const encryptedPayload = getEnvelopePayload(payload);
  if (!encryptedPayload) {
    return payload;
  }
  if (!salt) {
    throw new Error("missing websocket salt");
  }
  const decrypted = aesDecrypt(encryptedPayload, salt);
  return decrypted ? JSON.parse(decrypted) : {};
};

const sendWsPayload = (client, payload, salt) => {
  if (!client || client.readyState !== WebSocket.OPEN) {
    return;
  }
  client.send(JSON.stringify(encodeWsPayload(payload, salt)));
};

const canViewRealtimeSensitiveFields = (viewerUserId) => {
  if (!viewerUserId) {
    return false;
  }
  try {
    return Boolean(getHiddenMenuAccessState(viewerUserId)?.canRenderHiddenMenus);
  } catch (error) {
    console.error("校验实时状态字段权限失败:", error);
    return false;
  }
};

function getOnlineUsersSnapshot(viewerUserId = null) {
  const canViewSensitive = canViewRealtimeSensitiveFields(viewerUserId);
  return Array.from(clientsById.values())
    .filter((clientState) => clientState?.ws?.readyState === WebSocket.OPEN)
    .map((clientState) => ({
      userId: canViewSensitive ? (clientState.userId || "unknown") : NO_PERMISSION_TEXT,
      ipAddress: canViewSensitive ? (clientState.ipAddress || "unknown") : NO_PERMISSION_TEXT,
      region: canViewSensitive ? (clientState.region || "unknown") : NO_PERMISSION_TEXT,
      connectedAt: clientState.connectedAt || null,
      lastSeenAt: clientState.lastSeenAt || clientState.connectedAt || null,
      location: canViewSensitive ? (clientState.location || null) : NO_PERMISSION_TEXT,
    }))
    .sort((a, b) => String(a.userId).localeCompare(String(b.userId)));
}

function wsBroadcastAll(message) {
  clientsById.forEach((clientState) => {
    const client = clientState?.ws;
    sendWsPayload(client, message, clientState?.salt || client?.salt);
  });
}

function wsBroadcastEach(buildMessage) {
  clientsById.forEach((clientState, userId) => {
    const client = clientState?.ws;
    if (client && client.readyState === WebSocket.OPEN) {
      const message = buildMessage(userId, clientState);
      if (message) {
        sendWsPayload(client, message, clientState?.salt || client?.salt);
      }
    }
  });
}

function wsBroadcastOnlineUsers() {
  wsBroadcastEach((viewerUserId) => ({
    event: "realtimeStatusUpdated",
    data: {
      onlineUsers: getOnlineUsersSnapshot(viewerUserId),
    }
  }));
}

function wsBroadcastMessage(message, req, onlySelf = false) {
  const userId = getUserIdByReq(req);
  if (onlySelf) {
    const clientState = clientsById.get(userId);
    const client = clientState?.ws;
    if (client && client.readyState === WebSocket.OPEN) {
      sendWsPayload(client, message, clientState?.salt || client?.salt);
    }
    return;
  }
  clientsById.forEach((clientState, id) => {
    const client = clientState?.ws;
    if (id !== userId && client.readyState === WebSocket.OPEN) {
      sendWsPayload(client, message, clientState?.salt || client?.salt);
    }
  });
}

function wsSetUser(userId, ws) {
    if (!userId) {
      return;
    }
    const prevState = clientsById.get(userId) || {};
    clientsById.set(userId, {
      ...prevState,
      userId,
      ws,
      salt: ws?.salt || prevState.salt || null,
      connectedAt: prevState.connectedAt || new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
    });
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
    ws.salt = getSaltByReq(req);
    const reqInfo = await getRequestInfo(req);
  
    let ipAddress = reqInfo.userIp;
    let userId = getUserIdByReq(req);
    
    // 如果无法从请求中获取userId，将在收到setFingerprint消息时设置
    ws.userId = userId;
  
    let region = "";
  
    if (userId) {
      wsSetUser(userId, ws);
      const state = clientsById.get(userId);
      if (state) {
        state.ipAddress = ipAddress;
        state.region = region || state.region || "unknown";
        state.lastSeenAt = new Date().toISOString();
      }
    }
    ws.on("close", () => {
      if (ws.userId) {
        wsRemoveUser(ws.userId);
        wsBroadcastOnlineUsers();
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
          const parsedMessage = decodeWsPayload(JSON.parse(message), ws.salt);
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
              const state = clientsById.get(userId);
              if (state) {
                state.ipAddress = ipAddress;
                state.region = region || state.region || "unknown";
                state.lastSeenAt = new Date().toISOString();
              }
              wsBroadcastOnlineUsers();
            }
          }
          
          switch (parsedMessage.event) {
              case "location":
                const { latitude, longitude, accuracy } = parsedMessage.data;
                if (ws.userId && clientsById.has(ws.userId)) {
                  const state = clientsById.get(ws.userId);
                  state.location = {
                    latitude,
                    longitude,
                    accuracy,
                    updatedAt: new Date().toISOString(),
                  };
                  state.lastSeenAt = new Date().toISOString();
                  wsBroadcastOnlineUsers();
                }
                writeWsLog({
                  userId: ws.userId,
                  userIp: ipAddress,
                  userRegion: region,
                  action: parsedMessage.event,
                  location: `${latitude},${longitude},${accuracy}`
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
    if (ws.userId) {
      const state = clientsById.get(ws.userId);
      if (state) {
        state.ipAddress = ipAddress;
        state.region = region || state.region || "unknown";
        state.lastSeenAt = new Date().toISOString();
      }
      wsBroadcastOnlineUsers();
    }
  });  
}

export {
    wsBroadcastMessage,
    wsBroadcastAll,
    wsBroadcastEach,
    getOnlineUsersSnapshot,
    wsSetUser,
    wsRemoveUser,
    wsInit
}
