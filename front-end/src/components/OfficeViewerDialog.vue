<template>
  <el-dialog
    v-model="dialogVisible"
    :title="file?.filename || file?.fileName || 'Office预览'"
    class="office-viewer-dialog"
    fullscreen
    destroy-on-close
  >
    <div v-loading="loading" class="office-viewer-shell">
      <div v-if="errorMessage" class="office-viewer-error">
        <div class="office-viewer-error__title">{{ errorMessage }}</div>
        <el-button v-if="downloadUrl" type="primary" @click="downloadFile">下载文件</el-button>
      </div>
      <div v-else ref="viewerContainer" class="office-viewer-container"></div>
    </div>
  </el-dialog>
</template>

<script setup>
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import '@open-file-viewer/core/style.css'

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  file: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['update:visible'])

const dialogVisible = ref(props.visible)
const viewerContainer = ref(null)
const loading = ref(false)
const errorMessage = ref('')
const downloadUrl = ref('')

let viewerInstance = null
let viewerModulePromise = null

const syncDialogVisible = (value) => {
  dialogVisible.value = value
}

watch(() => props.visible, syncDialogVisible, { immediate: true })

watch(dialogVisible, (value) => {
  emit('update:visible', value)
  if (!value) {
    destroyViewer()
    errorMessage.value = ''
  }
})

const buildDownloadUrl = (file) => {
  if (!file?.id) return ''
  return `/media/${file.id}`
}

const loadViewerModule = async () => {
  if (!viewerModulePromise) {
    viewerModulePromise = import('@open-file-viewer/core')
  }
  return viewerModulePromise
}

const destroyViewer = () => {
  if (viewerInstance && typeof viewerInstance.destroy === 'function') {
    viewerInstance.destroy()
  }
  viewerInstance = null
}

const initViewer = async (file) => {
  if (!dialogVisible.value || !file?.id) return

  loading.value = true
  errorMessage.value = ''
  downloadUrl.value = buildDownloadUrl(file)

  try {
    destroyViewer()
    await nextTick()

    if (!viewerContainer.value) {
      throw new Error('预览容器不存在')
    }

    const { createViewer, officePlugin, fallbackPlugin } = await loadViewerModule()

    viewerInstance = createViewer({
      container: viewerContainer.value,
      file: buildDownloadUrl(file),
      fileName: file.filename || file.fileName || `file-${file.id}`,
      width: '100%',
      height: '100%',
      fit: 'contain',
      toolbar: true,
      theme: 'auto',
      locale: 'zh-CN',
      plugins: [
        officePlugin(),
        fallbackPlugin()
      ]
    })
  } catch (error) {
    console.error('初始化Office预览失败:', error)
    errorMessage.value = 'Office预览失败'
  } finally {
    loading.value = false
  }
}

const downloadFile = () => {
  if (!downloadUrl.value) return
  const link = document.createElement('a')
  link.href = downloadUrl.value
  link.download = props.file?.filename || ''
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

watch(
  () => [props.file?.id, dialogVisible.value],
  async ([fileId, visible]) => {
    if (!visible || !fileId) return
    await initViewer(props.file)
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  destroyViewer()
})
</script>

<style scoped>
.office-viewer-shell {
  height: calc(100vh - 72px);
  min-height: 420px;
}

.office-viewer-container {
  height: 100%;
  width: 100%;
  overflow: hidden;
}

.office-viewer-error {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

.office-viewer-error__title {
  color: #606266;
}

.office-viewer-dialog :deep(.el-dialog__body) {
  padding: 0 16px 16px;
}
</style>
