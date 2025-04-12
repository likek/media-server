<template>
  <div class="file-item">
    <div class="file-content">
      <div class="file-header">
        <el-icon class="file-icon">
            <VideoCamera v-if="isVideo"/>
            <Picture v-else-if="isImage" />
            <Collection v-else-if="isArchive"/>
            <Reading v-else-if="isText"/>
            <Microphone v-else-if="isAudio"/>
            <Document v-else/>
        </el-icon>
        <span class="file-name">{{ file.filename }}</span>
        <div class="file-actions">
          <el-icon class="action-icon" @click.stop="viewTextFile" v-if="isText" >
            <View />
          </el-icon>
          <el-icon class="action-icon" @click.stop="unzipArchive" v-if="isArchive" >
            <FolderOpened />
          </el-icon>
          <el-icon class="action-icon" @click.stop="$emit('convertTs', file)" v-if="isTs">
            <VideoPlay />
          </el-icon>
          <el-icon class="action-icon" @click.stop="$emit('rename', file)">
            <Edit />
          </el-icon>
          <el-icon class="action-icon" @click.stop="$emit('move', file)">
            <Position />
          </el-icon>
          <el-icon class="action-icon" @click.stop="$emit('download', file)">
            <Download />
          </el-icon>
          <el-icon class="action-icon" @click.stop="$emit('delete', file)">
            <Delete />
          </el-icon>
        </div>
      </div>
      
      <!-- 文件预览区域 -->
      <div class="file-preview" v-if="isPreviewable">
        <!-- 视频预览 -->
        <video 
          v-if="isVideo" 
          controls 
          class="preview-content video-preview"
          :poster="file.thumbnail ? file.thumbnail : ''"
          :src="file.path"
          preload="metadata"
        ></video>
        
        <!-- 图片预览 -->
        <el-image
          v-else-if="isImage"
          class="preview-content image-preview"
          :src="file.path"
          :zoom-rate="1.02"
          :max-scale="7"
          :min-scale="0.2"
          show-progress
          fit="contain"
          :preview-src-list="imageList"
          :initial-index="imageIndex"
          :hide-on-click-modal="true"
          :preview-teleported="true"
          :infinite="true"
        />
        <!-- 文本预览 -->
        
        <!-- PDF链接 -->
        <a 
          v-else-if="isPdf" 
          :href="file.path" 
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
          :src="file.path"
        ></audio>
      </div>
      
      <!-- 文件信息 -->
      <div class="file-info">
        <span>大小: {{ formatFileSize(file.size) }}</span>
        <span>修改日期: {{ formatDate(file.lastModified) }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { Document, Edit, Delete, Position, Download, Folder } from '@element-plus/icons-vue'
import { ElMessageBox } from 'element-plus'
import { unzipFile } from '../services/api'

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
})

const emit = defineEmits(['rename', 'delete', 'move', 'download', 'refresh', 'viewText', 'convertTs'])

// 文件类型判断
const fileExt = computed(() => {
  return props.file.filename.split('.').pop().toLowerCase()
})

const isVideo = computed(() => {
  return ['mp4', 'webm', 'ogg', 'ts', 'avi'].includes(fileExt.value)
})

const isTs = computed(() => {
  return fileExt.value === 'ts'
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
const formatDate = (date) => {
  return new Date(date).toLocaleString()
}

// 查看文本文件
const viewTextFile = () => {
  emit('viewText', props.file)
}

const unzipArchive = async () => {
  try {
    const response = await unzipFile(props.file.path)
    if (response.success) {
      ElMessageBox.alert('文件解压成功', '成功', { type: 'success' })
      emit('refresh') // 通知父组件刷新文件列表
    } else {
      ElMessageBox.alert(response.message || '解压失败', '错误', { type: 'error' })
    }
  } catch (error) {
    console.error('Error unzipping file:', error)
    ElMessageBox.alert('解压失败', '错误', { type: 'error' })
  }
}
</script>

<style scoped>
.file-item {
  background-color: #fff;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.05);
  transition: all 0.3s;
}

.file-item:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 16px 0 rgba(0, 0, 0, 0.1);
}

.file-content {
  display: flex;
  flex-direction: column;
}

.file-header {
  display: flex;
  align-items: center;
  margin-bottom: 12px;
}

.file-icon {
  color: #909399;
  font-size: 18px;
  margin-right: 8px;
}

.file-name {
  font-size: 16px;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-actions {
  display: flex;
  gap: 8px;
}

.action-icon {
  cursor: pointer;
  color: #606266;
  transition: all 0.3s;
}

.action-icon:hover {
  color: #409EFF;
  transform: scale(1.2);
}

.file-preview {
  margin: 12px 0;
  display: flex;
  justify-content: center;
  align-items: center;
}

.preview-content {
  max-width: 100%;
  max-height: 240px;
  border-radius: 4px;
}

.video-preview,.image-preview {
  height: 240px;
}

.audio-preview {
  width: 100%;
}

.pdf-link, .text-link {
  display: inline-block;
  text-decoration: none;
  margin: 8px 0;
}

.archive-info {
  display: flex;
  gap: 10px;
  margin: 12px 0;
}

.file-info {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #909399;
  margin-top: 12px;
}

/* 文本查看对话框样式 */
.txt-dialog .el-dialog__body {
  padding: 10px;
}

.txt-content-wrapper {
  max-height: 60vh;
  overflow-y: auto;
  background-color: #f5f7fa;
  border-radius: 4px;
  padding: 10px;
}

.txt-content {
  white-space: pre-wrap;
  word-break: break-all;
  font-family: monospace;
  margin: 0;
}

.txt-dialog-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 15px;
  padding: 0 10px;
}
</style>