import { onBeforeUnmount, onMounted, ref } from 'vue'

export function useNarrowScreen(maxWidth = 900) {
  const isNarrowScreen = ref(false)

  let mediaQuery = null

  const update = () => {
    isNarrowScreen.value = Boolean(mediaQuery?.matches)
  }

  onMounted(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return
    }
    mediaQuery = window.matchMedia(`(max-width: ${maxWidth}px)`)
    update()
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', update)
    } else if (typeof mediaQuery.addListener === 'function') {
      mediaQuery.addListener(update)
    }
  })

  onBeforeUnmount(() => {
    if (!mediaQuery) return
    if (typeof mediaQuery.removeEventListener === 'function') {
      mediaQuery.removeEventListener('change', update)
    } else if (typeof mediaQuery.removeListener === 'function') {
      mediaQuery.removeListener(update)
    }
  })

  return {
    isNarrowScreen
  }
}
