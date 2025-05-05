<template>
  <el-table :data="logs" v-loading="loading" border style="width: 100%">
    <el-table-column prop="time" label="触发时间" width="180" />
    <el-table-column prop="userId" label="用户ID" width="180" />
    <el-table-column prop="userIp" label="用户IP" width="150" />
    <el-table-column prop="filePath" label="文件路径" min-width="300" />
  </el-table>
</template>

<script setup>
const props = defineProps({
  logs: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false }
})
</script>