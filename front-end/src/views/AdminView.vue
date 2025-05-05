<template>
  <div class="admin-view">
    
    <el-card class="user-table-card">
      <div class="table-operations">
        <el-button @click="refreshData">
            <el-icon><Refresh /></el-icon>
        </el-button>
      </div>
      
      <el-table
        :data="userList"
        style="width: 100%"
        v-loading="loading"
        border
      >
        <el-table-column label="最后访问时间" width="180">
          <template #default="scope">
            {{ formatDate(scope.row.update_time) }}
          </template>
        </el-table-column>
        <el-table-column prop="region" label="地区" width="150" />
        <el-table-column prop="ip" label="IP地址" width="150" />
        <el-table-column prop="device" label="设备" width="120" />
        <el-table-column prop="os" label="操作系统" width="120" />
        <el-table-column prop="browser" label="浏览器" width="120" />
        <el-table-column prop="userId" label="用户ID" width="280" />
      </el-table>
      
      <div class="pagination-container">
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :page-sizes="[10]"
          layout="total, pager"
          :total="total"
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
        />
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { getUserList } from '../services/adminApi'

const userList = ref([])
const loading = ref(false)
const currentPage = ref(1)
const pageSize = ref(10)
const total = ref(0)
const searchQuery = ref('')

// 格式化日期
const formatDate = (dateString) => {
  if (!dateString) return ''
  const date = new Date(dateString)
  return date.toLocaleString()
}

// 获取用户列表
const fetchUserList = async () => {
  loading.value = true
  try {
    const data = await getUserList(currentPage.value, pageSize.value)
    userList.value = data.data
    total.value = data.count
  } catch (error) {
    ElMessage.error('获取用户列表失败')
  } finally {
    loading.value = false
  }
}

// 刷新数据
const refreshData = () => {
  fetchUserList()
}

// 处理页码变化
const handleCurrentChange = (val) => {
  currentPage.value = val
  fetchUserList()
}

// 处理每页条数变化
const handleSizeChange = (val) => {
  pageSize.value = val
  currentPage.value = 1
  fetchUserList()
}

onMounted(() => {
  fetchUserList()
})
</script>

<style scoped>
.admin-view {
  padding: 20px;
}

.user-table-card {
  margin-top: 20px;
}

.table-operations {
  display: flex;
  justify-content: space-between;
  margin-bottom: 20px;
}

.search-input {
  width: 300px;
}

.pagination-container {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
}
</style>