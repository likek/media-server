<template>
  <div class="favorites-view">
    <div class="media-container" ref="mediaContainer">
      <template v-if="loading">
        <el-skeleton :rows="20" animated :throttle="300"/>
      </template>
      <template v-else-if="files.length === 0">
        <el-empty description="你当前暂未收藏任何文件" />
      </template>
      <template v-else>
        <div class="media-grid">
          <template v-for="file in files">
            <template v-if="file.type === 'folder'">
              <folder-item
                :key="file.id"
                :folder="file"
                :favorited="true"
                :allow-actions="false" 
                @navigate="navigateToFolder"
                @favorite="refreshFavorites"
              />
            </template>
            <template v-else>
              <file-item
                :key="file.id"
                :file="file"
                :imageList="imageList"
                :imageIndex="imageList.findIndex(item => item.id === file.id)"
                :favorited="true"
                :allow-actions="false"
                @download="downloadFile"
                @viewText="viewTextFile"
                @favorite="refreshFavorites"
              />
            </template>
          </template>
        </div>
        <!-- 加载中提示 -->
        <div class="loading-indicator" v-if="loading && currentPage > 0">
          <el-icon class="is-loading"><Loading /></el-icon> 加载中...
        </div>
      </template>
    </div>

    <!-- 文本文件查看对话框 -->
    <text-viewer-dialog
      v-model:visible="txtDialogVisible"
      :file="currentItem"
      :num-lines="30"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import FolderItem from '../components/FolderItem.vue'
import FileItem from '../components/FileItem.vue'
import TextViewerDialog from '../components/TextViewerDialog.vue'
import { getFavoritesList } from '../services/userApi'

const router = useRouter()

// 状态变量
const files = ref([])
const loading = ref(false)
const mediaContainer = ref(null)

// 分页状态
const currentPage = ref(0)
const pageSize = ref(5)
const hasMoreFiles = ref(true)

// 文本查看对话框状态
const txtDialogVisible = ref(false)
const currentItem = ref(null)

// 计算图片列表
const imageList = computed(() => {
  return files.value.filter(file => {
    const ext = file.filename.split('.').pop().toLowerCase()
    return ['jpg', 'jpeg', 'png', 'gif'].includes(ext)
  })
})

// 加载收藏列表
const loadFavorites = async (resetPage = true) => {
  loading.value = true
  try {
    // 重置页码
    if (resetPage) {
      currentPage.value = 0
    }
    
    const response = await getFavoritesList(currentPage.value, pageSize.value)
    
    if (resetPage) {
      files.value = response.files || []
    } else {
      files.value = [...files.value, ...(response.files || [])]
    }
    
    // 判断是否还有更多文件 - 使用total字段
    const totalLoaded = resetPage ? response.files?.length || 0 : files.value.length
    hasMoreFiles.value = totalLoaded < response.total
  } catch (error) {
    ElMessage.error('加载收藏失败')
    console.error('Error loading favorites:', error)
  } finally {
    loading.value = false
    
    // 检查首屏内容是否填满容器
    nextTick(() => {
      checkContentHeight()
    })
  }
}

// 刷新收藏列表
const refreshFavorites = (file, isFavorited) => {
  if (isFavorited) {
    files.value.find(item => item.id === file.id).favorited = isFavorited
  } else {
    const index = files.value.findIndex(item => item.id === file.id)
    if (index !== -1) {
      files.value.splice(index, 1)
    }
  }
}

// 检查内容高度是否填满容器，如果不足且有更多文件，则自动加载更多
const checkContentHeight = () => {
  if (!mediaContainer.value || loading.value || !hasMoreFiles.value) return
  
  const { scrollHeight, clientHeight } = mediaContainer.value
  
  if (scrollHeight <= clientHeight && hasMoreFiles.value) {
    loadMoreFiles()
  }
}

// 加载更多文件
const loadMoreFiles = () => {
  if (loading.value || !hasMoreFiles.value) return
  
  currentPage.value++
  loadFavorites(false)
}

// 导航到文件夹
const navigateToFolder = (folderId) => {
  router.push({ name: 'folder', params: { id: folderId } })
}

// 下载文件
const downloadFile = (file) => {
  window.open(`/media/${file.id}`, '_blank')
}

// 查看文本文件
const viewTextFile = async (file) => {
  try {
    currentItem.value = file
    txtDialogVisible.value = true
  } catch (error) {
    ElMessage.error('无法查看文件')
    console.error('Error viewing text file:', error)
  }
}

// 显示操作不允许的消息
const showNotAllowedMessage = () => {
  ElMessage.warning('收藏视图中不允许此操作')
}

// 监听滚动事件，实现无限滚动
const setupScrollListener = () => {
  if (!mediaContainer.value) return
  
  const handleScroll = () => {
    const { scrollTop, scrollHeight, clientHeight } = mediaContainer.value
    
    // 当滚动到距离底部100px时，加载更多
    if (scrollHeight - scrollTop - clientHeight < 100 && hasMoreFiles.value && !loading.value) {
      loadMoreFiles()
    }
  }
  
  mediaContainer.value.addEventListener('scroll', handleScroll)
  
  return () => {
    mediaContainer.value?.removeEventListener('scroll', handleScroll)
  }
}

onMounted(() => {
  loadFavorites()
  const cleanup = setupScrollListener()
  
  onBeforeUnmount(() => {
    cleanup && cleanup()
  })
})
</script>

<style scoped>
.favorites-view {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.media-container {
  flex: 1;
  overflow-y: auto;
  padding: 30px 20px 20px;
}

.media-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 20px;
}

.loading-indicator {
  text-align: center;
  padding: 20px;
  color: #909399;
}
</style>