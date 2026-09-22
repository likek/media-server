import { readonly, ref, watch } from 'vue'

// 纯前端的管理员权限总开关：
// 服务端授予管理员身份后，还必须在本地把这个开关打开，前端才会真正按管理员渲染
// （隐藏菜单、管理员操作按钮等）。默认关闭，值持久化在 localStorage。
const STORAGE_KEY = 'media-server:admin-privilege-switch'

// 连点“我的收藏”达到该次数时切换开关
const TAP_TARGET = 3
// 两次点击间隔超过该毫秒数则重新计数
const TAP_IDLE_MS = 600

const readFromStorage = () => {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1'
  } catch (error) {
    return false
  }
}

const enabled = ref(readFromStorage())

watch(enabled, (value) => {
  try {
    window.localStorage.setItem(STORAGE_KEY, value ? '1' : '0')
  } catch (error) {
    console.error('保存管理员权限开关失败:', error)
  }
})

let tapCount = 0
let tapTimerId = null

const resetTapCount = () => {
  tapCount = 0
  if (tapTimerId) {
    window.clearTimeout(tapTimerId)
    tapTimerId = null
  }
}

/**
 * 记录一次“我的收藏”点击，快速连点 3 下时切换开关。
 * @returns {boolean} 本次点击是否触发了切换
 */
export const trackAdminPrivilegeTap = () => {
  tapCount += 1
  if (tapTimerId) {
    window.clearTimeout(tapTimerId)
    tapTimerId = null
  }

  if (tapCount < TAP_TARGET) {
    tapTimerId = window.setTimeout(resetTapCount, TAP_IDLE_MS)
    return false
  }

  // 达标后立即切换并清零，第 4 下开始重新计数
  resetTapCount()
  enabled.value = !enabled.value
  return true
}

export const setAdminPrivilegeSwitch = (value) => {
  enabled.value = Boolean(value)
}

export const adminPrivilegeSwitchEnabled = readonly(enabled)

export const useAdminPrivilegeSwitch = () => {
  return {
    adminPrivilegeSwitchEnabled,
    trackAdminPrivilegeTap,
    setAdminPrivilegeSwitch
  }
}
