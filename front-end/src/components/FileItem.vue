<template>
  <div class="file-item">
    <div class="file-content">
      <div>
        <div class="file-header">
          <el-icon class="file-icon">
              <VideoCamera v-if="isVideo"/>
              <Picture v-else-if="isImage" />
              <Collection v-else-if="isArchive"/>
              <Reading v-else-if="isText"/>
              <Microphone v-else-if="isAudio"/>
              <Document v-else/>
          </el-icon>
          <span class="file-name">{{ file.m3u8_path ? '_' : '' }}{{ file.filename }}</span>
          <div class="file-actions">
            <el-tooltip content="查看文本" placement="top" :auto-close="1000" v-if="isText && allowActions.includes('viewtext')">
              <el-icon class="action-icon" @click.stop="viewTextFile" >
                <View />
              </el-icon>
            </el-tooltip>
            <el-tooltip content="解压缩" placement="top" :auto-close="1000" v-if="isArchive && allowActions.includes('unzip')">
              <el-icon class="action-icon" @click.stop="unzipArchive">
                <FolderOpened />
              </el-icon>
            </el-tooltip>
            <el-tooltip content="转换为MP4" placement="top" :auto-close="1000" v-if="isTs && allowActions.includes('convertts')">
              <el-icon class="action-icon" @click.stop="$emit('convertTs', file)">
                <VideoPlay />
              </el-icon>
            </el-tooltip>
            <el-tooltip content="转换为HLS" placement="top" :auto-close="1000" v-if="isMp4 && allowActions.includes('converthls')">
              <el-icon class="action-icon" @click.stop="handleConvertToHls">
                <Switch />
              </el-icon>
            </el-tooltip>
            <el-tooltip :content="isFavorited ? '取消收藏' : '收藏'" placement="top" :auto-close="1000" v-if="allowActions.includes('favorite')">
              <el-icon class="action-icon favorite-icon" @click.stop="toggleFavorite" :class="{ 'is-favorited': isFavorited }">
                <Star v-if="!isFavorited" />
                <StarFilled v-else />
              </el-icon>
            </el-tooltip>
            <el-tooltip content="重命名" placement="top" :auto-close="1000" v-if="allowActions.includes('rename')">
              <el-icon class="action-icon" @click.stop="$emit('rename', file)">
                <Edit />
              </el-icon>
            </el-tooltip>
            <el-tooltip content="移动" placement="top" :auto-close="1000" v-if="allowActions.includes('move')">
              <el-icon class="action-icon" @click.stop="$emit('move', file)">
                <Position />
              </el-icon>
            </el-tooltip>
            <!-- <el-tooltip content="下载" placement="top" :auto-close="1000">
              <el-icon class="action-icon" @click.stop="$emit('download', file)">
                <Download />
              </el-icon>
            </el-tooltip> -->
            <el-tooltip content="删除" placement="top" :auto-close="1000" v-if="allowActions.includes('delete')">
              <el-icon class="action-icon" @click.stop="$emit('delete', file)">
                <Delete />
              </el-icon>
            </el-tooltip>
          </div>
        </div>
        
        <!-- 文件预览区域 -->
        <div class="file-preview" v-if="isPreviewable">
          <!-- 视频预览 - 使用自定义播放器组件， 如果src以/结尾，/media/:id/:id/xxx.ts -->
          <VideoPlayer 
            v-if="isVideo" 
            :src="`/media/${file.id}`"
            :poster="`/thumbnail/${file.id}`"
            :options="videoOptions"
            :m3u8-path="`${file.m3u8_path || ''}`"
          />
          
          <!-- 图片预览 -->
          <el-image
            v-else-if="isImage"
            class="preview-content image-preview"
            :src="`/media/${file.id}`"
            :zoom-rate="1.02"
            :max-scale="7"
            :min-scale="0.2"
            show-progress
            fit="contain"
            :preview-src-list="imageList.map(item => `/media/${item.id}`)"
            :initial-index="imageIndex"
            :hide-on-click-modal="true"
            :preview-teleported="true"
            :infinite="true"
          />
          <!-- 文本预览 -->
          
          <!-- PDF链接 -->
          <a 
            v-else-if="isPdf" 
            :href="`/media/${file.id}`" 
            target="_blank"
            class="pdf-link"
          >
            查看PDF
          </a>

          <!-- 音频预览 -->
          <audio 
            v-else-if="isAudio" 
            controls 
            class="preview-content audio-preview"
            :src="`/media/${file.id}`"
          ></audio>
        </div>
      </div>
      
      <!-- 文件信息 -->
      <div class="file-info">
        <span>{{ formatFileSize(file.size) }}</span>
        <span>{{ formatDate(file.lastModified) }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { unzipFile, convertToHls } from '../services/userApi'
import VideoPlayer from './VideoPlayer.vue'
import { addToFavorites, removeFromFavorites } from '../services/favoritesApi'

const props = defineProps({
  file: {
    type: Object,
    required: true
  },
  imageIndex: {
    type: Number,
    required: false,
    default: 0
  },
  imageList: {
    type: Array,
    required: false,
    default: () => []
  },
  favorited: {
    type: Boolean,
    default: false
  },
  allowActions: {
    type: Array, // 'viewtext', 'unzip', 'convertts', 'favorite', 'rename', 'move', 'delete', 'converthls'
    default: true
  }
})

const isFavorited = ref(props.favorited)

const emit = defineEmits(['rename', 'delete', 'move', 'download', 'unzip', 'viewText', 'convertTs', 'favorite'])

// 视频播放器配置
const videoOptions = ref({
 
})

// 文件类型判断
const fileExt = computed(() => {
  return props.file.filename.split('.').pop().toLowerCase()
})

const isVideo = computed(() => {
  return ['mp4', 'webm', 'ogg', 'ts', 'avi', 'wmv', 'm3u8'].includes(fileExt.value)
})

const isTs = computed(() => {
  return fileExt.value === 'ts'
})

const isMp4 = computed(() => {
  return fileExt.value === 'mp4'
})

const isImage = computed(() => {
  return ['jpg', 'jpeg', 'png', 'gif'].includes(fileExt.value)
})

const isPdf = computed(() => {
  return fileExt.value === 'pdf'
})

const isAudio = computed(() => {
  return ['mp3', 'wav', 'ogg', 'flac', 'aac'].includes(fileExt.value)
})

const isText = computed(() => {
  return ['txt', 'log', 'md', 'json', 'xml', 'csv'].includes(fileExt.value)
})

const isArchive = computed(() => {
  return ['zip', 'rar', '7z', 'tar', 'gz'].includes(fileExt.value)
})

const isPreviewable = computed(() => {
  return isVideo.value || isImage.value || isPdf.value || isAudio.value
})

const handleConvertToHls = async () => {
  try {
    const res = await convertToHls(props.file.id)
    if (res.success) {
      ElMessage.success('转换成功')
    } else {
      ElMessage.error(res.message || '转换失败')
    }
  } catch (e) {
    console.error('转换失败', e)
    ElMessage.error(`转换失败`)
  }
}

// 格式化文件大小
const formatFileSize = (size) => {
  const sizeInMB = size / (1024 * 1024)
  if (sizeInMB >= 1024) {
    const sizeInGB = (sizeInMB / 1024).toFixed(2)
    return `${sizeInGB} GB`
  } else {
    return `${sizeInMB.toFixed(2)} MB`
  }
}

// 格式化日期
const formatDate = (timestamp) => {
  const date = new Date(timestamp)
  return date.toLocaleDateString()
}

// 查看文本文件
const viewTextFile = () => {
  emit('viewText', props.file)
}

// 解压缩文件
const unzipArchive = async () => {
  try {
    await ElMessageBox.confirm(
      `确定要解压 ${props.file.filename} 吗？`,
      '解压确认',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      }
    )
    
    const res = await unzipFile(props.file.id)
    if (res.success) {
      ElMessage.success('解压成功')
      emit('unzip', props.file)
    } else {
      ElMessage.error(res.message || '解压失败')
    }
  } catch (e) {
    // 用户取消操作
    if (e !== 'cancel') {
      console.error('解压失败', e)
      ElMessage.error('解压失败')
    }
  }
}

// 切换收藏状态
const toggleFavorite = async () => {
  try {
    if (isFavorited.value) {
      // 取消收藏
      const res = await removeFromFavorites(props.file.id)
      if (res.success) {
        isFavorited.value = false
        ElMessage.success('已取消收藏')
        emit('favorite', props.file, isFavorited.value) // 通知父组件刷新收藏列表
      } else {
        ElMessage.error(res.message || '取消收藏失败')
      }
    } else {
      // 添加收藏
      const res = await addToFavorites(props.file.id)
      if (res.success) {
        isFavorited.value = true
        ElMessage.success('已添加到收藏')
        emit('favorite', props.file, isFavorited.value) // 通知父组件刷新收藏列表
      } else {
        ElMessage.error(res.message || '添加收藏失败')
      }
    }
  } catch (e) {
    console.error('收藏操作失败', e)
    ElMessage.error('操作失败')
  }
}
</script>

<style scoped>
.file-item {
  padding: 16px;
  border: 1px solid #ebeef5;
  border-radius: 4px;
  background-color: #fff;
  overflow: hidden;
  color: #303133;
  transition: 0.3s;
  margin-bottom: 15px;
  max-height: 400px;
}

.file-item:hover {
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
}

.file-content {
  display: flex;
  flex-direction: column;
  height: 100%;
  justify-content: space-between;
}

.file-header {
  display: flex;
  align-items: center;
  margin-bottom: 10px;
}

.file-icon {
  font-size: 20px;
  margin-right: 10px;
  color: #409eff;
}

.file-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-actions {
  display: flex;
  gap: 10px;
}

.action-icon {
  cursor: pointer;
  font-size: 16px;
  color: #606266;
  transition: color 0.3s;
}

.action-icon:hover {
  color: #409EFF;
}

.favorite-icon.is-favorited {
  color: #409eff;
}

.file-preview {
  margin: 12px 0;
  display: flex;
  justify-content: center;
  align-items: center;
}

.preview-content {
  max-width: 100%;
  max-height: 400px;
  border-radius: 4px;
}

.video-preview,.image-preview {
  height: 320px;
}

.audio-preview {
  width: 100%;
}

.pdf-link {
  display: block;
  padding: 10px;
  text-align: center;
  background-color: #f5f7fa;
  color: #409eff;
  text-decoration: none;
  border-radius: 4px;
}

.pdf-link:hover {
  background-color: #ecf5ff;
}

.file-info {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #909399;
  margin-top: 10px;
}

</style>