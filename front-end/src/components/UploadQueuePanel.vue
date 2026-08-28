<template>
  <div class="upload-panel">
    <div class="upload-panel__header">
      <div>
        <div class="upload-panel__title">上传队列</div>
        <div class="upload-panel__summary">{{ summary }}</div>
      </div>
      <div class="upload-panel__header-actions">
        <el-button link @click="$emit('clear-completed')" v-if="completedCount">清除完成</el-button>
        <el-tooltip :content="collapsed ? '展开队列' : '折叠队列'" placement="top">
          <el-button link class="upload-panel__toggle-btn" @click="$emit('toggle')">
            <el-icon>
              <Expand v-if="collapsed" />
              <Fold v-else />
            </el-icon>
          </el-button>
        </el-tooltip>
      </div>
    </div>
    <div v-show="!collapsed" class="upload-panel__list">
      <div v-for="task in displayTasks" :key="task.id" class="upload-task">
        <div class="upload-task__top">
          <div class="upload-task__name-wrap">
            <el-icon v-if="task.kind === 'folder'" class="upload-task__kind-icon">
              <FolderOpened />
            </el-icon>
            <div class="upload-task__name" :title="task.file.name">{{ task.file.name }}</div>
          </div>
          <div class="upload-task__percent">{{ task.status === 'uploading' ? `${task.progress}%` : '' }}</div>
        </div>
        <div class="upload-task__meta">
          <span>目标：{{ task.folderName }}</span>
          <span>{{ formatFileSize(task.file.size) }}</span>
        </div>
        <el-progress
          :percentage="task.status === 'success' ? 100 : task.progress"
          :status="task.status === 'failed' ? 'exception' : (task.status === 'success' ? 'success' : undefined)"
          :show-text="false"
          :stroke-width="6"
        />
        <div class="upload-task__bottom">
          <span :class="['upload-task__status', `is-${task.status}`]">{{ getUploadStatusText(task) }}</span>
          <div class="upload-task__actions">
            <el-button v-if="task.status === 'failed'" link size="small" @click="$emit('retry', task)">重试</el-button>
            <el-button v-if="task.status === 'queued' || task.status === 'uploading'" link size="small" @click="$emit('cancel', task)">取消</el-button>
            <el-button v-if="task.status !== 'uploading'" link size="small" @click="$emit('remove', task.id)">移除</el-button>
          </div>
        </div>
        <div v-if="task.error" class="upload-task__error">{{ task.error }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  tasks: {
    type: Array,
    default: () => []
  },
  summary: {
    type: String,
    default: ''
  },
  completedCount: {
    type: Number,
    default: 0
  },
  collapsed: {
    type: Boolean,
    default: false
  }
})

defineEmits(['clear-completed', 'toggle', 'retry', 'cancel', 'remove'])

const displayTasks = computed(() => {
  return [...props.tasks].reverse()
})

const formatFileSize = (size = 0) => {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`
  return `${(size / 1024 / 1024 / 1024).toFixed(1)} GB`
}

const getUploadStatusText = (task) => {
  const statusMap = {
    queued: '等待上传',
    uploading: '上传中',
    success: '上传成功',
    failed: '上传失败',
    canceled: '已取消'
  }
  return statusMap[task.status] || '未知状态'
}
</script>

<style scoped>
.upload-panel {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 30;
  width: min(360px, calc(100vw - 32px));
  max-height: min(60vh, 520px);
  display: flex;
  flex-direction: column;
  border: 1px solid #dcdfe6;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.97);
  box-shadow: 0 12px 32px rgba(15, 23, 42, 0.16);
  backdrop-filter: blur(8px);
}

.upload-panel__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px 10px;
  border-bottom: 1px solid #ebeef5;
}

.upload-panel__header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.upload-panel__toggle-btn {
  font-size: 16px;
}

.upload-panel__title {
  font-size: 15px;
  font-weight: 600;
  color: #303133;
}

.upload-panel__summary {
  margin-top: 2px;
  font-size: 12px;
  color: #909399;
}

.upload-panel__list {
  overflow-y: auto;
  padding: 10px 12px 12px;
}

.upload-task {
  padding: 10px 10px 8px;
  border: 1px solid #ebeef5;
  border-radius: 12px;
  background: #fff;
}

.upload-task + .upload-task {
  margin-top: 10px;
}

.upload-task__top,
.upload-task__meta,
.upload-task__bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.upload-task__name-wrap {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
}

.upload-task__kind-icon {
  flex-shrink: 0;
  color: #409eff;
  font-size: 14px;
}

.upload-task__name {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 500;
  color: #303133;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.upload-task__percent,
.upload-task__meta {
  font-size: 12px;
  color: #909399;
}

.upload-task__meta {
  margin: 6px 0 8px;
}

.upload-task__bottom {
  margin-top: 8px;
}

.upload-task__status {
  font-size: 12px;
}

.upload-task__status.is-uploading {
  color: #409eff;
}

.upload-task__status.is-success {
  color: #67c23a;
}

.upload-task__status.is-failed {
  color: #f56c6c;
}

.upload-task__status.is-canceled,
.upload-task__status.is-queued {
  color: #909399;
}

.upload-task__actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.upload-task__error {
  margin-top: 6px;
  font-size: 12px;
  color: #f56c6c;
  word-break: break-word;
}

@media (max-width: 768px) {
  .upload-panel {
    right: 12px;
    bottom: 12px;
    width: calc(100vw - 24px);
    max-height: 52vh;
  }
}
</style>
