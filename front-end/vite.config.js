import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import fs from 'fs'
import path from 'path'
import wasm from 'vite-plugin-wasm'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import AutoImport from 'unplugin-auto-import/vite'
import { minify } from 'terser'

const PORT_SERVER = process.env.PORT_SERVER || 7777;
const HOST_SERVER = 'localhost'
console.log('PORT_SERVER', PORT_SERVER)

const MANUAL_SENSITIVE_STRING_LITERALS = [
  'backdoor',
  'homeTap',
  'menuStatus',
  'downloadFromText',
  'rebuildImageHash',
  'convertToHls',
  'setFolderCover'
]

const SERVICE_REQUEST_METHODS = ['p', 'get', 'post', 'put', 'patch', 'delete']

const walkFiles = (dirPath) => {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name)
    if (entry.isDirectory()) {
      files.push(...walkFiles(fullPath))
      continue
    }
    if (/\.(js|ts)$/.test(entry.name)) {
      files.push(fullPath)
    }
  }
  return files
}

const escapeRegexLiteral = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const collectServiceRequestPaths = () => {
  const servicesDir = path.resolve(__dirname, './src/services')
  if (!fs.existsSync(servicesDir)) {
    return []
  }

  const requestPattern = new RegExp(
    `request\\.(?:${SERVICE_REQUEST_METHODS.map(escapeRegexLiteral).join('|')})\\s*\\(\\s*(['"\`])([^'"\\\`]+)\\1`,
    'g'
  )
  const collectedPaths = new Set()

  for (const filePath of walkFiles(servicesDir)) {
    const content = fs.readFileSync(filePath, 'utf8')
    for (const match of content.matchAll(requestPattern)) {
      const requestPath = match[2]
      if (requestPath.startsWith('/')) {
        collectedPaths.add(requestPath)
      }
    }
  }

  return Array.from(collectedPaths).sort()
}

const SENSITIVE_STRING_LITERALS = [
  ...collectServiceRequestPaths(),
  ...MANUAL_SENSITIVE_STRING_LITERALS
]

const isAppChunk = (chunk) => {
  if (chunk.type !== 'chunk') {
    return false
  }
  return Object.keys(chunk.modules || {}).some((id) => {
    return id.includes('/src/') || id.includes('\\src\\')
  })
}

const appChunkObfuscator = () => {
  return {
    name: 'app-chunk-obfuscator',
    apply: 'build',
    enforce: 'post',
    async generateBundle(_, bundle) {
      for (const output of Object.values(bundle)) {
        if (!isAppChunk(output)) {
          continue
        }
        const result = await minify(output.code, {
          ecma: 2022,
          module: true,
          compress: {
            drop_console: true,
            drop_debugger: true,
            passes: 2,
            toplevel: true,
            pure_getters: true
          },
          mangle: {
            toplevel: true,
            safari10: true
          },
          format: {
            comments: false,
            ascii_only: true
          }
        })
        if (result.code) {
          output.code = result.code
        }
        if (Object.prototype.hasOwnProperty.call(output, 'map')) {
          output.map = null
        }
      }
    }
  }
}

const toSingleQuotedLiteral = (value) => {
  return `'${String(value)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')}'`
}

const sensitiveStringShield = () => {
  return {
    name: 'sensitive-string-shield',
    apply: 'build',
    enforce: 'post',
    generateBundle(_, bundle) {
      for (const output of Object.values(bundle)) {
        if (!isAppChunk(output)) {
          continue
        }

        let code = output.code
        const usedIndexes = new Set()

        SENSITIVE_STRING_LITERALS.forEach((literal, index) => {
          const replacements = [JSON.stringify(literal), toSingleQuotedLiteral(literal)]
          replacements.forEach((rawLiteral) => {
            if (!code.includes(rawLiteral)) {
              return
            }
            usedIndexes.add(index)
            code = code.split(rawLiteral).join(`__ss(${index})`)
          })
        })

        if (!usedIndexes.size) {
          continue
        }

        const localTable = `{${Array.from(usedIndexes)
          .map((index) => `${index}:${JSON.stringify(Buffer.from(SENSITIVE_STRING_LITERALS[index]).toString('base64'))}`)
          .join(',')}}`

        output.code = `const __ss=(()=>{const __sm=${localTable};return t=>atob(__sm[t])})();${code}`
      }
    }
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  host: '0.0.0.0',
  port: 5173,
  plugins: [
    vue(),
    wasm(),
    AutoImport({
      resolvers: [ElementPlusResolver()],
    }),
    Components({
      resolvers: [ElementPlusResolver()],
    }),
    sensitiveStringShield(),
    appChunkObfuscator()
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  build: {
    outDir: '../static',
    target: 'es2022',
    sourcemap: false,
    reportCompressedSize: false,
    chunkSizeWarningLimit: 1000,
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.info', 'console.debug']
      },
      mangle: {
        safari10: true
      },
      format: {
        comments: false,
        ascii_only: true
      }
    },
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[hash].js',
        chunkFileNames: 'assets/[hash].js',
        assetFileNames: 'assets/[hash][extname]'
      }
    }
  },
  server: {
    proxy: {
      '/i': {
        target: `http://${HOST_SERVER}:${PORT_SERVER}`,
        changeOrigin: true
      },
      '/media': {
        target: `http://${HOST_SERVER}:${PORT_SERVER}`,
        changeOrigin: true
      },
      '/thumbnail': {
        target: `http://${HOST_SERVER}:${PORT_SERVER}`,
        changeOrigin: true
      }
    }
  }
})
