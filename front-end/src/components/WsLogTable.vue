<template>
  <div class="table-shell">
    <el-table :data="logs" v-loading="loading" border style="width: 100%">
    <el-table-column label="触发时间" width="150">
      <template #default="scope">
        {{ formatDate(scope.row.time) }}
      </template>
    </el-table-column>
    <el-table-column prop="action" label="操作" width="120" />
    <el-table-column prop="userId" label="用户ID" width="180" show-overflow-tooltip />
    <el-table-column prop="userIp" label="用户IP" width="100" />
    <el-table-column v-if="!isNarrowScreen" prop="userRegion" label="用户地区" width="120" />
    <el-table-column v-if="!isNarrowScreen" prop="location" label="地理位置" min-width="180" show-overflow-tooltip />
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
