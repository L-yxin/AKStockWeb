<template>
  <div class="selection-bar">
    <div class="brand">
      <div class="brand-logo">AK</div>
      <div class="brand-text">
        <span class="brand-title">AKStock</span>
        <span class="brand-sub">量化信号分析平台</span>
      </div>
    </div>

    <div class="controls">
      <el-select v-model="searchStore.symbol"
        class="control-item symbol-select"
        filterable
        remote
        :remote-method="fetchAllSymbols"
        :loading="symbolLoading"
        placeholder="输入代码或名称搜索标的"
        @focus="fetchAllSymbols">
        <el-option v-for="item in symbolOptions" :key="item.code"
          :label="item.label" :value="item.code" />
      </el-select>

      <el-date-picker v-model="dateRange" type="datetimerange"
        class="control-item date-picker"
        range-separator="至"
        start-placeholder="开始日期"
        end-placeholder="结束日期"
        value-format="YYYY-MM-DD HH:mm:ss"
        :clearable="false" />

      <el-select v-model="searchStore.adjust_type" class="control-item adjust-select">
        <el-option label="不复权" value="none" />
        <el-option label="前复权" value="front" />
        <el-option label="后复权" value="back" />
      </el-select>

      <el-button type="primary" class="search-btn" @click="handleSearch">
        加载数据
      </el-button>
    </div>
  </div>
</template>

<script setup>
import { ws_allSymbols_url } from '@/api'

const searchStore = useSearchParametersStore()
const symbolOptions = ref([])
const symbolLoading = ref(false)

const dateRange = ref([searchStore.startDate, searchStore.endDate])

// URL 参数处理：searchStore 起止时间被 URL 修改后同步日期选择器显示（仅新增，不影响既有逻辑）
watch(
  () => [searchStore.startDate, searchStore.endDate],
  ([s, e]) => {
    if (s && e) dateRange.value = [s, e]
  }
)

// 拉取所有标的列表
const fetchAllSymbols = (query) => {
  symbolLoading.value = true
  const ws = new WebSocket(ws_allSymbols_url)
  ws.onopen = () => {
    ws.send(JSON.stringify({
      action: 'allSymbols',
      query: query || '',
    }))
  }
  ws.onmessage = (event) => {
    let res
    try {
      res = JSON.parse(event.data)
    } catch (e) {
      console.error('[allSymbols] 解析失败:', e)
      symbolLoading.value = false
      ws.close()
      return
    }
    const list = res.data || []
    symbolOptions.value = list.map(item => ({
      code: item.code,
      label: `${item.name || ''} ${item.code}`.trim(),
    }))
    symbolLoading.value = false
    ws.close()
  }
  ws.onerror = () => {
    symbolLoading.value = false
    ws.close()
  }
}

const handleSearch = () => {
  if (dateRange.value && dateRange.value.length === 2) {
    searchStore.startDate = dateRange.value[0]
    searchStore.endDate = dateRange.value[1]
  }
  searchStore.onLoad()
}
</script>

<style scoped>
.selection-bar {
  display: flex;
  align-items: center;
  gap: 20px;
  height: 100%;
  padding: 0 20px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}
.brand-logo {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: linear-gradient(135deg, #3b82f6, #6366f1);
  color: #fff;
  font-weight: 800;
  font-size: 15px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.35);
}
.brand-text {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
}
.brand-title {
  font-size: 15px;
  font-weight: 700;
  color: #e2e8f0;
  letter-spacing: 0.5px;
}
.brand-sub {
  font-size: 11px;
  color: #64748b;
}

.controls {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
}
.control-item {
  --el-component-size: 34px;
}
.symbol-select {
  flex: 1;
  max-width: 300px;
}
.date-picker {
  flex: 1;
  max-width: 320px;
}
.adjust-select {
  width: 108px;
}
.search-btn {
  --el-component-size: 34px;
  border-radius: 6px;
  font-weight: 600;
  padding: 0 22px;
  background: linear-gradient(135deg, #3b82f6, #6366f1);
  border: none;
}
.search-btn:hover {
  opacity: 0.92;
}
</style>
