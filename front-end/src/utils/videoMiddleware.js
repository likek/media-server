import videojs from 'video.js';
import { aesEncrypt } from './encrypt.js';

// 创建带有加密令牌的URL,⚠️ 需要和后端 createEncryptedTsUrl 一致
export function createEncryptedUrl(url) {
    // 获取本周周一的00点时间戳
    const now = new Date();
    const day = now.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day; // 周日特殊处理为上周一
    const weekMonday = new Date(now);
    weekMonday.setDate(now.getDate() + diffToMonday);
    weekMonday.setHours(0, 0, 0, 0);
    const weekMondayTimestamp = weekMonday.getTime().toString().slice(2);

  // 获取加密指纹和盐
  //   const salt = `${Date.now().toString().slice(8)}${Math.random().toString(36).substring(2)}`
  const salt = `${weekMondayTimestamp}`
  const encryptedSalt = aesEncrypt(salt)

  // 创建令牌
  // 从完整url上取出path
  let path = url
  if (!path.startsWith('/media/')) {
    const urlObj = new URL(url);
    path = urlObj.pathname;
  }
  const token = `${weekMondayTimestamp}-${path}`;
  console.log(`[video request] path: ${path}, token: ${token}, salt: ${salt}`)
  const encryptedToken = aesEncrypt(token, salt);

  // 构建URL，添加加密令牌和加密盐
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}vt=${encodeURIComponent(encryptedToken)}&vs=${encodeURIComponent(encryptedSalt)}`;
}

const videoMiddlewareInit = () => {
    videojs.use('*', function (player) {
        return {
            setSource: function (source, next) {
                if (source.src.startsWith('/media/') && !source.src.includes('vt=')) {
                    const encryptedUrl = createEncryptedUrl(source.src)
                    next(null, {
                        ...source,
                        src: encryptedUrl
                    });
                } else {
                    next(null, source);
                }
            }
        };
    });

    videojs.Vhs.xhr.onRequest(options => {
        console.log("onRequest", options);
        if (options.requestType ==='segment' && !options.uri.includes('vt=')) {
            options.uri = createEncryptedUrl(options.uri)
        }
        return options;
    })

    videojs.Vhs.xhr.beforeRequest = ((options) => {
        console.log("beforeRequest", options);
        return options;
    })
}

export { videoMiddlewareInit }