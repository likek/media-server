<template>
  <div class="file-item">
    <div class="file-content">
      <div>
        <div class="file-header">
          <el-icon class="file-icon">
              <VideoCamera v-if="isVideo"/>
              <Picture v-else-if="isImage" />
              <Collection v-else-if="isArchive"/>
              <Reading v-else-if="isText || isEnhancedText"/>
              <Microphone v-else-if="isAudio"/>
              <Document v-else/>
          </el-icon>
          <div class="file-actions">
            <el-tooltip content="所在文件夹" placement="top" :auto-close="1000" v-if="allowActions.includes('navigateParent')">
              <el-icon class="action-icon" @click.stop="$emit('navigate', displayFile.parent_id)"><FolderOpened /></el-icon>
            </el-tooltip>
            <el-tooltip :content="previewTooltipLabel" placement="top" :auto-close="1000" v-if="canUseEyePreview">
              <el-icon class="action-icon" @click.stop="previewCurrentFile">
                <View />
              </el-icon>
            </el-tooltip>
            <el-tooltip content="解压缩" placement="top" :auto-close="1000" v-if="isArchive && allowActions.includes('unzip')">
              <el-icon class="action-icon" @click.stop="unzipArchive">
                <Box />
              </el-icon>
            </el-tooltip>
            <el-tooltip content="转换为MP4" placement="top" :auto-close="1000" v-if="isTs && allowActions.includes('convertts')">
              <el-icon class="action-icon" @click.stop="$emit('convertTs', displayFile)">
                <VideoPlay />
              </el-icon>
            </el-tooltip>
            <el-tooltip content="转换为HLS" placement="top" :auto-close="1000" v-if="isMp4 && allowActions.includes('converthls')">
              <el-icon class="action-icon" :class="{ 'is-disabled': isActionDisabled('converthls') }" @click.stop="handleConvertToHls">
                <Switch />
              </el-icon>
            </el-tooltip>
            <el-tooltip content="设为文件夹封面" placement="top" :auto-close="1000" v-if="canSetFolderCover && allowActions.includes('setFolderCover')">
              <el-icon class="action-icon" :class="{ 'is-disabled': isActionDisabled('setFolderCover') }" @click.stop="handleSetFolderCover">
                <FolderChecked />
              </el-icon>
            </el-tooltip>
            <el-tooltip content="查相似" placement="top" :auto-close="1000" v-if="isImage && allowActions.includes('searchSimilar')">
              <span class="action-icon action-icon--similar-search" @click.stop="handleSearchSimilar">
                <Picture class="similar-search-icon__picture" />
                <Search class="similar-search-icon__badge" />
              </span>
            </el-tooltip>
            <el-tooltip :content="isFavorited ? '取消收藏' : '收藏'" placement="top" :auto-close="1000" v-if="allowActions.includes('favorite')">
              <el-icon class="action-icon favorite-icon" @click.stop="toggleFavorite" :class="{ 'is-favorited': isFavorited }">
                <Star v-if="!isFavorited" />
                <StarFilled v-else />
              </el-icon>
            </el-tooltip>
            <el-tooltip content="重命名" placement="top" :auto-close="1000" v-if="allowActions.includes('rename')">
              <el-icon class="action-icon" :class="{ 'is-disabled': isActionDisabled('rename') }" @click.stop="emitProtected('rename', displayFile, 'rename')">
                <Edit />
              </el-icon>
            </el-tooltip>
            <el-tooltip content="移动" placement="top" :auto-close="1000" v-if="allowActions.includes('move')">
              <el-icon class="action-icon" :class="{ 'is-disabled': isActionDisabled('move') }" @click.stop="emitProtected('move', displayFile, 'move')">
                <Right />
              </el-icon>
            </el-tooltip>
            <el-tooltip content="下载" placement="top" :auto-close="1000" v-if="allowActions.includes('download')">
              <el-icon class="action-icon" @click.stop="$emit('download', displayFile)">
                <Download />
              </el-icon>
            </el-tooltip>
            <el-tooltip content="删除" placement="top" :auto-close="1000" v-if="allowActions.includes('delete')">
              <el-icon class="action-icon" :class="{ 'is-disabled': isActionDisabled('delete') }" @click.stop="emitProtected('delete', displayFile, 'delete')">
                <Delete />
              </el-icon>
            </el-tooltip>
          </div>
        </div>
        <div>
          <span class="file-name">{{ displayFile.m3u8_path ? '_' : '' }}{{ displayFile.filename }}</span>
        </div>
        <!-- 文件预览区域 -->
        <div class="file-preview" v-if="hasInlinePreview">
          <!-- 视频预览 - 使用自定义播放器组件， 如果src以/结尾，/media/:id/:id/xxx.ts -->
          <VideoPlayer 
            v-if="isVideo" 
            :src="`/media/${displayFile.id}`"
            :poster="`/thumbnail/${displayFile.id}`"
            :options="videoOptions"
            :m3u8-path="`${displayFile.m3u8_path || ''}`"
            :thumbnail-btn="true"
            :video-id="displayFile.id"
            @active-file-change="handlePlayerActiveFileChange"
          />
          
          <!-- 图片预览 -->
          <el-image
            v-else-if="isImage"
            class="preview-content image-preview"
            :src="`/preview/${displayFile.id}`"
            :zoom-rate="1.02"
            :max-scale="7"
            :min-scale="0.2"
            show-progress
            fit="contain"
            :preview-src-list="imageList.map(item => `/preview/${item.id}`)"
            :initial-index="imageIndex"
            :hide-on-click-modal="true"
            :preview-teleported="true"
            :infinite="true"
          />
          <!-- 音频预览 -->
          <audio 
            v-else-if="isAudio" 
            controls 
            class="preview-content audio-preview"
            :src="`/media/${displayFile.id}`"
          ></audio>
        </div>
      </div>
      
      <!-- 文件信息 -->
      <div class="file-info">
        <span>{{ formatFileSize(displayFile.size) }}</span>
        <span>{{ formatDate(displayFile.lastModified) }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { unzipFile, convertToHls, setFolderCover } from '../services/userApi'
import VideoPlayer from './VideoPlayer.vue'
import { addToFavorites, removeFromFavorites } from '../services/favoritesApi'

const VIDEO_EXTENSIONS = ['mp4', 'webm', 'ogg', 'ts', 'avi', 'wmv', 'm3u8', 'mov', 'm4v']
const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'bmp']
const AUDIO_EXTENSIONS = ['mp3', 'wav', 'ogg', 'flac', 'aac']
const OFFICE_EXTENSIONS = ['docx', 'xlsx', 'pptx']
const ENHANCED_TEXT_EXTENSIONS = ['md', 'markdown', 'json', 'xml', 'csv']
const TEXT_EXTENSIONS = ['txt', 'log']
const ARCHIVE_EXTENSIONS = ['zip', 'rar', '7z', 'tar', 'gz']

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
    type: Array, // 'viewtext', 'unzip', 'convertts', 'favorite', 'rename', 'move', 'delete', 'converthls', 'navigateParent', 'setFolderCover', 'searchSimilar'
    default: true
  },
  disabledActions: {
    type: Array,
    default: () => []
  }
})

const displayFile = ref(props.file)
const isFavorited = ref(Boolean(props.favorited))

const emit = defineEmits(['rename', 'delete', 'move', 'download', 'unzip', 'viewText', 'convertTs', 'favorite', 'navigate', 'folderCoverUpdated', 'searchSimilar', 'previewPdf', 'previewOffice', 'previewMarkdown'])

const isActionDisabled = (action) => {
  return props.disabledActions.includes(action)
}

const emitProtected = (eventName, payload, action) => {
  if (isActionDisabled(action)) {
    return
  }
  emit(eventName, payload)
}

// 视频播放器配置
const videoOptions = ref({
 
})

watch(() => props.file, (newFile) => {
  displayFile.value = newFile
  isFavorited.value = Boolean(props.favorited)
})

watch(() => props.favorited, (newValue) => {
  if (displayFile.value?.id === props.file?.id) {
    isFavorited.value = Boolean(newValue)
  }
})

// 文件类型判断
const fileExt = computed(() => {
  const filename = displayFile.value?.filename || ''
  return filename.split('.').pop()?.toLowerCase() || ''
})

const isVideo = computed(() => {
  return VIDEO_EXTENSIONS.includes(fileExt.value)
})

const isTs = computed(() => {
  return fileExt.value === 'ts'
})

const isMp4 = computed(() => {
  return fileExt.value === 'mp4'
})

const isImage = computed(() => {
  return IMAGE_EXTENSIONS.includes(fileExt.value)
})

const canSetFolderCover = computed(() => {
  return isImage.value && displayFile.value?.parent_id !== null && displayFile.value?.parent_id !== undefined
})

const isPdf = computed(() => {
  return fileExt.value === 'pdf'
})

const isOffice = computed(() => {
  return OFFICE_EXTENSIONS.includes(fileExt.value)
})

const isEnhancedText = computed(() => {
  return ENHANCED_TEXT_EXTENSIONS.includes(fileExt.value)
})

const isAudio = computed(() => {
  return AUDIO_EXTENSIONS.includes(fileExt.value)
})

const isText = computed(() => {
  return TEXT_EXTENSIONS.includes(fileExt.value)
})

const previewTypeLabel = computed(() => {
  if (['md', 'markdown'].includes(fileExt.value)) return 'Markdown'
  if (fileExt.value === 'json') return 'JSON'
  if (fileExt.value === 'xml') return 'XML'
  if (fileExt.value === 'csv') return 'CSV'
  return '文本'
})

const previewTooltipLabel = computed(() => {
  return `预览${previewTypeLabel.value}`
})

const canUseEyePreview = computed(() => {
  return allowPreviewByEye.value && (isText.value || isEnhancedText.value || isPdf.value || isOffice.value)
})

const isArchive = computed(() => {
  return ARCHIVE_EXTENSIONS.includes(fileExt.value)
})

const hasInlinePreview = computed(() => {
  return isVideo.value || isImage.value || isAudio.value
})

const allowPreviewByEye = computed(() => {
  return props.allowActions.includes('viewtext')
})

const handleConvertToHls = async () => {
  if (isActionDisabled('converthls')) {
    return
  }
  try {
    const res = await convertToHls(displayFile.value.id)
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

const handleSetFolderCover = async () => {
  if (isActionDisabled('setFolderCover')) {
    return
  }
  try {
    const res = await setFolderCover(displayFile.value.id)
    if (res.success) {
      ElMessage.success('已设为文件夹封面')
      emit('folderCoverUpdated', displayFile.value, res)
    } else {
      ElMessage.error(res.message || '设置文件夹封面失败')
    }
  } catch (e) {
    console.error('设置文件夹封面失败', e)
    ElMessage.error('设置文件夹封面失败')
  }
}

const handleSearchSimilar = () => {
  emit('searchSimilar', displayFile.value)
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
  return date.toLocaleString()
}

const handlePlayerActiveFileChange = ({ file }) => {
  if (!file) return
  displayFile.value = file
  isFavorited.value = Boolean(file.favorited)
}

// 查看文本文件
const viewTextFile = () => {
  emit('viewText', displayFile.value)
}

const previewPdfFile = () => {
  emit('previewPdf', displayFile.value)
}

const previewOfficeFile = () => {
  emit('previewOffice', displayFile.value)
}

const previewEnhancedTextFile = () => {
  emit('previewMarkdown', displayFile.value)
}

const previewCurrentFile = () => {
  if (isText.value) {
    viewTextFile()
    return
  }
  if (isEnhancedText.value) {
    previewEnhancedTextFile()
    return
  }
  if (isPdf.value) {
    previewPdfFile()
    return
  }
  if (isOffice.value) {
    previewOfficeFile()
  }
}

// 解压缩文件
const unzipArchive = async () => {
  try {
    await ElMessageBox.confirm(
      `确定要解压 ${displayFile.value.filename} 吗？`,
      '解压确认',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      }
    )
    
    const res = await unzipFile(displayFile.value.id)
    if (res.success) {
      ElMessage.success('解压成功')
      emit('unzip', displayFile.value)
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
      const res = await removeFromFavorites(displayFile.value.id)
      if (res.success) {
        isFavorited.value = false
        ElMessage.success('已取消收藏')
        emit('favorite', displayFile.value, isFavorited.value) // 通知父组件刷新收藏列表
      } else {
        ElMessage.error(res.message || '取消收藏失败')
      }
    } else {
      // 添加收藏
      const res = await addToFavorites(displayFile.value.id)
      if (res.success) {
        isFavorited.value = true
        ElMessage.success('已添加到收藏')
        emit('favorite', displayFile.value, isFavorited.value) // 通知父组件刷新收藏列表
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
}

@media (any-hover: hover) {
  .file-item:hover {
    box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
  }
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
  justify-content: space-between;
}

.file-icon {
  font-size: 20px;
  margin-right: 10px;
  color: #409eff;
}

.file-name {
  /*flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;*/

  font-size: 16px;
  font-weight: 500;
  flex: 1;
  word-break: break-all;  /* 在任意字符间断行 */
  word-wrap: break-word;  /* 对长单词进行换行 */
  white-space: pre-wrap; /* 保留空格和换行，允许文本换行 */
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

.action-icon--similar-search {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
}

.similar-search-icon__picture {
  width: 15px;
  height: 15px;
}

.similar-search-icon__badge {
  position: absolute;
  right: -4px;
  bottom: -4px;
  width: 11px;
  height: 11px;
  padding: 0;
}

.action-icon.is-disabled {
  cursor: not-allowed;
  color: #c0c4cc;
}

@media (any-hover: hover) {
  .action-icon:hover {
    color: #409EFF;
  }

  .action-icon.is-disabled:hover {
    color: #c0c4cc;
  }
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

.file-info {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #909399;
  margin-top: 10px;
}

</style>
