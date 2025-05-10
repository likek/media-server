import { registerRoute } from 'workbox-routing'
import { CacheFirst } from 'workbox-strategies'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'
import { ExpirationPlugin } from 'workbox-expiration'
import { setCacheNameDetails, clientsClaim, skipWaiting } from 'workbox-core'
import { RouteConfig } from './typing/typing'
import staticPageFile from './staticPageFile/index'

skipWaiting() // 安装后，自动跳过等待，直接激活
clientsClaim() // 激活后，立即控制页面

// 命名空间
setCacheNameDetails({
    prefix: 'cccms-cache',
    suffix: 'v1'
})

// 注册单个
function registerRouteConfig(routeConfig: RouteConfig) {
    const { match, cacheName, maxEntries, maxAgeSeconds, strategy } = routeConfig
    const strategyInstance = strategy || new CacheFirst()
    
    strategyInstance.cacheName = cacheName
    strategyInstance.plugins = [
        ...(strategyInstance.plugins || []),
        new CacheableResponsePlugin({ statuses: [200] }),
        new ExpirationPlugin({
            maxEntries: maxEntries || 500,
            maxAgeSeconds: maxAgeSeconds || 365 * 24 * 60 * 60
        })
    ]

    registerRoute(match, strategyInstance)
}

// 注册多个
function registerRoutesConfig(routesConfig: RouteConfig[]) {
    routesConfig.forEach(routeConfig => {
        registerRouteConfig(routeConfig)
    })
}

registerRoutesConfig(staticPageFile)
