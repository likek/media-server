<template>
  <el-table :data="logs" v-loading="loading" border style="width: 100%">
    <el-table-column label="触发时间" width="150">
      <template #default="scope">
        {{ formatDate(scope.row.time) }}
      </template>
    </el-table-column>
    <el-table-column prop="userId" label="用户ID" width="180" />
    <el-table-column prop="userIp" label="用户IP" width="120" />
    <el-table-column prop="filePath" label="文件路径" min-width="120" />
  </el-table>
</template>

<script setup>
const props = defineProps({
  logs: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false }
})

// 格式化日期
const formatDate = (dateString) => {
  if (!dateString) return ''
  const date = new Date(dateString)
  return date.toLocaleString()
}
</script>