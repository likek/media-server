<template>
    <div class="video-player-container">
        <div ref="videoContainer" class="video-container"></div>
    </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';

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
    },
    m3u8Path: {
        type: String,
        default: ''
    }
});

const videoContainer = ref(null);
let player = null;

// 初始化播放器
const initializePlayer = async () => {
    // 根据文件后缀判断视频类型
    const videoType = props.m3u8Path ? 'application/x-mpegURL' : 'video/mp4';
    
    // 默认配置
    const defaultOptions = {
        controls: true,
        autoplay: false,
        preload: 'none', // 如果蛇尾none，在其他地方必须强制发起首次token请求防止token被再次重放
        responsive: true,
        playbackRates: [0.5, 1, 1.5, 2],
        sources: [{
            src: props.src,
            type: videoType
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
    player.ready(() => {
        const videoEl = player.el().querySelector('video')
        if (videoEl) {
            videoEl.addEventListener('contextmenu', event => {
                event.preventDefault()
            })
        }
        player.load() // 必须强制发起首次token请求防止token被再次重放
    })

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
        // 根据文件后缀判断视频类型
        const videoType = props.m3u8Path ? 'application/x-mpegURL' : 'video/mp4';
        
        // const encryptedSrc = createEncryptedUrl(newSrc);
        player.src({
            src: newSrc,
            type: videoType
        });
    }
});

// 组件卸载前销毁播放器
onBeforeUnmount(() => {
    if (player) {
        player.dispose();
        player = null;
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
    text-align: center;
    background-color: #000;
}
</style>