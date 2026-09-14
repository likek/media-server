<template>
  <el-dialog
    v-model="dialogVisible"
    :title="file?.filename || file?.fileName || 'PDF预览'"
    class="pdf-viewer-dialog"
    fullscreen
    destroy-on-close
  >
    <div v-loading="loading" class="pdf-viewer-shell">
      <div v-if="errorMessage" class="pdf-viewer-error">
        <div class="pdf-viewer-error__title">{{ errorMessage }}</div>
        <el-button v-if="downloadUrl" type="primary" @click="downloadPdf">下载文件</el-button>
      </div>
      <div v-else ref="viewerContainer" class="pdf-viewer-container"></div>
    </div>
  </el-dialog>
</template>

<script setup>
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import '@open-file-viewer/core/style.css'
import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.mjs?url'

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

let viewerInstance = null
let viewerModulePromise = null

const downloadUrl = ref('')

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

const buildDownloadUrl = (file) => {
  if (!file?.id) return ''
  return `/media/${file.id}`
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

    const { createViewer, pdfPlugin, fallbackPlugin } = await loadViewerModule()
    const sourceUrl = buildDownloadUrl(file)

    viewerInstance = createViewer({
      container: viewerContainer.value,
      file: sourceUrl,
      fileName: file.filename || file.fileName || `file-${file.id}.pdf`,
      width: '100%',
      height: '100%',
      fit: 'contain',
      toolbar: true,
      theme: 'auto',
      locale: 'zh-CN',
      plugins: [
        pdfPlugin({
          workerSrc: pdfWorkerSrc,
          useFetchData: true
        }),
        fallbackPlugin()
      ]
    })
  } catch (error) {
    console.error('初始化PDF预览失败:', error)
    errorMessage.value = 'PDF预览失败'
  } finally {
    loading.value = false
  }
}

const downloadPdf = () => {
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
.pdf-viewer-shell {
  height: calc(100vh - 72px);
  min-height: 420px;
}

.pdf-viewer-container {
  height: 100%;
  width: 100%;
  overflow: hidden;
}

.pdf-viewer-error {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

.pdf-viewer-error__title {
  color: #606266;
}

.pdf-viewer-dialog :deep(.el-dialog__body) {
  padding: 0 16px 16px;
}
</style>
