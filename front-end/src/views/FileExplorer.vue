<template>
  <div class="file-explorer">
    <div class="top-container">
      <div class="top-form">
        <el-form @submit.prevent="handleSearch">
            <el-input 
            v-model="searchQuery" 
            placeholder="搜索文件" 
            class="search-input"
            />
        </el-form>
        <el-button @click="refreshCache"><el-icon><Refresh /></el-icon></el-button>
        <el-button @click="showCreateFolderDialog"><el-icon><FolderAdd /></el-icon></el-button>
        <el-button @click="triggerFileUpload"><el-icon><UploadFilled /></el-icon></el-button>
        <el-button @click="showTextLinkUploadDialog">
            <el-icon><Link /></el-icon>
        </el-button>
        <input ref="fileInput" type="file" style="display: none" @change="uploadFile" />
        <el-progress v-if="uploading" :percentage="uploadProgress" />
      </div>
      <!-- 面包屑导航 -->
      <div class="path-navigation">
        <el-breadcrumb separator="/">
          <el-breadcrumb-item @click="navigateToRoot">
            <el-icon><HomeFilled /></el-icon>
          </el-breadcrumb-item>
          <template v-for="(folder, index) in breadcrumbPath" :key="folder.id">
            <el-breadcrumb-item @click="navigateToFolder(folder.id)">{{ folder.name }}</el-breadcrumb-item>
          </template>
        </el-breadcrumb>
        <el-button class="copy-path-btn" size="small" @click="copyCurrentPath" type="info" plain>
          <el-icon><DocumentCopy /></el-icon>
        </el-button>
      </div>
    </div>

    <div class="media-container" ref="mediaContainer">
      <template v-if="loading">
        <el-skeleton :rows="20" animated :throttle="300"/>
      </template>
      <template v-else-if="searchRes ? searchRes.length === 0 : files.length === 0">
        <el-empty description="没有文件" />
      </template>
      <template v-else>
        <div class="media-grid">
            <template v-for="file in (searchRes || files)">
                <template v-if="file.type === 'folder'">
                    <folder-item
                        :key="file.path"
                        :folder="file"
                        @navigate="navigateToFolder"
                        @rename="showRenameDialog"
                        @move="showMoveDialog"
                        @delete="confirmDelete"
                    />
                </template>
                <template v-else>
                    <file-item
                        :key="file.path"
                        :file="file"
                        :imageList="imageList"
                        :imageIndex="imageList.indexOf(file.path)"
                        @rename="showRenameDialog"
                        @move="showMoveDialog"
                        @download="downloadFile"
                        @delete="confirmDelete"
                        @refresh="refreshCache"
                        @viewText="viewTextFile"
                        @convertTs="convertTsFile"
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

    <!-- 创建文件夹对话框 -->
    <el-dialog v-model="createFolderDialogVisible" title="新建文件夹" width="80%">
      <el-input v-model="newFolderName" placeholder="请输入文件夹名称" />
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="createFolderDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="createFolder">确认</el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 重命名对话框 -->
    <el-dialog v-model="renameDialogVisible" title="重命名" width="80%">
      <el-input v-model="newName" placeholder="请输入新名称" />
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="renameDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="renameItem">确认</el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 文本链接上传对话框 -->
    <el-dialog v-model="textLinkDialogVisible" title="从链接上传" width="80%">
      <el-input 
        v-model="linkText" 
        type="textarea" 
        :rows="10" 
        placeholder="请输入链接，每行一个" 
      />
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="textLinkDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="uploadFromLinks">确认</el-button>
        </span>
      </template>
    </el-dialog>
    
    <!-- 移动文件/文件夹对话框 -->
    <el-dialog v-model="moveDialogVisible" title="移动到" width="80%">
      <div class="move-dialog-content">
        <p>当前位置: {{ currentPath || '/' }}</p>
        <p>选择目标文件夹:</p>
        <el-select v-model="targetFolderId" placeholder="选择目标文件夹" style="width: 100%">
          <el-option
            v-for="folder in availableFolders"
            :key="folder.id"
            :label="folder.displayPath"
            :value="folder.id"
          />
        </el-select>
      </div>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="moveDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="moveItem">确认</el-button>
        </span>
      </template>
    </el-dialog>
    
    <!-- 文本文件查看对话框 -->
    <el-dialog v-model="txtDialogVisible" :title="txtFileName" width="80%" class="txt-dialog">
        <div class="txt-content-wrapper">
            <pre class="txt-content">{{ txtContent }}</pre>
        </div>
        <div class="txt-dialog-footer">
            <span>当前页: {{ txtCurrentPage }}</span>
            <el-button v-if="!isLastPage" @click="loadNextPage" type="primary">下一页</el-button>
            <el-button @click="jumpToPage" type="info">跳转</el-button>
            <el-button @click="convertEncoding" type="warning">转换编码</el-button>
        </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted, computed, nextTick } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Loading, DocumentCopy } from '@element-plus/icons-vue'
import FolderItem from '../components/FolderItem.vue'
import FileItem from '../components/FileItem.vue'
import { getFiles, searchFiles, updateCache, createNewFolder, renameFile, deleteFileOrFolder, uploadFileToServer, downloadFromText, moveFile, readTextFile, convertTextEncoding, convertFileToMp4, getFolderInfo } from '../services/api'
import { copyText } from '@/utils'

const stateCache = {}

const router = useRouter()
const route = useRoute()

// 状态变量
const files = ref([])
const searchRes = ref([])
const searchQuery = ref('')
const currentPath = ref('')
const loading = ref(false)
const uploading = ref(false)
const uploadProgress = ref(0)
const fileInput = ref(null)
const mediaContainer = ref(null) // 添加滚动容器的ref
const breadcrumbPath = ref([]) // 存储面包屑导航路径

// 分页状态
const currentPage = ref(0)
const pageSize = ref(20)
const hasMoreFiles = ref(true)

// 对话框状态
const createFolderDialogVisible = ref(false)
const newFolderName = ref('')
const renameDialogVisible = ref(false)
const newName = ref('')
const currentItem = ref(null)
const textLinkDialogVisible = ref(false)
const linkText = ref('')
const moveDialogVisible = ref(false)
const targetFolderId = ref('')
const availableFolders = ref([])

// 文本查看对话框状态
const txtDialogVisible = ref(false)
const txtContent = ref('')
const txtFileName = ref('')
const txtCurrentPage = ref(1)
const isLastPage = ref(false)
const nextStart = ref(0)
const numLines = ref(50)

// 更新当前路径
const updateCurrentPath = () => {
  if (route.params.path) {
    currentPath.value = Array.isArray(route.params.path) 
      ? route.params.path.join('/') 
      : route.params.path
  } else {
    currentPath.value = ''
  }
}

// 计算路径段
const pathSegments = computed(() => {
  if (!currentPath.value) return []
  return currentPath.value.split('/')
})

const imageList = computed(() => {
  return files.value.filter(file => {
    const ext = file.filename.split('.').pop().toLowerCase()
    return ['jpg', 'jpeg', 'png', 'gif'].includes(ext)
  }).map(file => file.path)
})

// 导航到指定路径段
const navigateToSegment = (index) => {
  if (index < 0) return
  
  const segments = pathSegments.value
  if (index >= segments.length) return
  
  const targetPath = segments.slice(0, index + 1).join('/')
  router.push(`/folder/${targetPath}`)
}


// 检查内容高度是否填满容器，如果不足且有更多文件，则自动加载更多
const checkContentHeight = () => {
  if (!mediaContainer.value || loading.value || !hasMoreFiles.value) return
  
  const { scrollHeight, clientHeight } = mediaContainer.value
  
  if (scrollHeight <= clientHeight && hasMoreFiles.value) {
    loadMoreFiles()
  }
}

// 加载文件列表
const loadFiles = async (resetPage = true) => {
  loading.value = true
  try {
    // 重置页码
    if (resetPage) {
      currentPage.value = 0
    }
    
    // 获取当前文件夹ID（如果有）
    const folderId = route.params.id
    
    const response = await getFiles(folderId, currentPage.value, pageSize.value)
    files.value = response
    
    // 判断是否还有更多文件
    hasMoreFiles.value = response.length === pageSize.value
  } catch (error) {
    ElMessage.error('加载文件失败')
    console.error('Error loading files:', error)
  } finally {
    loading.value = false
    
    // 检查首屏内容是否填满容器，如果不足且有更多文件，则自动加载更多
    checkContentHeight()
  }
}

// 获取文件夹的完整路径信息（包括所有父文件夹）
const loadFolderPath = async (folderId) => {
  if (!folderId) {
    breadcrumbPath.value = []
    return
  }
  
  const path = []
  let currentId = folderId
  
  while (currentId) {
    const folderInfo = await getFolderInfo(currentId)
    if (!folderInfo) break
    
    path.unshift({
      id: folderInfo.id,
      name: folderInfo.filename
    })
    
    currentId = folderInfo.parent_id
  }
  
  breadcrumbPath.value = path
}

// 监听路由变化
watch(() => route.params.id, async () => {
  searchRes.value = undefined
  updateCurrentPath()
  
  // 加载面包屑导航路径
  await loadFolderPath(route.params.id)
  
  if (stateCache[route.params.id]) {
    files.value = stateCache[route.params.id].files || []
    currentPage.value = stateCache[route.params.id].currentPage || 0
    hasMoreFiles.value = stateCache[route.params.id].hasMoreFiles ? stateCache[route.params.id].hasMoreFiles : true
    nextTick(() => {
      // 检查首屏内容是否填满容器，如果不足且有更多文件，则自动加载更多
      checkContentHeight()
      mediaContainer.value.scrollTop = stateCache[route.params.id].scrollTop || 0
    })
  } else {
    loadFiles()
  }
}, { immediate: true })

watch(() => files.value, (files) => {
  stateCache[route.params.id] = stateCache[route.params.id] || {}
  stateCache[route.params.id].files = [...files]
})

watch(() => currentPage.value, (newPage) => {
  stateCache[route.params.id] = stateCache[route.params.id] || {}
  stateCache[route.params.id].currentPage = newPage
})

watch(() => hasMoreFiles.value, (hasMore) => {
  stateCache[route.params.id] = stateCache[route.params.id] || {}
  stateCache[route.params.id].hasMoreFiles = hasMore
})


// 搜索文件
const handleSearch = async () => {
  if (!searchQuery.value.trim()) {
    searchRes.value = undefined
    await loadFiles()
    return
  }
  
  loading.value = true
  try {
    // 获取当前文件夹ID（如果有）
    const folderId = route.params.id
    
    const response = await searchFiles(searchQuery.value, folderId)
    searchRes.value = response
  } catch (error) {
    ElMessage.error('搜索失败')
    console.error('Error searching files:', error)
  } finally {
    loading.value = false
  }
}

// 刷新缓存
const refreshCache = async () => {
  try {
    // 获取当前文件夹ID（如果有）
    const folderId = route.params.id
    
    await updateCache(folderId)
    await loadFiles()
    ElMessage.success('刷新数据成功')
  } catch (error) {
    ElMessage.error('刷新数据失败')
    console.error('Error updating cache:', error)
  }
}

// 导航到文件夹
const navigateToFolder = (folderId) => {
  router.push({ name: 'folder', params: { id: folderId } })
}

// 导航到根目录
const navigateToRoot = () => {
  router.push({ name: 'home' })
}

// 复制当前路径
const copyCurrentPath = () => {
    copyText(currentPath.value || '/')
}

// 触发文件上传
const triggerFileUpload = () => {
  fileInput.value.click()
}

// 上传文件
const uploadFile = async (event) => {
  const file = event.target.files[0]
  if (!file) return
  
  uploading.value = true
  uploadProgress.value = 0
  
  try {
    // 获取当前文件夹ID（如果有）
    const parentId = route.params.id || null
    
    await uploadFileToServer(file, parentId, (progress) => {
      uploadProgress.value = Math.round(progress)
    })
    
    ElMessage.success('上传成功')
    await loadFiles()
  } catch (error) {
    ElMessage.error('上传失败')
    console.error('Error uploading file:', error)
  } finally {
    uploading.value = false
    // 重置文件输入以允许再次上传相同文件
    fileInput.value.value = ''
  }
}

// 显示创建文件夹对话框
const showCreateFolderDialog = () => {
  newFolderName.value = ''
  createFolderDialogVisible.value = true
}

// 创建文件夹
const createFolder = async () => {
  if (!newFolderName.value.trim()) {
    ElMessage.warning('请输入文件夹名称')
    return
  }
  
  try {
    // 获取当前文件夹ID（如果有）
    const parentId = route.params.id || null
    
    await createNewFolder(newFolderName.value, parentId)
    createFolderDialogVisible.value = false
    ElMessage.success('创建文件夹成功')
    await loadFiles()
  } catch (error) {
    ElMessage.error('创建文件夹失败')
    console.error('Error creating folder:', error)
  }
}

// 显示重命名对话框
const showRenameDialog = (item) => {
  currentItem.value = item
  newName.value = item.filename
  renameDialogVisible.value = true
}

// 重命名文件或文件夹
const renameItem = async () => {
  if (!newName.value.trim()) {
    ElMessage.warning('请输入新名称')
    return
  }
  
  try {
    await renameFile(currentItem.value.id, newName.value, currentItem.value.type)
    renameDialogVisible.value = false
    ElMessage.success('重命名成功')
    await loadFiles()
  } catch (error) {
    ElMessage.error('重命名失败')
    console.error('Error renaming item:', error)
  }
}

// 确认删除
const confirmDelete = (item) => {
  ElMessageBox.confirm(
    `确定要删除 ${item.filename} 吗？`,
    '警告',
    {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    }
  )
    .then(async () => {
      try {
        await deleteFileOrFolder(item.id, item.type)
        ElMessage.success('删除成功')
        await loadFiles()
      } catch (error) {
        ElMessage.error('删除失败')
        console.error('Error deleting item:', error)
      }
    })
    .catch(() => {
      // 用户取消删除
    })
}

// 显示文本链接上传对话框
const showTextLinkUploadDialog = () => {
  // 获取剪切板权限和内容
  const clipboard = navigator.clipboard
  linkText.value = ''
  if (clipboard) {
    clipboard.readText()
    .then((clipboardText) => {
      linkText.value = clipboardText
    }).finally(() => {
      textLinkDialogVisible.value = true
    })
  } else {
    textLinkDialogVisible.value = true
  }
}

// 从链接上传
const uploadFromLinks = async () => {
  if (!linkText.value.trim()) {
    ElMessage.warning('请输入链接')
    return
  }
  
  const text = linkText.value
  // 获取当前文件夹ID（如果有）
  const folderId = route.params.id || null
  
  try {
    textLinkDialogVisible.value = false
    ElMessage.success('开始在后台提取资源，请稍后...')
    const response = await downloadFromText(text, folderId)
    ElMessage.success(`提取成功${response.successCount}条, 失败${response.failedLinks.length}条`)
    
    // 下载完成后导航到目标文件夹
    if (response.downloadId) {
      router.push({ name: 'folder', params: { id: response.downloadId } })
      return // 导航会触发路由变化，会自动加载文件，不需要再调用loadFiles
    }
    
    await loadFiles()
  } catch (error) {
    ElMessage.error('添加下载任务失败')
    console.error('Error adding download tasks:', error)
  }
}

// 显示移动对话框
const showMoveDialog = (item) => {
  currentItem.value = item
  moveDialogVisible.value = true
  loadAvailableFolders()
}

// 加载可用的目标文件夹
const loadAvailableFolders = async () => {
  try {
    const response = await getFiles('')  // 获取根目录下的所有文件夹
    const folders = [{ path: '', displayPath: '根目录' }]
    
    // 递归函数，用于构建文件夹树
    const buildFolderTree = (items, parentPath = '', level = 0) => {
      items.forEach(item => {
        if (item.type === 'folder') {
          // 排除当前项及其子文件夹
          if (currentItem.value && 
              (item.id === currentItem.value.id || 
               item.path.startsWith(currentItem.value.path + '/'))) {
            return
          }
          
          const displayPath = '　'.repeat(level) + item.filename
          folders.push({
            id: item.id,
            path: item.path,
            displayPath
          })
          
          // 如果文件夹已经展开，递归添加子文件夹
          if (item.children && item.children.length > 0) {
            buildFolderTree(item.children, item.path, level + 1)
          }
        }
      })
    }
    
    buildFolderTree(response)
    availableFolders.value = folders
  } catch (error) {
    ElMessage.error('加载文件夹失败')
    console.error('Error loading folders:', error)
  }
}

// 移动文件或文件夹
const moveItem = async () => {
  if (!targetFolderId.value && targetFolderId.value !== null) {
    ElMessage.warning('请选择目标文件夹')
    return
  }
  
  try {
    // 获取目标文件夹的ID
    const targetId = targetFolderId.value
    await moveFile(currentItem.value.id, targetId)
    moveDialogVisible.value = false
    ElMessage.success('移动成功')
    await loadFiles()
  } catch (error) {
    ElMessage.error('移动失败')
    console.error('Error moving item:', error)
  }
}

// 下载文件
const downloadFile = (file) => {
  const link = document.createElement('a')
  link.href = `/${routeMedia}/${file.path}`
  link.download = file.filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

// 查看文本文件
const viewTextFile = async (file) => {
  try {
    txtFileName.value = file.filename
    const response = await readTextFile(file.path, 0, numLines.value)
    
    if (response.content) {
      txtContent.value = response.content
      nextStart.value = response.start
      isLastPage.value = response.isLastPage
      txtCurrentPage.value = 1
      txtDialogVisible.value = true
    } else {
      ElMessageBox.alert('无法读取文件内容', '错误', { type: 'error' })
    }
  } catch (error) {
    console.error('Error reading text file:', error)
    ElMessageBox.alert('读取文件失败', '错误', { type: 'error' })
  }
}

// 加载下一页文本
const loadNextPage = async () => {
  try {
    const response = await readTextFile(currentItem.value.path, nextStart.value, numLines.value)
    
    if (response.content) {
      txtContent.value = response.content
      nextStart.value = response.start
      isLastPage.value = response.isLastPage
      txtCurrentPage.value += 1
    } else {
      ElMessageBox.alert('无法读取文件内容', '错误', { type: 'error' })
    }
  } catch (error) {
    console.error('Error reading next page:', error)
    ElMessageBox.alert('读取下一页失败', '错误', { type: 'error' })
  }
}

// 跳转到指定页
const jumpToPage = async () => {
  try {
    const targetPage = await ElMessageBox.prompt('请输入页码', '跳转', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      inputPattern: /^\d+$/,
      inputErrorMessage: '页码必须为数字'
    })
    
    if (targetPage.value) {
      const page = parseInt(targetPage.value)
      if (page <= 0) {
        ElMessageBox.alert('页码必须大于0', '错误', { type: 'warning' })
        return
      }
      
      if (page === txtCurrentPage.value) {
        ElMessageBox.alert(`当前已是第${page}页`, '提示', { type: 'info' })
        return
      }
      
      const start = (page - 1) * numLines.value
      const response = await readTextFile(currentItem.value.path, start, numLines.value)
      
      if (response.content) {
        txtContent.value = response.content
        nextStart.value = response.start
        isLastPage.value = response.isLastPage
        txtCurrentPage.value = page
      } else {
        ElMessageBox.alert('无法读取文件内容', '错误', { type: 'error' })
      }
    }
  } catch (error) {
    if (error !== 'cancel') {
      console.error('Error jumping to page:', error)
      ElMessageBox.alert('跳转失败', '错误', { type: 'error' })
    }
  }
}

// 转换文本编码
const convertEncoding = async () => {
  try {
    const response = await convertTextEncoding(currentItem.value.path)
    if (response.success) {
      ElMessageBox.alert('编码已转换为UTF-8', '成功', { type: 'success' })
      viewTextFile(currentItem.value) // 重新加载文本
    } else {
      ElMessageBox.alert(response.message || '转换编码失败', '错误', { type: 'error' })
    }
  } catch (error) {
    console.error('Error converting encoding:', error)
    ElMessageBox.alert('转换编码失败', '错误', { type: 'error' })
  }
}

const convertTsFile = async (file) => {
  convertFileToMp4(file.path, file.path.replace('.ts', '_ts.mp4')).then(() => {
    ElMessage.success('转换成功')
    loadFiles()
  }).catch((error) => {
    ElMessage.error('转换失败')
    console.error('Error converting file:', error)
  })
}

// 加载更多文件
const loadMoreFiles = async () => {
  if (loading.value || !hasMoreFiles.value) return
  
  currentPage.value += 1
  loading.value = true
  
  try {
    const scrollContainer = mediaContainer.value
    const currScrollTop = scrollContainer ? scrollContainer.scrollTop : 0
    
    // 获取当前文件夹ID（如果有）
    const folderId = route.params.id

    const response = await getFiles(folderId, currentPage.value, pageSize.value)
    
    if (response.length > 0) {
      files.value = [...files.value, ...response]
      setTimeout(() => {
        if (mediaContainer.value) {
          mediaContainer.value.scrollTop = currScrollTop
          checkContentHeight()
        }
      })
      // 判断是否还有更多文件
      hasMoreFiles.value = response.length === pageSize.value
    } else {
      hasMoreFiles.value = false
    }
  } catch (error) {
    ElMessage.error('加载更多文件失败')
    console.error('Error loading more files:', error)
  } finally {
    loading.value = false
  }
}

// 检查滚动位置并加载更多文件
const checkScrollPosition = () => {
  if (!mediaContainer.value || loading.value || !hasMoreFiles.value || searchRes.value) {
    return
  }
  
  const { scrollTop, scrollHeight, clientHeight } = mediaContainer.value
  // 当滚动到距离底部100px以内时加载更多
  if (scrollHeight - scrollTop - clientHeight < 100) {
    loadMoreFiles()
  }
}

const cacheScrollPosition = () => {
  if (mediaContainer.value) {
    stateCache[route.params.id] = stateCache[route.params.id] || {}
    stateCache[route.params.id].scrollTop = mediaContainer.value.scrollTop
  }
}

// 设置滚动事件监听
onMounted(() => {
  if (mediaContainer.value) {
    mediaContainer.value.addEventListener('scroll', checkScrollPosition)
    mediaContainer.value.addEventListener('scroll', cacheScrollPosition)
  }
})

// 移除滚动事件监听
onUnmounted(() => {
  if (mediaContainer.value) {
    mediaContainer.value.removeEventListener('scroll', checkScrollPosition)
    mediaContainer.value.removeEventListener('scroll', cacheScrollPosition)
  }
})
</script>

<style scoped>
.file-explorer {
  padding: 20px;
  height: 100%;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}

.top-container {
  margin-bottom: 20px;
}

.top-form {
  display: flex;
  gap: 10px;
  margin-bottom: 10px;
  align-items: center;
  flex-wrap: wrap;
}

.search-input {
  width: 300px;
}

.path-navigation {
  background-color: #f5f7fa;
  padding: 8px 12px;
  border-radius: 4px;
  margin-top: 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.current-path {
  cursor: pointer;
  font-family: monospace;
}

.el-breadcrumb :deep(.el-breadcrumb__item) {
  cursor: pointer;
}

.el-breadcrumb :deep(.el-breadcrumb__inner) {
  color: #409eff;
}

.el-breadcrumb :deep(.el-breadcrumb__inner):hover {
  color: #66b1ff;
}

.copy-path-btn {
  margin-left: 10px;
}

.media-container {
  flex: 1;
  overflow-y: auto;
  padding: 4px;
}

.media-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
}

.move-dialog-content {
  margin-bottom: 20px;
}

/* 文本查看对话框样式 */
.txt-dialog .el-dialog__body {
  padding: 10px;
}

.txt-content-wrapper {
  max-height: 60vh;
  overflow-y: auto;
  background-color: #f5f7fa;
  border-radius: 4px;
  padding: 10px;
}

.txt-content {
  white-space: pre-wrap;
  word-break: break-all;
  font-family: monospace;
  margin: 0;
}

.txt-dialog-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 15px;
  padding: 0 10px;
}

.loading-indicator {
  display: flex;
  justify-content: center;
  align-items: center;
  margin-top: 20px;
  padding: 10px 0;
  color: #409eff;
  font-size: 14px;
}

.loading-indicator .el-icon {
  margin-right: 5px;
}
</style>