<template>
  <div class="log-manager-view">
    <el-card>
      <div style="margin-bottom: 16px;">
        <el-radio-group v-model="logType" size="small">
          <el-radio-button value="request">请求日志</el-radio-button>
          <el-radio-button value="file">文件访问日志</el-radio-button>
          <el-radio-button value="ws">WS日志</el-radio-button>
        </el-radio-group>
      </div>
      <el-form :model="filters" @submit.prevent="fetchLogs" inline>
        <el-form-item label="用户ID">
          <el-input v-model="filters.userId" placeholder="用户ID" clearable />
        </el-form-item>
        <el-form-item label="用户IP">
          <el-input v-model="filters.userIp" placeholder="用户IP" clearable />
        </el-form-item>
        <el-form-item label="触发时间">
          <el-date-picker v-model="filters.time" type="daterange" range-separator="至" start-placeholder="开始日期" end-placeholder="结束日期" value-format="YYYY-MM-DD" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" native-type="submit">搜索</el-button>
        </el-form-item>
      </el-form>
      <component :is="currentLogComponent" :logs="logs" :loading="loading" />
      <div class="pagination-container">
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.pageSize"
          :page-sizes="[10]"
          layout="total, pager"
          :total="pagination.total"
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
        />
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import RequestLogTable from '../components/RequestLogTable.vue'
import FileAccessedLogTable from '../components/FileAccessedLogTable.vue'
import WsLogTable from '../components/WsLogTable.vue'
import { getRequestLogs, getFileAccessedLogs, getWsLogs } from '../services/logApi'

const logType = ref('request')
const logs = ref([])
const loading = ref(false)
const pagination = ref({ page: 1, pageSize: 10, total: 0 })
const filters = ref({ userId: '', userIp: '', time: [] })

const currentLogComponent = computed(() => {
  switch (logType.value) {
    case 'request': return RequestLogTable
    case 'file': return FileAccessedLogTable
    case 'ws': return WsLogTable
    default: return RequestLogTable
  }
})

async function fetchLogs() {
  loading.value = true
  let res
  const params = {
    page: pagination.value.page,
    pageSize: pagination.value.pageSize,
    userId: filters.value.userId,
    userIp: filters.value.userIp,
    startTime: filters.value.time?.[0] || '',
    endTime: filters.value.time?.[1] || ''
  }
  if (logType.value === 'request') {
    res = await getRequestLogs(params)
  } else if (logType.value === 'file') {
    res = await getFileAccessedLogs(params)
  } else {
    res = await getWsLogs(params)
  }
  logs.value = res?.data?.data || []
  pagination.value.total = res?.data?.count || 0
  loading.value = false
}

function handleSizeChange(size) {
  pagination.value.pageSize = size
  fetchLogs()
}
function handleCurrentChange(page) {
  pagination.value.page = page
  fetchLogs()
}

watch([logType], () => {
  pagination.value.page = 1
  fetchLogs()
})

fetchLogs()
</script>

<style scoped>
.log-manager-view {
  padding: 24px;
}
.pagination-container {
  margin-top: 16px;
  text-align: right;
}
</style>