<template>
  <div class="file-explorer">
    <div class="top-container">
      <div class="top-form">
        <el-form @submit.prevent="handleSearch">
          <el-input v-model="searchInput" placeholder="搜索文件" class="search-input" clearable />
        </el-form>
        <el-button @click="refreshCache"><el-icon>
            <Refresh />
          </el-icon></el-button>
        <el-button @click="showCreateFolderDialog"><el-icon>
            <FolderAdd />
          </el-icon></el-button>
        <el-button @click="triggerFileUpload"><el-icon>
            <UploadFilled />
          </el-icon></el-button>
        <el-button @click="showTextLinkUploadDialog">
          <el-icon>
            <Link />
          </el-icon>
        </el-button>
        <input ref="fileInput" type="file" style="display: none" @change="uploadFile" />
        <el-progress v-if="uploading" :percentage="uploadProgress" />
      </div>
      <!-- 面包屑导航 -->
      <div class="path-navigation">
        <el-breadcrumb separator="/">
          <el-breadcrumb-item @click="navigateToRoot">
            <el-icon>
              <HomeFilled />
            </el-icon>
          </el-breadcrumb-item>
          <template v-for="(folder, index) in breadcrumbPath" :key="folder.id">
            <el-breadcrumb-item @click="navigateToFolder(folder.id)">{{ folder.name }}</el-breadcrumb-item>
          </template>
        </el-breadcrumb>
      </div>
    </div>

    <div class="media-container" ref="mediaContainer">
      <template v-if="loading">
        <el-skeleton :rows="20" animated :throttle="300" />
      </template>
      <template v-else-if="files.length === 0">
        <el-empty :description="'没有文件'" />
      </template>
      <template v-else>
        <div class="media-grid">
          <template v-for="file in files">
            <template v-if="file.type === 'folder'">
              <folder-item :key="file.id" :folder="file" :favorited="file.favorited" @navigate="navigateToFolder"
                @rename="showRenameDialog" @move="showMoveDialog" @delete="confirmDelete" @favorite="refreshFavorites" />
            </template>
            <template v-else>
              <file-item :key="file.id" :file="file" :imageList="imageList"
                :imageIndex="imageList.findIndex(item => item.id === file.id)" :favorited="file.favorited"
                @rename="showRenameDialog" @move="showMoveDialog" @download="downloadFile" @delete="confirmDelete"
                @unzip="refreshCache" @viewText="viewTextFile" @convertTs="convertTsFile" @favorite="refreshFavorites" />
            </template>
          </template>
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
      <el-input v-model="linkText" type="textarea" :rows="10" placeholder="请输入链接，每行一个" />
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
        <p>选择目标文件夹:</p>
        <el-tree
          ref="folderTree"
          :props="{
            children: 'children',
            label: 'filename'
          }"
          :load="loadNode"
          lazy
          check-strictly
          :accordion="true"
          node-key="id"
          :highlight-current="true"
          :expand-on-click-node="false"
        >
          <template #default="{ node, data }">
            <span class="folder-tree-node">
              <el-icon><Folder /></el-icon>
              <span class="folder-tree-node_lavel">{{ node.label }}</span>
            </span>
          </template>
        </el-tree>
      </div>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="moveDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="moveItem">确认</el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 文本文件查看对话框 -->
    <text-viewer-dialog v-model:visible="txtDialogVisible" :file="currentItem" :num-lines="30" />
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted, nextTick, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import FolderItem from '../components/FolderItem.vue'
import FileItem from '../components/FileItem.vue'
import TextViewerDialog from '../components/TextViewerDialog.vue'
import { getFiles, updateCache, createNewFolder, renameFile, deleteFileOrFolder, uploadFileToServer, downloadFromText, moveFile, convertFileToMp4, getFolderInfo } from '../services/userApi'

const stateCache = {}

const router = useRouter()
const route = useRoute()

// 状态变量
const files = ref([])
const searchInput = ref('')
const loading = ref(false)
const uploading = ref(false)
const uploadProgress = ref(0)
const fileInput = ref(null)
const mediaContainer = ref(null) // 添加滚动容器的ref
const breadcrumbPath = ref([]) // 存储面包屑导航路径

// 分页状态
const currentPage = ref(0)
const pageSize = ref(5)
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
const folderTree = ref(null) // Ref for the tree component

// 文本查看对话框状态
const txtDialogVisible = ref(false)

const imageList = computed(() => {
  return files.value.filter(file => {
    const ext = file.filename.split('.').pop().toLowerCase()
    return ['jpg', 'jpeg', 'png', 'gif'].includes(ext)
  })
})

// 刷新收藏列表
const refreshFavorites = (file, isFavorited) => {
  files.value.find(item => item.id === file.id).favorited = isFavorited
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
    const query = route.query.q

    const response = await getFiles(folderId, query, currentPage.value, pageSize.value)
    if (route.params.id !== folderId || route.query.q !== query) {
      console.warn(`路由已变更，不更新数据`)
      loading.value = false
      return
    }

    // 更新文件列表
    files.value = response.files || []
    
    // 判断是否还有更多文件 - 使用total字段
    const totalLoaded = (currentPage.value + 1) * pageSize.value
    hasMoreFiles.value = totalLoaded < response.total
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
const loadFolderPath = async (folderId, leafId) => {
  leafId = leafId || folderId
  if (!folderId) {
    breadcrumbPath.value = []
    return
  }

  const path = []
  let currentId = folderId

  while (currentId) {
    const folderInfo = await getFolderInfo(currentId, leafId)
    if (leafId !== route.params.id) {
      // 请求期间路由又一次发生变化
      console.warn(`路由已变更，面包屑停止下一步请求, 当前请求的面包屑叶子节点${leafId}, 当前路由节点${route.params.id}`)
      return
    }
    if (!folderInfo) break

    path.unshift({
      id: folderInfo.id,
      name: folderInfo.filename
    })

    currentId = folderInfo.parent_id
  }

  breadcrumbPath.value = path
}

const updatePageByCache = (cacheData) => {
  files.value = cacheData.files || []
  currentPage.value = cacheData.currentPage || 0
  hasMoreFiles.value = cacheData.hasMoreFiles || true
  nextTick(() => {
    // 检查首屏内容是否填满容器，如果不足且有更多文件，则自动加载更多
    checkContentHeight()
    mediaContainer.value.scrollTop = cacheData.scrollTop || 0
  })
}

const setCache = (id, query, value) => {
  id = id || ''
  query = query || ''
  stateCache[id] = stateCache[id] || {}
  stateCache[id][query] = stateCache[id][query] || {}
  Object.assign(stateCache[id][query], value)
}

const getCache = (id, query) => {
  id = id || ''
  query = query || ''
  return stateCache[id]?.[query]
}

// 监听路由变化
watch(() => route.params.id, async (newValue, oldValue) => {
  const cacheData = getCache(route.params.id, route.query.q)
  if (cacheData) {
    updatePageByCache(cacheData)
  } else {
    loadFiles()
  }
  // 加载面包屑导航路径
  loadFolderPath(route.params.id)
}, { immediate: true })

watch(() => route.query.q, async (newValue, oldValue) => {
  const cacheData = getCache(route.params.id, route.query.q)
  if (cacheData) {
    updatePageByCache(cacheData)
  } else {
    loadFiles()
  }
})

watch(() => files.value, (files) => {
  setCache(route.params.id, route.query.q, {
    files: [...files]
  })
})

watch(() => currentPage.value, (newPage) => {
  setCache(route.params.id, route.query.q, {
    currentPage: newPage
  })
})

watch(() => hasMoreFiles.value, (hasMore) => {
  setCache(route.params.id, route.query.q, {
    hasMoreFiles: hasMore
  })
})


// 搜索文件
const handleSearch = async () => {
  router.push({
    name: 'folder',
    params: { id: route.params.id },
    query: { q: searchInput.value?.trim() || undefined }
  })
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

// 移动文件或文件夹
const moveItem = async () => {
  const targetFolderNode = folderTree.value.getCurrentNode()
  if (!targetFolderNode) {
    ElMessage.warning('请选择目标文件夹')
    return
  }

  if (currentItem.value.id === targetFolderNode.id) {
    ElMessage.warning('目标文件夹不能是当前文件夹')
    return
  }

  try {
    // 获取目标文件夹的ID
    const targetId = targetFolderNode.id
    await moveFile(currentItem.value.id, targetId)
    moveDialogVisible.value = false
    ElMessage.success('移动成功')
    await loadFiles()
  } catch (error) {
    ElMessage.error('移动失败')
    console.error('Error moving item:', error)
  }
}

// 显示移动对话框
const showMoveDialog = (item) => {
  currentItem.value = item
  moveDialogVisible.value = true
  nextTick(() => {
    if (folderTree.value) {
        const rootNode = folderTree.value.getNode(null);
        if (rootNode) {
            rootNode.loaded = false;
        }
    }
  })
}

const loadNode = async (node, resolve) => {
  if (node.level === 0) {
    try {
      const response = await getFiles(null, null, 0, 1000, { type: 'folder' }) // Fetch root level items
      const folders = response.files
        .map(folder => ({ ...folder, isLeaf: false }))
      return resolve([{ id: 0, filename: '根目录', isLeaf: false, children: folders }])
    } catch (error) {
      ElMessage.error('加载根文件夹列表失败')
      console.error('Error loading root folders for tree:', error)
      return resolve([{ id: 0, filename: '根目录', isLeaf: false }])
    }
  }

  const parentId = node.data.id
  try {
    const response = await getFiles(parentId, null, 0, 1000, { type: 'folder' })
    const folders = response.files
      .map(folder => ({ ...folder, isLeaf: false }))

    resolve(folders)
  } catch (error) {
    ElMessage.error(`加载文件夹 ${node.data.filename} 的子列表失败`)
    console.error('Error loading subfolders for tree:', error)
    resolve([])
  }
}

// 下载文件
const downloadFile = (file) => {
  // const link = document.createElement('a')
  // link.href = `/media/${file.id}`
  // link.download = file.filename
  // document.body.appendChild(link)
  // link.click()
  // document.body.removeChild(link)
}

// 查看文本文件
const viewTextFile = async (file) => {
  try {
    currentItem.value = file
    txtDialogVisible.value = true
  } catch (error) {
    console.error('Error opening text file:', error)
    ElMessageBox.alert('打开文件失败', '错误', { type: 'error' })
  }
}



const convertTsFile = async (file) => {
  convertFileToMp4(file.id).then(() => {
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
  loading.value = true

  try {
    const scrollContainer = mediaContainer.value
    const currScrollTop = scrollContainer ? scrollContainer.scrollTop : 0

    // 获取当前文件夹ID（如果有）
    const folderId = route.params.id
    const query = route.query.q
    const nextPage = currentPage.value + 1
    const response = await getFiles(folderId, query, nextPage, pageSize.value)

    if (route.params.id === folderId && route.query.q === query) {
      currentPage.value = nextPage

      if (response.files && response.files.length > 0) {
        files.value = [...files.value, ...response.files]
        setTimeout(() => {
          if (mediaContainer.value) {
            mediaContainer.value.scrollTop = currScrollTop
            checkContentHeight()
          }
        })
        // 判断是否还有更多文件 - 使用total字段
        const totalLoaded = (currentPage.value + 1) * pageSize.value
        hasMoreFiles.value = totalLoaded < response.total

      } else {
        hasMoreFiles.value = false
      }
    } else {
      console.warn('路由已变更，不更新数据')
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
  if (!mediaContainer.value || loading.value || !hasMoreFiles.value) {
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
    setCache(route.params.id, route.query.q, {
      scrollTop: mediaContainer.value.scrollTop
    })
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
  margin-top: 10px;
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

.folder-tree-node_lavel {
  vertical-align: text-bottom;
}
</style>