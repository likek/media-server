import { ElMessage } from 'element-plus'

export function copyText(text) {
    const textArea = document.createElement('textarea')
    textArea.value = text
    textArea.style.position = 'fixed'
    textArea.style.width = '0'
    textArea.style.height = '0'
    textArea.style.border = 'none'
    document.body.appendChild(textArea)
    
    try {
      textArea.select()
      const success = document.execCommand('copy')
      if (success) {
        ElMessage.success('复制成功')
      } else {
        // 如果 execCommand 失败，尝试使用 clipboard API
        navigator.clipboard.writeText(text)
          .then(() => {
            ElMessage.success('复制成功')
          })
          .catch(() => {
            ElMessage.error('复制失败')
          })
      }
    } catch (err) {
      ElMessage.error('复制失败')
      console.error('Failed to copy path:', err)
    } finally {
      document.body.removeChild(textArea)
    }
}
