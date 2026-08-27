<template>
  <div :class='["folder-item", { "newest": isNew }]' @click="$emit('navigate', folder.id)">
    <div class="folder-content">
      <div>
        <div class="folder-header">
          <el-icon class="folder-icon"><Folder /></el-icon>
          <div class="folder-actions">
            <el-tooltip :content="isFavorited ? '取消收藏' : '收藏'" placement="top" :auto-close="1000" v-if="allowActions.includes('favorite')">
              <el-icon class="action-icon favorite-icon" @click.stop="toggleFavorite" :class="{ 'is-favorited': isFavorited }">
                <Star v-if="!isFavorited" />
                <StarFilled v-else />
              </el-icon>
            </el-tooltip>
            <el-tooltip content="重命名" placement="top" :auto-close="1000" v-if="allowActions.includes('rename')">
              <el-icon class="action-icon" :class="{ 'is-disabled': isActionDisabled('rename') }" @click.stop="emitProtected('rename', folder, 'rename')" >
                <Edit />
              </el-icon>
            </el-tooltip>
            <el-tooltip content="移动" placement="top" :auto-close="1000" v-if="allowActions.includes('move')">
              <el-icon class="action-icon" :class="{ 'is-disabled': isActionDisabled('move') }" @click.stop="emitProtected('move', folder, 'move')">
                <Right />
              </el-icon>
            </el-tooltip>
            <el-tooltip content="删除" placement="top" :auto-close="1000" v-if="allowActions.includes('delete')">
              <el-icon class="action-icon" :class="{ 'is-disabled': isActionDisabled('delete') }" @click.stop="emitProtected('delete', folder, 'delete')">
                <Delete />
              </el-icon>
            </el-tooltip>
          </div>
        </div>
        <div class="folder-cover-wrap">
          <img :src="folderBackSvg" class="folder-cover-back" alt="" aria-hidden="true" />
          <div class="folder-cover-frame">
            <div class="folder-cover-sheet" aria-hidden="true"></div>
            <el-image v-if="coverSrc" :src="coverSrc" fit="cover" class="folder-cover" />
            <div v-else class="folder-cover folder-cover-placeholder" aria-hidden="true">
              <el-icon class="folder-cover-placeholder-icon"><Document /></el-icon>
            </div>
          </div>
          <img :src="folderFrontSvg" class="folder-cover-front" alt="" aria-hidden="true" />
        </div>
        <div>
          <span class="folder-name">{{ folder.filename }}</span>
        </div>
      </div>
      <!-- 文件信息 -->
      <div class="file-info">
        <span>
          <!-- {{ formatFileSize(folder.size) }} -->
        </span>
        <span>{{ formatLastModified }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { addToFavorites, removeFromFavorites } from '../services/favoritesApi'
import folderBackSvg from '../res/back.svg'
import folderFrontSvg from '../res/front.svg'

const props = defineProps({
  folder: {
    type: Object,
    required: true
  },
  favorited: {
    type: Boolean,
    default: false
  },
  allowActions: {
    type: Array, // 'favorite', 'rename', 'move', 'delete'
    default: true
  },
  disabledActions: {
    type: Array,
    default: () => []
  }
})

// 格式化日期
const formatDate = (timestamp) => {
  const date = new Date(timestamp)
  return date.toLocaleDateString()
}

const formatLastModified = ref(formatDate(props.folder.lastModified))
const isFavorited = ref(props.favorited)
const isNew = ref(Date.now() - new Date(props.folder.lastModified).getTime() < 1000 * 60 * 60 * 24 * 2)
const coverSrc = computed(() => props.folder.cover_file_id ? `/preview/${props.folder.cover_file_id}` : '')

const emit = defineEmits(['navigate', 'rename', 'move', 'delete', 'favorite'])

const isActionDisabled = (action) => {
  return props.disabledActions.includes(action)
}

const emitProtected = (eventName, payload, action) => {
  if (isActionDisabled(action)) {
    return
  }
  emit(eventName, payload)
}

// // 格式化文件大小
// const formatFileSize = (size) => {
//   const sizeInMB = size / (1024 * 1024)
//   if (sizeInMB >= 1024) {
//     const sizeInGB = (sizeInMB / 1024).toFixed(2)
//     return `${sizeInGB} GB`
//   } else {
//     return `${sizeInMB.toFixed(2)} MB`
//   }
// }

// 切换收藏状态
const toggleFavorite = async () => {
  try {
    if (isFavorited.value) {
      await removeFromFavorites(props.folder.id)
      isFavorited.value = false
      ElMessage.success('已从收藏中移除')
    } else {
      await addToFavorites(props.folder.id)
      isFavorited.value = true
      ElMessage.success('已添加到收藏')
    }
    emit('favorite', props.folder, isFavorited.value) // 通知父组件刷新收藏列表
  } catch (error) {
    console.error('切换收藏状态失败:', error)
    ElMessage.error('操作失败，请重试')
  }
}
</script>

<style scoped>
.folder-item {
  background-color: #f5f7fa;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
  cursor: pointer;
  transition: all 0.3s;
}

@media (any-hover: hover) {
  .folder-item:hover {
    background-color: #e6f1fc;
    transform: translateY(-2px);
    box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
  }
}

.folder-item:active {
    background-color: #e6f1fc;
    transform: translateY(-2px);
    box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
}

.favorite-icon.is-favorited {
  color: #409eff;
}

.folder-content {
  display: flex;
  flex-direction: column;
  height: 100%;
  justify-content: space-between;
}

.folder-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.folder-cover-wrap {
  position: relative;
  width: 100%;
  max-width: 340px;
  aspect-ratio: 1 / 1;
  margin: 0 auto 12px;
  overflow: hidden;
}

.folder-cover-back,
.folder-cover-front {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  pointer-events: none;
  transform-origin: center center;
}

.folder-cover-back {
  z-index: 1;
  transform: scale(1.14) translateY(-1%);
}

.folder-cover-frame {
  position: absolute;
  left: 11%;
  right: 11%;
  top: 18%;
  bottom: 24%;
  z-index: 2;
  border-radius: 12px;
}

.folder-cover-sheet,
.folder-cover {
  position: absolute;
  border-radius: 12px;
}

.folder-cover-sheet {
  top: 4px;
  left: 12px;
  right: 26px;
  bottom: 12px;
  background: linear-gradient(180deg, #d8dbdf 0%, #cfd2d6 100%);
  box-shadow: 0 6px 14px rgba(0, 0, 0, 0.08);
  z-index: 1;
}

.folder-cover {
  top: 10px;
  left: 0;
  width: calc(100% - 18px);
  height: calc(100% - 26px);
  background-color: #dfe8f5;
  box-shadow: 0 8px 18px rgba(0, 0, 0, 0.12);
  z-index: 2;
}

.folder-cover-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(180deg, #eef4fb 0%, #dbe7f6 100%);
}

.folder-cover-placeholder-icon {
  font-size: 72px;
  color: #cfd2d6;
}

.folder-cover-front {
  z-index: 3;
  transform: scale(1.14) translateY(6%);
}

.folder-icon {
  color: #409eff;
  font-size: 20px;
  margin-right: 8px;
  vertical-align: text-bottom;
}

.folder-name {
  font-size: 16px;
  font-weight: 500;
  flex: 1;
  word-break: break-all;  /* 在任意字符间断行 */
  word-wrap: break-word;  /* 对长单词进行换行 */
  white-space: pre-wrap; /* 保留空格和换行，允许文本换行 */
}

.folder-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.action-icon {
  color: #909399;
  cursor: pointer;
  font-size: 14px;
}

.action-icon.is-disabled {
  cursor: not-allowed;
  color: #c0c4cc;
}

@media (any-hover: hover) {
  .action-icon:hover {
    color: #409eff;
  }

  .action-icon.is-disabled:hover {
    color: #c0c4cc;
  }
}

.file-info {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #909399;
  margin-top: 10px;
}
</style>
