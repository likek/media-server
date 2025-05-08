import videojs from 'video.js';
import { aesEncrypt } from './encrypt.js';
// 创建带有加密令牌的URL
function createEncryptedUrl(url) {
  // 获取加密指纹和盐
  const salt = `${Date.now().toString().slice(8)}${Math.random().toString(36).substring(2, 10)}`
  const encryptedSalt = aesEncrypt(salt)

  // 创建令牌
  const token = `${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
  const encryptedToken = aesEncrypt(token, salt);

  // 构建URL，添加加密令牌和加密盐
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}vt=${encodeURIComponent(encryptedToken)}&vs=${encodeURIComponent(encryptedSalt)}`;
}

const videoMiddlewareInit = () => {
    videojs.use('*', function (player) {
        return {
            setSource: function (source, next) {
                if (source.src.startsWith('/media/')) {
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
}

export { videoMiddlewareInit }