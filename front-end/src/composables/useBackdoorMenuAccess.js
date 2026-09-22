import { reactive, readonly, watchEffect } from 'vue'
import { getBackdoorMenuStatus, recordHomeTapCount } from '../services/backdoorApi'
import { adminPrivilegeSwitchEnabled } from './useAdminPrivilegeSwitch'

const HOME_TAP_IDLE_MS = 600

const state = reactive({
  // 服务端授予的管理员身份（只表示“服务端认可”，不直接对 UI 生效）
  serverGranted: false,
  // 最终生效值：服务端授予 && 本地管理员权限开关已打开
  canRenderHiddenMenus: false,
  // 本地管理员权限开关状态，便于 UI 感知
  adminPrivilegeSwitchEnabled: false,
  loaded: false,
  loading: false
})

// 服务端身份或本地开关任一变化，都立即重算“是否按管理员生效”
watchEffect(() => {
  state.adminPrivilegeSwitchEnabled = adminPrivilegeSwitchEnabled.value
  state.canRenderHiddenMenus = state.serverGranted && adminPrivilegeSwitchEnabled.value
})

let homeTapCount = 0
let homeTapTimerId = null

const applyMenuAccess = (payload = {}) => {
  state.serverGranted = Boolean(payload.canRenderHiddenMenus)
  state.loaded = true
  state.loading = false
  // watchEffect 是异步刷新的，这里同步算出结果返回给调用方
  return state.serverGranted && adminPrivilegeSwitchEnabled.value
}

export const refreshBackdoorMenuAccess = async () => {
  state.loading = true
  try {
    const response = await getBackdoorMenuStatus()
    return applyMenuAccess(response)
  } catch (error) {
    state.serverGranted = false
    state.loaded = true
    state.loading = false
    console.error('获取隐藏菜单状态失败:', error)
    return false
  }
}

const flushHomeTapCount = async () => {
  const count = homeTapCount
  homeTapCount = 0
  homeTapTimerId = null
  if (count < 2 || count > 9) {
    return false
  }

  try {
    const response = await recordHomeTapCount(count)
    return applyMenuAccess(response)
  } catch (error) {
    console.error('记录主页连点失败:', error)
    return state.canRenderHiddenMenus
  }
}

export const trackHomeTap = () => {
  homeTapCount += 1
  if (homeTapTimerId) {
    window.clearTimeout(homeTapTimerId)
  }
  homeTapTimerId = window.setTimeout(() => {
    flushHomeTapCount()
  }, HOME_TAP_IDLE_MS)
}

export const useBackdoorMenuAccess = () => {
  return {
    backdoorMenuAccessState: readonly(state),
    refreshBackdoorMenuAccess,
    trackHomeTap
  }
}
