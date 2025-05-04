<template>
    <div class="side-menu" :class="{ 'is-collapsed': isCollapsed }">
        <div class="menu-items">
            <div class="menu-item" :class="{ active: activeMenu === 'files' }" @click="navigateTo('files')"
                :title="isCollapsed ? '全部文件' : ''">
                <el-icon>
                    <Folder />
                </el-icon>
                <span v-if="!isCollapsed">全部文件</span>
            </div>
            <div class="menu-item" :class="{ active: activeMenu === 'favorites' }" @click="navigateTo('favorites')"
                :title="isCollapsed ? '我的收藏' : ''">
                <el-icon>
                    <Star />
                </el-icon>
                <span v-if="!isCollapsed">我的收藏</span>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, watch, defineProps } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { Folder, Star } from '@element-plus/icons-vue'

const router = useRouter()
const route = useRoute()

const props = defineProps({
    isCollapsed: {
        type: Boolean,
        default: false
    }
})

const activeMenu = ref('files')

// 监听路由变化，更新当前激活的菜单项
watch(() => route.name, (newRouteName) => {
    if (newRouteName === 'favorites') {
        activeMenu.value = 'favorites'
    } else {
        activeMenu.value = 'files'
    }
}, { immediate: true })

// 导航到指定路由
const navigateTo = (menuType) => {
    if (menuType === 'files') {
        router.push({ name: 'home' })
    } else if (menuType === 'favorites') {
        router.push({ name: 'favorites' })
    }
}
</script>

<style scoped>
.side-menu {
    width: 200px;
    height: 100%;
    background-color: #f5f7fa;
    border-right: 1px solid #e6e6e6;
    display: flex;
    flex-direction: column;
    transition: width 0.3s ease;
}

.side-menu.is-collapsed {
    width: 38px;
    /* Collapsed width */
}

.side-menu.is-collapsed .menu-item span {
    display: none;
}

.side-menu.is-collapsed .menu-item {
    justify-content: center;
}

.side-menu.is-collapsed .menu-item .el-icon {
    margin-right: 0;
}

.menu-header {
    padding: 16px;
    border-bottom: 1px solid #e6e6e6;
}

.menu-header h3 {
    margin: 0;
    color: #303133;
}

.menu-items {
    padding: 16px 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.menu-item {
    display: flex;
    align-items: center;
    padding: 12px;
    cursor: pointer;
    transition: all 0.3s;
}

.menu-item:hover {
    background-color: #e6f1fc;
}

.menu-item.active {
    background-color: #e6f1fc;
    color: #409eff;
    font-weight: 500;
}

.menu-item .el-icon {
    margin-right: 8px;
}
</style>