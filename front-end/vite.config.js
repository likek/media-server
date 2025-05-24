import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import wasm from 'vite-plugin-wasm'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import AutoImport from 'unplugin-auto-import/vite'

const PORT_SERVER = process.env.PORT_SERVER || 7777;
const HOST_SERVER = 'localhost'
console.log('PORT_SERVER', PORT_SERVER)

// https://vitejs.dev/config/
export default defineConfig({
    host: '0.0.0.0',
    port: 5173,
    plugins: [vue(), wasm(), 
      AutoImport({
        resolvers: [ElementPlusResolver()],
      }), 
      Components({
        resolvers: [ElementPlusResolver()],
      })
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  build: {
    outDir: '../static',
    target: 'es2022',
    // outDir: 'dist',
    chunkSizeWarningLimit: 1000,
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true
      },
      format: {
        comments: false
      }
    },
    rollupOptions: {
      output: {
        manualChunks: {
          'vue': ['vue', 'vue-router'],
          'element-plus': ['element-plus'],
          'vendor': ['axios']
        }
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