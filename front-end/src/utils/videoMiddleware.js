import videojs from 'video.js';
import { aesEncrypt } from './encrypt.js';
import { saveVideoFrame, updateThumbnail } from '../services/userApi.js';

const Button = videojs.getComponent('Button');
class ThumbnailBtn extends Button {
    constructor(_player, options) {
        super(_player, options);
        this.player_ = _player; // 存当前实例
        this.addClass('vjs-icon-square');
        this.el().setAttribute('title', '将当前帧设为视频封面');
        this.controlText("将当前帧设为视频封面");
    }
    handleClick() {
        if (this.player_.videoId) {
            const currTime = this.player_.currentTime(); // 使用当前播放器实例
            console.log(this.player_.videoId, currTime)
            updateThumbnail(this.player_.videoId, currTime).then(() => {
                this.player_.trigger('thumbnail:success', {
                    videoId: this.player_.videoId,
                    time: currTime
                })
            }).catch(() => {
                this.player_.trigger('thumbnail:error', {
                    videoId: this.player_.videoId,
                    time: currTime
                })
            });
        }
    }
}

class SaveFrameBtn extends Button {
    constructor(_player, options) {
        super(_player, options);
        this.player_ = _player;
        this.addClass('vjs-save-frame-btn');
        this.el().setAttribute('title', '将当前帧保存到当前视频所在的文件夹');
        this.el().innerHTML = '<span class="vjs-save-frame-btn__label" aria-hidden="true">存帧</span>';
        this.controlText("将当前帧保存到当前视频所在的文件夹");
    }
    handleClick() {
        if (this.player_.videoId) {
            const currTime = this.player_.currentTime();
            saveVideoFrame(this.player_.videoId, currTime).then((resp) => {
                this.player_.trigger('saveframe:success', {
                    videoId: this.player_.videoId,
                    time: currTime,
                    savedPath: resp?.savedPath
                })
            }).catch(() => {
                this.player_.trigger('saveframe:error', {
                    videoId: this.player_.videoId,
                    time: currTime
                })
            });
        }
    }
}

// 避免重复注册
if (!videojs.getComponent('ThumbnailBtn')) {
    videojs.registerComponent('ThumbnailBtn', ThumbnailBtn);
}
if (!videojs.getComponent('SaveFrameBtn')) {
    videojs.registerComponent('SaveFrameBtn', SaveFrameBtn);
}

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
                if (source.src.startsWith('/media/') && !source.src.includes('vt=')) { // 这里可以不处理，src初始化时已添加
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
        if (options.requestType ==='segment' && !options.uri.includes('vt=')) { // 这里可以不处理，后端已处理
            options.uri = createEncryptedUrl(options.uri)
        }
        return options;
    })
}

export { videoMiddlewareInit }
