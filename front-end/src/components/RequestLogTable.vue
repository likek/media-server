<template>
  <el-table :data="logs" v-loading="loading" border style="width: 100%">
    <el-table-column prop="time" label="触发时间" width="180" />
    <el-table-column prop="userId" label="用户ID" width="180" />
    <el-table-column prop="userIp" label="用户IP" width="150" />
    <el-table-column prop="region" label="地区" width="120" />
    <el-table-column prop="requestMethod" label="请求方式" width="100" />
    <el-table-column prop="requestUrl" label="请求URL" width="220" />
    <el-table-column prop="status" label="状态码" width="80" />
    <el-table-column prop="userAgent" label="UserAgent" min-width="200" />
    <el-table-column prop="device" label="设备" width="100" />
    <el-table-column prop="os" label="操作系统" width="100" />
    <el-table-column prop="browser" label="浏览器" width="100" />
  </el-table>
</template>

<script setup>
const props = defineProps({
  logs: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false }
})
</script>