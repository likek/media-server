<template>
    <div class="video-player-container">
        <div ref="videoContainer" class="video-container"></div>
        <el-popover
            v-model:visible="moreActionsVisible"
            placement="bottom-end"
            trigger="click"
            :teleported="false"
            width="220"
        >
            <template #reference>
                <button
                    type="button"
                    class="more-actions-trigger"
                    aria-label="更多功能"
                    title="更多功能"
                >
                    <el-icon><MoreFilled /></el-icon>
                </button>
            </template>
            <div class="more-actions-panel">
                <div class="more-actions-panel__title">循环模式</div>
                <el-radio-group v-model="loopMode" size="small" class="loop-mode-group">
                    <el-radio-button value="off">关闭</el-radio-button>
                    <el-radio-button value="single">单循</el-radio-button>
                    <el-radio-button value="playlist">连播</el-radio-button>
                </el-radio-group>
            </div>
        </el-popover>
    </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';
import { createEncryptedUrl } from '../utils/videoMiddleware';
import 'videojs-hls-quality-selector/src/plugin'
import { ElMessage } from 'element-plus';
import { getNextVideo } from '../services/userApi';

const emit = defineEmits(['active-file-change']);

const props = defineProps({
    src: {
        type: String,
        required: true
    },
    thumbnailBtn: {
        type: Boolean,
        default: false
    },
    videoId: {
        type: Number,
        default: undefined
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
const moreActionsVisible = ref(false);
const loopMode = ref('off');
const loadingNextVideo = ref(false);
let player = null;

const buildMediaSource = (file = {}) => {
    const videoId = file.videoId ?? file.id ?? props.videoId;
    const m3u8Path = file.m3u8_path ?? file.m3u8Path ?? props.m3u8Path;
    const src = file.src || (videoId ? `/media/${videoId}` : props.src);
    const poster = file.poster || (videoId ? `/thumbnail/${videoId}` : props.poster);

    return {
        src,
        type: m3u8Path ? 'application/x-mpegURL' : 'video/mp4',
        poster: poster || '',
        videoId
    };
};

const currentMediaSource = ref(buildMediaSource());

const playCurrentVideo = () => {
    if (!player) {
        return;
    }

    player.currentTime(0);
    const playPromise = player.play();
    if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {});
    }
};

const syncPlayerSource = ({ autoplay = false } = {}) => {
    if (!player || !currentMediaSource.value?.src) {
        return;
    }

    const { src, type, poster, videoId } = currentMediaSource.value;
    player.videoId = videoId || undefined;
    player.poster(poster || '');
    player.src({
        src: createEncryptedUrl(src),
        type
    });

    if (autoplay) {
        const tryPlay = () => {
            console.log('tryPlay');
            const playPromise = player.play();
            if (playPromise && typeof playPromise.catch === 'function') {
                playPromise.catch(() => {});
            }
        };

        player.one('loadedmetadata', tryPlay);
        player.one('canplay', tryPlay);
        tryPlay();
    }
};

const playNextVideo = async () => {
    const currentVideoId = currentMediaSource.value?.videoId;
    if (!currentVideoId || loadingNextVideo.value) {
        return;
    }

    loadingNextVideo.value = true;
    try {
        const nextFile = await getNextVideo(currentVideoId);
        if (!nextFile?.id) {
            ElMessage.warning('未找到下一个视频');
            return;
        }

        currentMediaSource.value = buildMediaSource({
            id: nextFile.id,
            m3u8_path: nextFile.m3u8_path
        });
        syncPlayerSource({ autoplay: true });
        emit('active-file-change', {
            file: nextFile
        });
    } catch (error) {
        console.error('获取下一个视频失败:', error);
        ElMessage.error(error?.response?.data?.message || error?.message || '获取下一个视频失败');
    } finally {
        loadingNextVideo.value = false;
    }
};

const handlePlaybackEnded = () => {
    if (loopMode.value === 'single') {
        playCurrentVideo();
        return;
    }

    if (loopMode.value === 'playlist') {
        playNextVideo();
    }
};

// 初始化播放器
const initializePlayer = async () => {
    if (!currentMediaSource.value?.src) {
        return;
    }

    // 默认配置
    const defaultOptions = {
        controls: true,
        autoplay: false,
        preload: 'none', // 如果蛇尾none，在其他地方必须强制发起首次token请求防止token被再次重放
        responsive: true,
        playbackRates: [0.5, 1, 1.5, 2],
        sources: [{
            src: createEncryptedUrl(currentMediaSource.value.src),
            type: currentMediaSource.value.type
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
                'fullscreenToggle'
            ],
        },
        height: 320,
        width: 300
    };

    // 合并默认配置和用户配置
    const videoOptions = {
        ...defaultOptions,
        ...props.options,
        poster: currentMediaSource.value.poster
    };

    // 创建video元素
    const videoElement = document.createElement('video');
    videoElement.className = 'video-js vjs-big-play-centered';
    videoContainer.value.appendChild(videoElement);

    // 初始化Video.js播放器
    player = videojs(videoElement, videoOptions);
    player.videoId = currentMediaSource.value.videoId || undefined
    player.on('thumbnail:success', (e, data) => {
        ElMessage.success('更改缩略图成功')
    })
    player.on('thumbnail:error', (e, data) => {
        ElMessage.error('更改缩略图失败')
    })
    player.on('saveframe:success', (e, data) => {
        ElMessage.success(data?.savedPath ? `保存当前帧成功：${data.savedPath}` : '保存当前帧成功')
    })
    player.on('saveframe:error', (e, data) => {
        ElMessage.error('保存当前帧失败')
    })
    player.on('ended', handlePlaybackEnded)
    player.ready(() => {
        const videoEl = player.el().querySelector('video')
        if (videoEl) {
            videoEl.addEventListener('contextmenu', event => {
                event.preventDefault()
            })
        }
        if(player.hlsQualitySelector) {
            player.hlsQualitySelector({
                displayCurrentQuality: true,
            })
        }
        // player.load() // 必须强制发起首次token请求防止token被再次重放
        if (props.thumbnailBtn) {
            player.getChild('controlBar').addChild('ThumbnailBtn', {}, player.controlBar.children().length - 1);
            player.getChild('controlBar').addChild('SaveFrameBtn', {}, player.controlBar.children().length - 1);
        }
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
        if (newSrc === currentMediaSource.value?.src) {
            return;
        }
        currentMediaSource.value = buildMediaSource();
        syncPlayerSource();
    }
});

watch(() => props.poster, () => {
    if (player) {
        if ((props.poster || '') === (currentMediaSource.value?.poster || '')) {
            return;
        }
        currentMediaSource.value = buildMediaSource();
        player.poster(currentMediaSource.value.poster || '');
    }
});

watch(() => props.videoId, () => {
    if (player) {
        if ((props.videoId || undefined) === (currentMediaSource.value?.videoId || undefined)) {
            return;
        }
        currentMediaSource.value = buildMediaSource();
        player.videoId = currentMediaSource.value.videoId || undefined;
    }
});

watch(() => props.m3u8Path, () => {
    if (player && props.src) {
        const nextType = props.m3u8Path ? 'application/x-mpegURL' : 'video/mp4';
        if (nextType === currentMediaSource.value?.type) {
            return;
        }
        currentMediaSource.value = buildMediaSource();
        syncPlayerSource();
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
    position: relative;
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

.more-actions-trigger {
    position: absolute;
    top: 10px;
    right: 10px;
    z-index: 20;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border: none;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.55);
    color: #fff;
    cursor: pointer;
    transition: background-color 0.2s ease;
}

@media (any-hover: hover) {
    .more-actions-trigger:hover {
        background: rgba(0, 0, 0, 0.72);
    }
}

.more-actions-panel {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.more-actions-panel__title {
    font-size: 13px;
    font-weight: 600;
    color: #303133;
}

.loop-mode-group {
    display: flex;
    width: 100%;
}

:deep(.loop-mode-group .el-radio-button) {
    flex: 1;
}

:deep(.loop-mode-group .el-radio-button__inner) {
    display: block;
    width: 100%;
    padding: 5px 4px;
    font-size: 12px;
}

:deep(.vjs-thumbnail-btn),
:deep(.vjs-save-frame-btn) {
    width: auto;
    min-width: 3.6em;
    padding: 0 0.6em;
}

:deep(.vjs-thumbnail-btn .vjs-thumbnail-btn__label),
:deep(.vjs-save-frame-btn .vjs-save-frame-btn__label) {
    display: inline-block;
    font-size: 12px;
}
</style>
