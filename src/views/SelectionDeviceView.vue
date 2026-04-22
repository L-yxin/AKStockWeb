<script setup>
import { debounce } from 'lodash-es'
import { ws_allSymbols_url } from '@/api'
const ws_allSymbols = ws_allSymbols_url
// 实例化仓库 ✅
const searchStore = useSearchParametersStore() // 修正命名，更规范

// 全量标的（只存不渲染）
let allSymbolsRaw = []
const symbolOptions = ref([])

// 技术指标/买卖提示（不变）
const indicatorOptions = ref([
  { label: 'MA 均线', value: 'MA' },
  { label: 'EMA 指数均线', value: 'EMA' },
  { label: 'MACD', value: 'MACD' },
  { label: 'KDJ', value: 'KDJ' },
  { label: 'RSI', value: 'RSI' },
  { label: 'BOLL 布林带', value: 'BOLL' },
  { label: 'VOL 成交量', value: 'VOL' },
]);

const signalOptions = ref([
  { label: '金叉提示', value: 'golden_cross' },
  { label: '死叉提示', value: 'dead_cross' },
  { label: '突破提示', value: 'break_up' },
  { label: '跌破提示', value: 'break_down' },
  { label: '超买提示', value: 'over_bought' },
  { label: '超卖提示', value: 'over_sold' },
])

// 获取全量标的
function fetchAllSymbols() {
  const ws = new WebSocket(ws_allSymbols)
  ws.onopen = () => {
    ws.send(JSON.stringify({ t: new Date().getTime() }))
  }
  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data)
      if (Array.isArray(data)) {
        allSymbolsRaw = data
      }
    } catch (err) {
      console.error("解析标的列表数据失败:", err)
    }
  }
  ws.onerror = (error) => console.error("WebSocket错误:", error)
}

// 本地过滤
function filterSymbols(keyword) {
  symbolOptions.value = []
  if (!keyword || !allSymbolsRaw.length) return

  const lowerKeyword = keyword.toLowerCase()
  const result = []
  const maxCount = 10

  for (let i = 0; i < allSymbolsRaw.length; i++) {
    const item = allSymbolsRaw[i]
    if (item.toLowerCase().includes(lowerKeyword)) {
      result.push({ label: item, value: item })
      if (result.length >= maxCount) break
    }
  }
  symbolOptions.value = result
}

const debouncedFilter = debounce(filterSymbols, 300)
function remoteMethod(query) {
  debouncedFilter(query)
}

onMounted(() => {
  fetchAllSymbols()
})
</script>

<template>
  <el-form label-position="top" class="selection-form">
    <div class="form-grid">
      <!-- 标的（绑定Pinia） ✅ -->
      <el-form-item label="标的" label-position="left">
        <el-select
          v-model="searchStore.symbol"
          filterable
          remote
          :remote-method="remoteMethod"
          placeholder="请输入代码/名称搜索"
          style="width: 100%"
          :loading="false"
        >
          <el-option
            v-for="item in symbolOptions"
            :key="item.value"
            :label="item.label"
            :value="item.value"
          />
        </el-select>
      </el-form-item>

      <!-- 时间（绑定Pinia） ✅ -->
      <el-form-item label="开始时间" label-position="left">
        <el-date-picker
          v-model="searchStore.startDate"
          type="date"
          format="YYYY-MM-DD"
          value-format="YYYY-MM-DD"
          placeholder="选择开始日期"
        />
      </el-form-item>
      <el-form-item label="结束时间" label-position="left">
        <el-date-picker
          v-model="searchStore.endDate"
          type="date"
          format="YYYY-MM-DD"
          value-format="YYYY-MM-DD"
          placeholder="选择结束日期"
        />
      </el-form-item>

      <!-- 加载按钮：触发Pinia的onLoad方法 ✅ -->
      <el-button type="primary" @click="searchStore.onLoad">加载</el-button>
    </div>
  </el-form>
</template>

<style scoped>
.selection-form {
  border-radius: 8px;
  box-shadow: 0 2px 8px #00000008;
}
.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px;
}
:deep(.el-form-item .el-form-item__label) {
  font-weight: 600;
  font-size: 18px;
  color: rgb(255, 255, 255);
}
</style>