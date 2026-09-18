<template>
  <el-image-viewer
    v-if="visible"
    ref="viewerRef"
    :url-list="urlList"
    :initial-index="initialIndex"
    :infinite="true"
    :hide-on-click-modal="hideOnClickModal"
    :teleported="true"
    :show-progress="true"
    :zoom-rate="1.02"
    :max-scale="7"
    :min-scale="0.2"
    @close="handleClose"
    @switch="handleSwitch"
  />
  <teleport to="body">
    <div v-if="visible && loadingMore" class="image-viewer-loading-overlay">
      <div class="loading-content">
        <span class="loading-spinner"></span>
        <span class="loading-text">加载更多图片…</span>
      </div>
    </div>
  </teleport>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  urlList: { type: Array, default: () => [] },
  initialIndex: { type: Number, default: 0 },
  hasMore: { type: Boolean, default: false },
  hideOnClickModal: { type: Boolean, default: true },
})

const emit = defineEmits(['close', 'load-more'])

const viewerRef = ref(null)
const prevIndex = ref(props.initialIndex)
const loadingMore = ref(false)
const pendingLoadMore = ref(false)
const loadMoreRequested = ref(false)
const originalListLength = ref(0)

watch(() => props.visible, (visible) => {
  if (visible) {
    prevIndex.value = props.initialIndex
    loadingMore.value = false
    pendingLoadMore.value = false
    loadMoreRequested.value = false
  }
})

watch(() => props.initialIndex, (newIndex) => {
  if (props.visible && !loadingMore.value) {
    prevIndex.value = newIndex
  }
})

const handleSwitch = (index) => {
  if (loadingMore.value) return

  const listLength = props.urlList.length

  if (index === 0 && prevIndex.value === listLength - 1 && listLength > 1) {
    if (props.hasMore) {
      loadingMore.value = true
      pendingLoadMore.value = true
      loadMoreRequested.value = true
      originalListLength.value = listLength
      emit('load-more')
      return
    }
  }

  prevIndex.value = index
}

watch(
  () => [props.urlList.length, props.hasMore],
  ([newLen, newHasMore]) => {
    if (!pendingLoadMore.value) return

    loadMoreRequested.value = false

    if (newLen > originalListLength.value) {
      const newIndex = originalListLength.value
      prevIndex.value = newIndex
      viewerRef.value?.setActiveItem(newIndex)
      nextTick(() => {
        pendingLoadMore.value = false
        loadingMore.value = false
      })
    } else if (!newHasMore) {
      pendingLoadMore.value = false
      loadingMore.value = false
    } else {
      if (!loadMoreRequested.value) {
        loadMoreRequested.value = true
        emit('load-more')
      }
    }
  }
)

const handleClose = () => {
  loadingMore.value = false
  pendingLoadMore.value = false
  loadMoreRequested.value = false
  emit('close')
}
</script>

<style scoped>
.image-viewer-loading-overlay {
  position: fixed;
  inset: 0;
  z-index: 3000;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.loading-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid rgba(255, 255, 255, 0.25);
  border-top-color: #ffffff;
  border-radius: 50%;
  animation: image-viewer-spin 0.8s linear infinite;
}

.loading-text {
  color: rgba(255, 255, 255, 0.8);
  font-size: 14px;
}

@keyframes image-viewer-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
