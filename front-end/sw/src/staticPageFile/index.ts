import { NetworkFirst, Strategy } from "workbox-strategies"
import { CacheNames, RouteConfig } from "../typing/typing"

const routes: RouteConfig[] = [
    {
        match: ({ url }) => /^\/assets\/.+\.js$/.test(url.pathname),
        cacheName: CacheNames.assetsjs,
        maxEntries: 300,
        maxAgeSeconds: 365 * 24 * 60 * 60
    },
    {
        match: ({ url }) => /^\/assets\/.+\.css$/.test(url.pathname),
        cacheName: CacheNames.assetscss,
        maxEntries: 300,
        maxAgeSeconds: 365 * 24 * 60 * 60
    },
    {
        match: ({ url }) => /^\/assets\/.+\.png$/.test(url.pathname),
        cacheName: CacheNames.assetpng,
        maxEntries: 300,
        maxAgeSeconds: 365 * 24 * 60 * 60
    },
    {
        match: ({ url }) => /^\/assets\/.+\.wasm$/.test(url.pathname),
        cacheName: CacheNames.assetswasm,
        maxEntries: 300,
        maxAgeSeconds: 365 * 24 * 60 * 60
    },
    {
        match: ({ url }) => /^\/index\.html$/.test(url.pathname) || url.pathname === '/',
        cacheName: CacheNames.indexhtml,
        maxEntries: 1,
        maxAgeSeconds: 365 * 24 * 60 * 60,
        // index.html网络优先
        strategy: new NetworkFirst()
    },
]

export default routes
