import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import path from 'path'
import monacoEditorPlugin from 'vite-plugin-monaco-editor'
export default defineConfig({ 
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  },
  plugins: [
    vue(),
      monacoEditorPlugin({
      // 按需指定需要支持的 Worker 语言
      languages: ['json', 'css', 'html', 'typescript','python'],
    }),
    // 自动导入
    
    AutoImport({
      resolvers: [
        // ✅ 关键：强制开启 el- 前缀
        ElementPlusResolver()
      ],
      imports: ['vue', 'vue-router', 'pinia'],
      dirs: [
        'src/composables/**',
        'src/utils/**',
        'src/stores/**',
        'src/api/**',
        "src/**/*.js",
        "src/**/*.vue"
      ],
      dts: 'src/auto-imports.d.ts',
    }),

    // 自动注册组件
    Components({
      resolvers: [
        // ✅ 关键：强制开启 el- 前缀
        ElementPlusResolver()
      ],
      dirs: [ 'src/**'],
      extensions: ['vue'],
      deep: true,
      dts: 'src/components.d.ts',
    }),
  ]
})