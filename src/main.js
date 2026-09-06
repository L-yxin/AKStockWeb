import { createApp } from 'vue'
import App from './App.vue'

import './style.css'

// 路由
import router from './router'
// pinia
import { createPinia } from 'pinia'
// Element Plus
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
// Element Plus 深色模式变量
import 'element-plus/theme-chalk/dark/css-vars.css'
// Element Plus Icons
import * as ElementPlusIconsVue from '@element-plus/icons-vue'

// 启用深色模式
document.documentElement.classList.add('dark')

const app = createApp(App)

// 注册所有图标
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}

app.use(createPinia())
app.use(router)
app.use(ElementPlus)
app.mount('#app')
