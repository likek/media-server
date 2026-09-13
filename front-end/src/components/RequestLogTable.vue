<template>
  <div class="table-shell">
    <el-table :data="logs" v-loading="loading" border style="width: 100%">
    <el-table-column label="触发时间" width="150">
      <template #default="scope">
        {{ formatDate(scope.row.time) }}
      </template>
    </el-table-column>
    <el-table-column prop="userId" label="用户ID" width="180" show-overflow-tooltip />
    <el-table-column prop="userIp" label="用户IP" width="100" />
    <el-table-column v-if="!isNarrowScreen" prop="region" label="地区" width="120" />
    <el-table-column prop="requestMethod" label="请求方式" width="100" />
    <el-table-column v-if="!isNarrowScreen" prop="requestBody" label="payload" width="140" show-overflow-tooltip />
    <el-table-column v-if="!isNarrowScreen" prop="requestUrl" label="请求URL" min-width="220" show-overflow-tooltip />
    <el-table-column prop="status" label="状态码" width="80" />
    <el-table-column v-if="!isNarrowScreen" prop="userAgent" label="UserAgent" min-width="220" show-overflow-tooltip />
    <el-table-column v-if="!isNarrowScreen" prop="device" label="设备" width="100" />
    <el-table-column v-if="!isNarrowScreen" prop="os" label="操作系统" width="100" />
    <el-table-column v-if="!isNarrowScreen" prop="browser" label="浏览器" width="100" />
    </el-table>
  </div>
</template>

<script setup>
import { useNarrowScreen } from '../composables/useNarrowScreen'

const props = defineProps({
  logs: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false }
})

const { isNarrowScreen } = useNarrowScreen()

// 格式化日期
const formatDate = (dateString) => {
  if (!dateString) return ''
  const date = new Date(dateString)
  return date.toLocaleString()
}
</script>

<style scoped>
.table-shell {
  overflow-x: auto;
}
</style>
