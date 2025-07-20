<template>
  <el-dialog v-model="dialogVisible" :title="file?.fileName" class="txt-dialog" fullscreen>
    <div class="txt-content-wrapper">
      <pre class="txt-content">{{ content }}</pre>
    </div>
    <div class="txt-dialog-footer">
      <span>当前在第{{ currentPage }}页</span>
      <el-button v-if="!isLastPage" @click="loadNextPage" type="primary">下一页</el-button>
      <el-button @click="jumpToPage" type="info">跳转</el-button>
      <el-button @click="convertEncoding" type="warning">转换编码</el-button>
    </div>
  </el-dialog>
</template>

<script setup>
import { ref, watch } from 'vue'
import { ElMessageBox } from 'element-plus'
import { readTextFile, convertTextEncoding } from '../services/userApi'

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  file: {
    type: Object,
    default: ''
  },
  numLines: {
    type: Number,
    default: 10
  }
})

const emit = defineEmits(['update:visible'])

// 对话框状态
const dialogVisible = ref(props.visible)
const content = ref('')
const currentPage = ref(1)
const isLastPage = ref(false)
const nextStart = ref(0)

// 监听visible属性变化
watch(() => props.visible, (newValue) => {
  dialogVisible.value = newValue
  if (newValue && props.file) {
    loadTextContent(0)
  }
}, { immediate: true })

// 监听对话框状态变化
watch(() => dialogVisible.value, (newValue) => {
  emit('update:visible', newValue)
})

// 加载文本内容
async function loadTextContent (start = 0) {
  try {
    const response = await readTextFile(props.file.id, start, props.numLines)
    
    if (response.content) {
      content.value = response.content
      nextStart.value = response.start
      isLastPage.value = response.isLastPage
      if (start === 0) {
        currentPage.value = 1
      }
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
    const response = await readTextFile(props.file.id, nextStart.value, props.numLines)
    
    if (response.content) {
      content.value = response.content
      nextStart.value = response.start
      isLastPage.value = response.isLastPage
      currentPage.value += 1
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
      
      if (page === currentPage.value) {
        ElMessageBox.alert(`当前已是第${page}页`, '提示', { type: 'info' })
        return
      }
      
      const start = (page - 1) * props.numLines
      const response = await readTextFile(props.file.id, start, props.numLines)
      
      if (response.content) {
        content.value = response.content
        nextStart.value = response.start
        isLastPage.value = response.isLastPage
        currentPage.value = page
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
    const response = await convertTextEncoding(props.file.id)
    if (response.success) {
      ElMessageBox.alert('编码已转换为UTF-8', '成功', { type: 'success' })
      loadTextContent(0) // 重新加载文本
    } else {
      ElMessageBox.alert(response.message || '转换编码失败', '错误', { type: 'error' })
    }
  } catch (error) {
    console.error('Error converting encoding:', error)
    ElMessageBox.alert('转换编码失败', '错误', { type: 'error' })
  }
}
</script>

<style scoped>
/* 文本查看对话框样式 */
.txt-dialog :deep(.el-dialog__body) {
  padding: 10px;
}

.txt-content-wrapper {
  overflow-y: auto;
  background-color: #f5f7fa;
  border-radius: 4px;
  padding: 10px;
  height: 100%;
}

.txt-content {
  white-space: pre-wrap;
  word-break: break-all;
  font-family: monospace;
  margin: 0;
  height: calc(100vh - 120px);
  overflow: auto;
}

.txt-dialog-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 10px;
  padding: 0 10px;
}
</style>