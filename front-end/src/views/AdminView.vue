<template>
  <div class="admin-view">
    
    <el-card class="user-table-card">
      <div class="table-operations">
        <el-input
          v-model.trim="keyword"
          class="search-input"
          placeholder="搜索用户ID / iv / IP / 地区"
          clearable
          @keyup.enter="handleSearch"
          @clear="handleSearch"
        />
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
        <el-table-column label="黑名单解除时间" width="180">
          <template #default="scope">
            {{ formatDate(scope.row.blacklistExpiresAt) || '-' }}
          </template>
        </el-table-column>
        <el-table-column prop="region" label="地区" width="150" />
        <el-table-column prop="ip" label="IP地址" width="150" />
        <el-table-column prop="device" label="设备" width="120" />
        <el-table-column prop="os" label="操作系统" width="120" />
        <el-table-column prop="browser" label="浏览器" width="120" />
        <el-table-column prop="userId" label="用户ID" width="280" />
        <el-table-column prop="iv" label="iv" width="280" />
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="scope">
            <el-button
              v-if="!(currentUserId && scope.row.userId === currentUserId && !scope.row.isBlacklisted)"
              size="small"
              :type="scope.row.isBlacklisted ? 'success' : 'danger'"
              :loading="actionLoadingUserId === scope.row.userId"
              @click="toggleBlacklist(scope.row)"
            >
              {{ scope.row.isBlacklisted ? '解除黑名单' : '加入黑名单' }}
            </el-button>
          </template>
        </el-table-column>
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
import { ElMessage, ElMessageBox } from 'element-plus'
import { addUserToBlacklist, getUserList, removeUserFromBlacklist } from '../services/adminApi'

const userList = ref([])
const loading = ref(false)
const actionLoadingUserId = ref('')
const currentUserId = ref('')
const currentPage = ref(1)
const pageSize = ref(10)
const total = ref(0)
const keyword = ref('')

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
    const data = await getUserList(currentPage.value, pageSize.value, keyword.value)
    userList.value = data.data
    total.value = data.count
    currentUserId.value = data.currentUserId || ''
  } catch (error) {
    ElMessage.error('获取用户列表失败')
  } finally {
    loading.value = false
  }
}

const toggleBlacklist = async (row) => {
  const userId = row?.userId
  if (!userId) return
  if (currentUserId.value && userId === currentUserId.value) {
    ElMessage.warning('不能把自己加入黑名单')
    return
  }
  const isRemoving = Boolean(row.isBlacklisted)
  const actionText = isRemoving ? '解除黑名单' : '加入黑名单'

  try {
    await ElMessageBox.confirm(
      `确认要${actionText}用户 ${userId} 吗？`,
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

  actionLoadingUserId.value = userId
  try {
    if (isRemoving) {
      await removeUserFromBlacklist(userId)
    } else {
      await addUserToBlacklist(userId)
    }
    ElMessage.success(`${actionText}成功`)
    await fetchUserList()
  } catch (error) {
    ElMessage.error(`${actionText}失败`)
  } finally {
    actionLoadingUserId.value = ''
  }
}

// 刷新数据
const refreshData = () => {
  fetchUserList()
}

const handleSearch = () => {
  currentPage.value = 1
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
