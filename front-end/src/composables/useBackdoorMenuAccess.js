import { reactive, readonly } from 'vue'
import { getBackdoorMenuStatus, recordHomeTapCount } from '../services/backdoorApi'

const HOME_TAP_IDLE_MS = 600

const state = reactive({
  canRenderHiddenMenus: false,
  loaded: false,
  loading: false
})

let homeTapCount = 0
let homeTapTimerId = null

const applyMenuAccess = (payload = {}) => {
  state.canRenderHiddenMenus = Boolean(payload.canRenderHiddenMenus)
  state.loaded = true
  state.loading = false
  return state.canRenderHiddenMenus
}

export const refreshBackdoorMenuAccess = async () => {
  state.loading = true
  try {
    const response = await getBackdoorMenuStatus()
    return applyMenuAccess(response)
  } catch (error) {
    state.canRenderHiddenMenus = false
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
