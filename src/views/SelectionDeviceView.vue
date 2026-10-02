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

      <div class="period-bar">
        <button v-for="p in PERIODS" :key="`${p.span}${p.type}`" type="button"
          class="period-btn" :class="{ active: `${p.span}${p.type}` === periodKey }"
          @click="switchPeriod(p)">
          {{ p.label }}
        </button>
        <input v-model="customPeriod" type="text" class="period-custom"
          placeholder="自定义" @keyup.enter="applyCustomPeriod" />
      </div>

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

// 周期切换
const PERIODS = [
  { label: '1分', type: 'minute', span: 1 },
  { label: '5分', type: 'minute', span: 5 },
  { label: '15分', type: 'minute', span: 15 },
  { label: '30分', type: 'minute', span: 30 },
  { label: '60分', type: 'hour', span: 1 },
  { label: '日K', type: 'day', span: 1 },
  { label: '周K', type: 'week', span: 1 },
  { label: '月K', type: 'month', span: 1 },
]
const periodKey = computed(() => {
  const p = searchStore.period
  if (!p) return '1day'
  return `${p.span}${p.type}`
})
const switchPeriod = (p) => {
  if (periodKey.value === `${p.span}${p.type}`) return
  searchStore.setPeriod(p)
}

// 自定义周期输入（如 2d / 30m / 1w）
const customPeriod = ref('')
const applyCustomPeriod = () => {
  const raw = customPeriod.value.trim()
  if (!raw) return
  const m = raw.match(/^(\d+)\s*([mhdwMy])$/i)
  if (!m) {
    ElMessage.warning('周期格式：数字+字母（m分/h时/d日/w周/M月/y年）')
    return
  }
  const span = parseInt(m[1])
  const suffix = m[2].toLowerCase()
  const typeMap = { m: 'minute', h: 'hour', d: 'day', w: 'week', y: 'month' }
  if (suffix === 'm' && m[2] === 'M') typeMap.M = 'month'
  const type = typeMap[suffix]
  if (!type) return
  // y 年 → month * 12
  const realSpan = suffix === 'y' ? span * 12 : span
  searchStore.setPeriod({ type, span: realSpan })
  customPeriod.value = ''
}

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
.period-bar {
  display: flex;
  gap: 2px;
  padding: 3px;
  background: rgba(148,163,184,0.08);
  border: 1px solid rgba(148,163,184,0.2);
  border-radius: 6px;
}
.period-btn {
  padding: 4px 10px;
  font-size: 12px;
  color: #94a3b8;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s;
}
.period-btn:hover {
  color: #e2e8f0;
  background: rgba(148,163,184,0.12);
}
.period-btn.active {
  color: #fff;
  background: #3b82f6;
  border-color: #3b82f6;
}
.period-custom {
  width: 60px;
  padding: 4px 6px;
  font-size: 12px;
  color: #94a3b8;
  background: transparent;
  border: 1px solid rgba(148,163,184,0.2);
  border-radius: 4px;
  outline: none;
}
.period-custom:focus {
  color: #e2e8f0;
  border-color: rgba(59,130,246,0.5);
}
.period-custom::placeholder { color: #64748b; }
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
