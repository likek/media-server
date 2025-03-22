import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
    host: '0.0.0.0',
    port: 5173,
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  build: {
    outDir: '../static',
    chunkSizeWarningLimit: 1000,
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
      '/api': {
        target: 'http://localhost:7777',
        changeOrigin: true
      },
      '/uploads': {
        target: 'http://localhost:7777',
        changeOrigin: true
      },
      '/thumbnails': {
        target: 'http://localhost:7777',
        changeOrigin: true
      }
    }
  }
})