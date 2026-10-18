<script setup>
import { onMounted } from 'vue'
import KeyboardSearch from '@/components/KeyboardSearch.vue'
import { getAdminSettings } from '@/api'

// 启动时恢复后端保存的数据来源（tq 直拉 / cache 内存缓存），
// 早于 K 线首次加载；设置页切换时已写回 data/setting.json
onMounted(async () => {
  try {
    const j = await getAdminSettings()
    const ds = j.settings?.dataSource
    if (ds === 'tq' || ds === 'cache') {
      useSearchParametersStore().setDataSource(ds)
    }
  } catch (e) {
    // 后端不可用时保持默认（tq 通达信直拉）
  }
})
</script>

<template>
  <div class="app">
    <router-view/>
    <KeyboardSearch/>
  </div>
</template>
<style scoped>
.app {
  width: 100%;
  height: 100vh;
}
</style>
