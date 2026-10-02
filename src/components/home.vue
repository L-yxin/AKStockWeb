<template>
  <el-container class="app-container">
    <el-main class="app-main">
      <!-- 顶栏：标的/日期/复权选择 -->
      <div class="topbar">
        <selection-device-view />
      </div>

      <!-- 功能菜单栏 -->
      <div class="menubar">
        <template v-for="(item, idx) in MENUS" :key="item.key">
          <div v-if="item.sep" class="menu-sep" />
          <div v-else class="menu-item" @click="handleMenu(item)">
            <el-icon><component :is="item.icon" /></el-icon>
            <span>{{ item.label }}</span>
          </div>
        </template>
        <div class="menubar-spacer" />
        <div class="menubar-status">数据源：通达信后台</div>
      </div>

      <!-- K线主区域 + 右侧固定面板（模拟交易 / 信号表现分析，不弹抽屉） -->
      <div class="chart-area">
        <div class="kline-main">
          <k-line-view ref="klineRef" />
        </div>
        <div v-show="simPanelVisible" class="sim-side">
          <simulation-panel :chart-ref="klineRef" @close="closeSimulation" />
        </div>
        <div v-show="saPanelVisible" class="sa-side">
          <signal-quality-panel :chart-ref="klineRef" @close="closeSignalAnalyze" />
        </div>
      </div>
    </el-main>
  </el-container>

  <!-- 功能抽屉 -->
  <el-drawer v-model="drawerVisible" :title="activeMenuLabel" direction="rtl" size="440px" append-to-body
    class="app-drawer">
    <indicator-panel v-if="activeMenu === 'K_lineTechnicalIndicators'" :chart-ref="klineRef"
      :preset-enabled="INITIAL_ENABLED_INDICATORS" />
    <long-short-indicator-panel v-else-if="activeMenu === 'buyingAndSellingIndicator'" :chart-ref="klineRef" />
    <cloud-metric-panel v-else-if="activeMenu === 'cloudMetricUpload'" />
    <python-indicator-panel v-else-if="activeMenu === 'pythonIndicator'" :chart-ref="klineRef" />
  </el-drawer>
</template>

<script setup>
import { TrendCharts, Bell, Download, DataAnalysis, Coin, Cpu } from '@element-plus/icons-vue'
import { ws_getTradingSignals_url } from '@/api'
import { INITIAL_ENABLED_INDICATORS } from '@/config/indicatorDefaults'
import { applyUrlParams } from '@/urlParams'

const searchStore = useSearchParametersStore()

// ---------- 菜单配置（抽离，新增菜单项只改这里） ----------
const MENUS = [
  { key: 'K_lineTechnicalIndicators', label: 'K线技术指标', icon: TrendCharts, action: 'drawer' },
  { sep: true },
  { key: 'buyingAndSellingIndicator', label: '买卖提示指标', icon: Bell, action: 'drawer' },
  { sep: true },
  { key: 'loadTrades', label: '加载pybroker订单', icon: Download, action: 'loadTrades' },
  { sep: true },
  { key: 'signalAnalyze', label: '信号表现分析', icon: DataAnalysis, action: 'signalPanel' },
  { sep: true },
  { key: 'simulation', label: '模拟交易', icon: Coin, action: 'simPanel' },
  { sep: true },
  { key: 'cloudMetricUpload', label: '云指标', icon: TrendCharts, action: 'drawer' },
  { sep: true },
  { key: 'pythonIndicator', label: 'Python指标', icon: Cpu, action: 'drawer' },
]

const drawerVisible = ref(false)
const activeMenu = ref('')
const klineRef = ref(null)

const simPanelVisible = ref(false)
const saPanelVisible = ref(false)

const activeMenuLabel = computed(() => {
  const m = MENUS.find(x => x.key === activeMenu.value)
  return m?.label || activeMenu.value
})

const notifyChartResize = () => {
  setTimeout(() => window.dispatchEvent(new Event('resize')), 30)
}

const handleMenu = (item) => {
  if (item.action === 'drawer') {
    activeMenu.value = item.key
    drawerVisible.value = true
  } else if (item.action === 'loadTrades') {
    loadGetTradingSignals()
  } else if (item.action === 'simPanel') {
    saPanelVisible.value = false
    simPanelVisible.value = true
    notifyChartResize()
  } else if (item.action === 'signalPanel') {
    simPanelVisible.value = false
    saPanelVisible.value = true
    notifyChartResize()
  }
}

const closeSimulation = () => {
  simPanelVisible.value = false
  notifyChartResize()
}
const closeSignalAnalyze = () => {
  saPanelVisible.value = false
  notifyChartResize()
}

// ---------- 加载 pybroker 交易订单 ----------
const loadGetTradingSignals = () => {
  const ws = new WebSocket(ws_getTradingSignals_url)

  ws.onopen = () => {
    ws.send(JSON.stringify({
      symbol: searchStore.symbol,
      startTime: searchStore.startDate,
      endTime: searchStore.endDate,
      adjust_type: searchStore.adjust_type
    }))
  }

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data)
      if (!data || !Array.isArray(data.configs)) {
        throw new Error(`返回数据格式不正确，预期包含 configs 数组\ndata: ${JSON.stringify(data).slice(0, 200)}`)
      }

      const chart = klineRef.value?.chart
      if (!chart) {
        ElMessage.error('图表实例未就绪')
        return
      }

      klineRef.value?.clearAllMarkers(chart)

      const markers = []
      for (const signal of data.configs) {
        const { datetime, value, type, mes } = signal
        const iso = datetime.includes('T') ? datetime : datetime.replace(' ', 'T')
        const tsStr = /\d{1,2}:\d{2}(:\d{2})?/.test(iso) ? iso : iso + 'T00:00:00'
        const timestamp = new Date(tsStr + '+08:00').getTime()
        markers.push({ timestamp, value, type, mes })
      }

      klineRef.value?.addMarkers(chart, markers, 'stock')
      ElMessage.success(`成功加载 ${markers.length} 个交易信号`)
    } catch (e) {
      console.error('处理交易信号失败:', e)
      ElMessage.error('处理交易信号失败：' + e.message)
    } finally {
      ws.close()
    }
  }

  ws.onerror = (error) => {
    console.error('WebSocket 错误:', error)
    ElMessage.error('加载 pybroker 订单失败，请确认后台已启动')
  }
}

onMounted(() => {
  applyUrlParams({
    getChartInstance: () => klineRef.value,
    loadTradingSignals: loadGetTradingSignals,
  })
})
</script>

<style scoped>
.app-container {
  width: 100%;
  height: 100%;
}
.app-main {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 0;
  overflow: hidden;
}

.topbar {
  height: 56px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--border);
  background: var(--panel);
}

.menubar {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 44px;
  flex-shrink: 0;
  padding: 0 14px;
  background: var(--panel);
  border-bottom: 1px solid var(--border);
}
.menu-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  border-radius: 7px;
  color: var(--text-2);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;
  user-select: none;
}
.menu-item:hover {
  color: #fff;
  background: rgba(59, 130, 246, 0.14);
}
.menu-item:active {
  transform: scale(0.97);
}
.menu-sep {
  width: 1px;
  height: 18px;
  background: var(--border);
  margin: 0 6px;
}
.menubar-spacer {
  flex: 1;
}
.menubar-status {
  font-size: 12px;
  color: var(--text-3);
}

.chart-area {
  flex: 1;
  min-height: 0;
  min-width: 0;
  padding: 10px;
  display: flex;
  gap: 10px;
}
.kline-main {
  flex: 1;
  min-width: 0;
  height: 100%;
}
.sim-side {
  width: 440px;
  flex: none;
  overflow-y: auto;
  border-left: 1px solid rgba(148, 163, 184, 0.15);
  padding-left: 10px;
}
.sa-side {
  width: 660px;
  flex: none;
  height: 100%;
  overflow-y: auto;
  border-left: 1px solid rgba(148, 163, 184, 0.15);
  padding-left: 10px;
}
</style>
