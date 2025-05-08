<template>
  <div class="video-player-container">
    <div ref="videoContainer" class="video-container"></div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';
import { aesEncrypt } from '../utils/encrypt';
import { getEncryptedFingerprint } from '../utils/fingerprint';

const props = defineProps({
  src: {
    type: String,
    required: true
  },
  poster: {
    type: String,
    default: ''
  },
  options: {
    type: Object,
    default: () => ({})
  }
});

const videoContainer = ref(null);
let player = null;

// 创建带有加密令牌的URL
async function createEncryptedUrl(url) {
  // 获取加密指纹和盐
  const { encryptedFingerprint, encryptedSalt, salt } = await getEncryptedFingerprint();
  
  // 创建令牌
  const token = `${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
  const encryptedToken = aesEncrypt(token, salt);
  
  // 构建URL，添加加密令牌和加密盐
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}vt=${encodeURIComponent(encryptedToken)}&vs=${encodeURIComponent(encryptedSalt)}`;
}

// 自定义中间件，拦截视频请求并添加加密令牌
const setupVideoJsMiddleware = () => {
  // 保存原始的xhr.open方法
  const originalOpen = XMLHttpRequest.prototype.open;
  
  // 重写xhr.open方法
  XMLHttpRequest.prototype.open = async function(method, url, async, user, password) {
    // 检查是否是视频分段请求
    if (url && typeof url === 'string' && url.startsWith('/media/')) {
      // 创建带有加密令牌的URL
      const encryptedUrl = await createEncryptedUrl(url);
      // 调用原始的open方法，但使用加密后的URL
      return originalOpen.call(this, method, encryptedUrl, async, user, password);
    }
    
    // 对于非视频请求，使用原始方法
    return originalOpen.call(this, method, url, async, user, password);
  };
};

// 初始化播放器
const initializePlayer = async () => {
  // 设置中间件拦截视频请求
  setupVideoJsMiddleware();
  
  // 创建带有加密令牌的初始URL
  const encryptedSrc = await createEncryptedUrl(props.src);
  
  // 默认配置
  const defaultOptions = {
    controls: true,
    autoplay: false,
    preload: 'auto',
    // fluid: true,
    responsive: true,
    playbackRates: [0.5, 1, 1.5, 2],
    sources: [{
      src: encryptedSrc,
      type: 'video/mp4'
    }],
    controlBar: {
        children: [
            'playToggle',
            'volumePanel',
            'currentTimeDisplay',
            'timeDivider',
            'durationDisplay',
            'progressControl',
            'playbackRateMenuButton',
            'fullscreenToggle',
        ],
    },
    height: 320,
    width: 300
  };
  
  // 合并默认配置和用户配置
  const videoOptions = {
    ...defaultOptions,
    ...props.options,
    poster: props.poster
  };
  
  // 创建video元素
  const videoElement = document.createElement('video');
  videoElement.className = 'video-js vjs-big-play-centered';
  videoContainer.value.appendChild(videoElement);
  
  // 初始化Video.js播放器
  player = videojs(videoElement, videoOptions);
  
  // 错误处理
  player.on('error', (error) => {
    console.error('视频播放错误:', error);
  });
};

// 组件挂载时初始化播放器
onMounted(() => {
  initializePlayer();
});

// 监听src变化，更新播放源
watch(() => props.src, async (newSrc) => {
  if (player && newSrc) {
    const encryptedSrc = await createEncryptedUrl(newSrc);
    player.src({
      src: encryptedSrc,
      type: 'video/mp4'
    });
  }
});

// 组件卸载前销毁播放器
onBeforeUnmount(() => {
  if (player) {
    player.dispose();
    player = null;
  }
  
  // 恢复原始的XMLHttpRequest.open方法
  if (window.originalXhrOpen) {
    XMLHttpRequest.prototype.open = window.originalXhrOpen;
  }
});
</script>

<style scoped>
.video-player-container {
  width: 100%;
  height: 100%;
  border-radius: 4px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
}

.video-container {
    width: 100%;
    height: 100%;
}

.vjs-play-control {
    background-color: red;
}

</style>