<template>
  <div class="folder-item" @click="$emit('navigate', folder.id)">
    <div class="folder-content">
      <div class="folder-header">
        <el-icon class="folder-icon"><Folder /></el-icon>
        <div class="folder-actions">
          <el-tooltip :content="isFavorited ? '取消收藏' : '收藏'" placement="top" :auto-close="1000">
            <el-icon class="action-icon favorite-icon" @click.stop="toggleFavorite" :class="{ 'is-favorited': isFavorited }">
              <Star v-if="!isFavorited" />
              <StarFilled v-else />
            </el-icon>
          </el-tooltip>
          <el-tooltip content="重命名" placement="top" :auto-close="1000">
            <el-icon class="action-icon" @click.stop="$emit('rename', folder)" v-if="allowActions">
              <Edit />
            </el-icon>
          </el-tooltip>
          <el-tooltip content="移动" placement="top" :auto-close="1000">
            <el-icon class="action-icon" @click.stop="$emit('move', folder)" v-if="allowActions">
              <Position />
            </el-icon>
          </el-tooltip>
          <el-tooltip content="删除" placement="top" :auto-close="1000">
            <el-icon class="action-icon" @click.stop="$emit('delete', folder)" v-if="allowActions">
              <Delete />
            </el-icon>
          </el-tooltip>
        </div>
      </div>
      <div>
        <span class="folder-name">{{ folder.filename }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { addToFavorites, removeFromFavorites } from '../services/api'

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
    type: Boolean,
    default: true
  }
})

const isFavorited = ref(props.favorited)

const emit = defineEmits(['navigate', 'rename', 'move', 'delete', 'favorite'])

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

.folder-item:hover {
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
}

.folder-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
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
  gap: 8px;
}

.action-icon {
  color: #909399;
  cursor: pointer;
  font-size: 14px;
}

.action-icon:hover {
  color: #409eff;
}
</style>