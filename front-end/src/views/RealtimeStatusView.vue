<template>
  <div class="realtime-status-view" v-loading="loading">
    <div class="status-header">
      <div class="status-card">
        <div class="status-card__label">在线用户</div>
        <div class="status-card__value">{{ onlineUsers.length }}</div>
      </div>
      <div class="status-card">
        <div class="status-card__label">活跃上传</div>
        <div class="status-card__value">{{ uploadTasks.length }}</div>
      </div>
    </div>

    <section class="status-section">
      <div class="status-section__title">在线用户</div>
      <el-table :data="onlineUsers" stripe empty-text="当前暂无在线用户">
        <el-table-column prop="userId" label="用户ID" min-width="220" />
        <el-table-column prop="ipAddress" label="IP" min-width="120" />
        <el-table-column prop="region" label="地区" min-width="140" />
        <el-table-column label="定位" min-width="220">
          <template #default="{ row }">
            {{ formatLocation(row.location) }}
          </template>
        </el-table-column>
        <el-table-column label="连接时间" min-width="160">
          <template #default="{ row }">
            {{ formatTime(row.connectedAt) }}
          </template>
        </el-table-column>
        <el-table-column label="最近活动" min-width="160">
          <template #default="{ row }">
            {{ formatTime(row.lastSeenAt) }}
          </template>
        </el-table-column>
      </el-table>
    </section>

    <section class="status-section">
      <div class="status-section__title">进行中的上传队列</div>
      <el-table :data="uploadTasks" stripe empty-text="当前暂无进行中的上传任务">
        <el-table-column prop="userId" label="用户ID" min-width="220" />
        <el-table-column label="资源名称" min-width="220">
          <template #default="{ row }">
            {{ row.resourceName || row.summary || '-' }}
          </template>
        </el-table-column>
        <el-table-column prop="kind" label="类型" width="100">
          <template #default="{ row }">
            {{ row.kind === 'folder' ? '文件夹' : '文件' }}
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="110">
          <template #default="{ row }">
            <el-tag :type="row.status === 'processing' ? 'warning' : 'primary'">
              {{ row.status === 'processing' ? '处理中' : '上传中' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="数量" width="90">
          <template #default="{ row }">
            {{ row.itemCount || 1 }}
          </template>
        </el-table-column>
        <el-table-column label="进度" min-width="220">
          <template #default="{ row }">
            <div class="progress-cell">
              <el-progress :percentage="row.progress || 0" :stroke-width="8" />
              <span class="progress-cell__meta">{{ formatBytes(row.receivedBytes) }} / {{ formatBytes(row.totalBytes) }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="parentPath" label="目标目录" min-width="180" />
        <el-table-column label="开始时间" min-width="160">
          <template #default="{ row }">
            {{ formatTime(row.startedAt) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="110" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="row.canCancel"
              size="small"
              type="danger"
              plain
              :loading="cancelingTaskId === row.taskId"
              @click="handleCancelUpload(row)"
            >
              取消
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </section>
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { cancelRealtimeUploadTask, getRealtimeStatus } from '../services/userApi'

const loading = ref(false)
const onlineUsers = ref([])
const uploadTasks = ref([])
const cancelingTaskId = ref('')

const applyRealtimeStatus = (payload = {}) => {
  if (Array.isArray(payload.onlineUsers)) {
    onlineUsers.value = payload.onlineUsers
  }
  if (Array.isArray(payload.uploadTasks)) {
    uploadTasks.value = payload.uploadTasks
  }
}

const loadRealtimeStatus = async () => {
  loading.value = true
  try {
    const response = await getRealtimeStatus()
    applyRealtimeStatus(response || {})
  } catch (error) {
    ElMessage.error('加载实时状态失败')
    console.error('Error loading realtime status:', error)
  } finally {
    loading.value = false
  }
}

const handleRealtimeStatus = (event) => {
  applyRealtimeStatus(event.detail || {})
}

const handleCancelUpload = async (task) => {
  const taskId = task?.taskId
  if (!taskId) return

  try {
    await ElMessageBox.confirm(
      `确认取消“${task.resourceName || task.summary || '该上传任务'}”吗？`,
      '提示',
      {
        type: 'warning',
        confirmButtonText: '确定',
        cancelButtonText: '取消'
      }
    )
  } catch {
    return
  }

  cancelingTaskId.value = taskId
  try {
    await cancelRealtimeUploadTask(taskId)
    ElMessage.success('已发送取消请求')
  } catch (error) {
    ElMessage.error(error?.message || '取消上传失败')
    console.error('Error canceling upload task:', error)
  } finally {
    cancelingTaskId.value = ''
  }
}

const formatTime = (value) => {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString()
}

const formatBytes = (value = 0) => {
  const num = Number(value || 0)
  if (!num) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let size = num
  let unitIndex = 0
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex += 1
  }
  return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
}

const formatLocation = (location) => {
  if (typeof location === 'string' && location) {
    return location
  }
  if (!location || location.latitude === undefined || location.longitude === undefined) {
    return '-'
  }
  return `${Number(location.latitude).toFixed(4)}, ${Number(location.longitude).toFixed(4)}`
}

onMounted(() => {
  loadRealtimeStatus()
  window.addEventListener('ws-realtime-status', handleRealtimeStatus)
})

onBeforeUnmount(() => {
  window.removeEventListener('ws-realtime-status', handleRealtimeStatus)
})
</script>

<style scoped>
.realtime-status-view {
  padding: 20px;
}

.status-header {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 16px;
  margin-bottom: 20px;
}

.status-card {
  border: 1px solid #ebeef5;
  border-radius: 10px;
  padding: 16px;
  background: #fff;
}

.status-card__label {
  font-size: 13px;
  color: #909399;
}

.status-card__value {
  margin-top: 8px;
  font-size: 28px;
  font-weight: 600;
  color: #303133;
}

.status-section {
  margin-bottom: 24px;
}

.status-section__title {
  margin-bottom: 10px;
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

.progress-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.progress-cell__meta {
  font-size: 12px;
  color: #909399;
}
</style>
