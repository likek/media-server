<template>
    <div class="side-menu" :class="{ 'is-collapsed': isCollapsed }">
        <div class="menu-items">
            <div class="menu-item" :class="{ active: ['home', 'folder'].includes(activeMenu) }" @click="navigateTo('home')"
                :title="isCollapsed ? '全部文件' : ''">
                <el-icon>
                    <Folder />
                </el-icon>
                <span v-if="!isCollapsed">全部文件</span>
            </div>
            <div class="menu-item" :class="{ active: activeMenu === 'my-favorites' }" @click="navigateTo('my-favorites')"
                :title="isCollapsed ? '我的收藏' : ''">
                <el-icon>
                    <Star />
                </el-icon>
                <span v-if="!isCollapsed">我的收藏</span>
            </div>
            <div class="menu-item" :class="{ active: activeMenu === 'most-favorites' }" @click="navigateTo('most-favorites')"
                :title="isCollapsed ? '最多收藏' : ''">
                <el-icon><Histogram /></el-icon>
                <span v-if="!isCollapsed">最多收藏</span>
            </div>
            <div class="menu-item" :class="{ active: activeMenu === 'admin' }" @click="navigateTo('admin')"
                :title="isCollapsed ? '用户管理' : ''">
                <el-icon>
                    <User />
                </el-icon>
                <span v-if="!isCollapsed">用户管理</span>
            </div>
            <div
                class="menu-item" :class="{ active: activeMenu === 'log-manager' }" @click="navigateTo('log-manager')"
                :title="isCollapsed ? '日志管理' : ''">
                <el-icon>
                    <Tickets />
                </el-icon>
                <span v-if="!isCollapsed">日志管理</span>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'

const router = useRouter()
const route = useRoute()

const props = defineProps({
    isCollapsed: {
        type: Boolean,
        default: false
    }
})

const activeMenu = ref('files')
const favoritesExpanded = ref(false)

// 监听路由变化，更新当前激活的菜单项
watch(() => route.name, (newRouteName) => {
    activeMenu.value = newRouteName
    // 如果当前路由是收藏相关的，自动展开收藏子菜单
    if (['favorites', 'my-favorites', 'most-favorites'].includes(newRouteName)) {
        favoritesExpanded.value = true
    }
}, { immediate: true })

// 导航到指定路由
const navigateTo = (menuType) => {
    router.push({ name: menuType })
}

// 切换收藏子菜单的展开/折叠状态
const toggleFavoritesSubmenu = () => {
    favoritesExpanded.value = !favoritesExpanded.value
}
</script>

<style scoped>
.side-menu {
    width: 120px;
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

@media (any-hover: hover) {
    .menu-item:hover {
        background-color: #e6f1fc;
    }
}

.menu-item.active {
    background-color: #e6f1fc;
    color: #409eff;
    font-weight: 500;
}

.menu-item .el-icon {
    margin-right: 8px;
}

.menu-item .expand-icon {
    margin-left: auto;
    font-size: 12px;
}

</style>