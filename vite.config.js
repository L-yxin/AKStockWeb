import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import path from 'path'
import vueInspector from 'vite-plugin-vue-inspector'
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  },
  plugins: [
    vue(),
    vueInspector({
      // editor: 'code', // 指定VSCode为默认编辑器
      toggleButtonVisibility: 'always' // 始终显示切换按钮
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