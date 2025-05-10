import { RouteMatchCallback } from "workbox-core"
import { Route } from "workbox-routing"
import { Strategy } from "workbox-strategies"

export enum CacheNames {
    assetsjs = 'asseysjs',
    assetscss = 'asseyscss',
    assetpng = 'assetpng',
    assetswasm = 'assetswasm',
    indexhtml = 'indexhtml',
}

export interface RouteConfig {
    match: RegExp | string | RouteMatchCallback | Route // 匹配规则
    cacheName: CacheNames
    strategy?: Strategy // 缓存策略
    maxEntries?: number
    maxAgeSeconds?: number
}
