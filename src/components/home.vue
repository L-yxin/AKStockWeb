<template>
  <el-container class="app-container">
    <el-main class="app-main">
      <!-- 顶栏：标的/日期/复权选择 -->
      <div class="topbar">
        <selection-device-view />
      </div>

      <!-- 功能菜单栏 -->
      <div class="menubar">
        <div class="menu-item" @click="openDrawer('K_lineTechnicalIndicators')">
          <el-icon><TrendCharts /></el-icon>
          <span>K线技术指标</span>
        </div>
        <div class="menu-sep" />
        <div class="menu-item" @click="openDrawer('buyingAndSellingIndicator')">
          <el-icon><Bell /></el-icon>
          <span>买卖提示指标</span>
        </div>
        <div class="menu-sep" />
        <div class="menu-item" @click="loadGetTradingSignals">
          <el-icon><Download /></el-icon>
          <span>加载pybroker订单</span>
        </div>
        <div class="menu-sep" />
        <div class="menu-item" @click="openDrawer('signalQualityEvaluate')">
          <el-icon><DataAnalysis /></el-icon>
          <span>信号质量评测</span>
        </div>
        <div class="menu-sep" />
        <div class="menu-item" @click="openSimulation">
          <el-icon><Coin /></el-icon>
          <span>模拟交易</span>
        </div>
        <div class="menu-sep" />
        <div class="menu-item" @click="openDrawer('cloudMetricUpload')">
          <el-icon><TrendCharts /></el-icon>
          <span>云指标</span>
        </div>
        <div class="menubar-spacer" />
        <div class="menubar-status">数据源：通达信后台</div>
      </div>

      <!-- K线主区域 + 模拟交易右侧面板（启用模拟交易时不弹抽屉，直接固定在右侧） -->
      <div class="chart-area">
        <div class="kline-main">
          <k-line-view ref="klineRef" />
        </div>
        <div v-show="simPanelVisible" class="sim-side">
          <simulation-panel :chart-ref="klineRef" @close="closeSimulation" />
        </div>
      </div>
    </el-main>
  </el-container>

  <!-- 功能抽屉 -->
  <el-drawer v-model="drawerVisible" :title="getCH(activeMenu)" direction="rtl" size="440px" append-to-body
    class="app-drawer">
    <indicator-panel v-if="activeMenu === 'K_lineTechnicalIndicators'" :chart-ref="klineRef"
      :preset-enabled="INITIAL_ENABLED_INDICATORS" />
    <long-short-indicator-panel v-else-if="activeMenu === 'buyingAndSellingIndicator'" :chart-ref="klineRef" />
    <signal-quality-panel v-else-if="activeMenu === 'signalQualityEvaluate'" :chart-ref="klineRef" />
    <cloud-metric-panel v-else-if="activeMenu === 'cloudMetricUpload'" />
  </el-drawer>
</template>

<script setup>
import { TrendCharts, Bell, Download, DataAnalysis, Coin, Upload } from '@element-plus/icons-vue'
import { ws_getTradingSignals_url } from '@/api'
import { INITIAL_ENABLED_INDICATORS } from '@/config/indicatorDefaults'

const searchStore = useSearchParametersStore()

// 抽屉控制（K线技术指标/买卖提示指标/信号质量评测）
const drawerVisible = ref(false)
const activeMenu = ref('')
const klineRef = ref(null)

// 模拟交易：不弹抽屉，面板固定在 K 线图右侧
const simPanelVisible = ref(false)
// 面板显示/隐藏会改变 K 线区宽度 → 通知图表 resize，避免画布与容器错位
const notifyChartResize = () => {
  setTimeout(() => window.dispatchEvent(new Event('resize')), 30)
}
const openSimulation = () => {
  simPanelVisible.value = true
  notifyChartResize()
}
const closeSimulation = () => {
  simPanelVisible.value = false
  notifyChartResize()
}

const openDrawer = (menu) => {
  activeMenu.value = menu
  drawerVisible.value = true
}

const getCH = (key) => {
  const map = {
    K_lineTechnicalIndicators: 'K线技术指标',
    buyingAndSellingIndicator: '买卖提示指标',
    signalQualityEvaluate: '信号质量评测',
    simulation: '模拟交易',
    cloudMetricUpload: '云指标',
  }
  return map[key] || key
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

      // 1. 清除旧的信号标记
      klineRef.value?.clearAllMarkers(chart)

      // 2. 遍历信号，转换为标记参数并添加
      const markers = []
      for (const signal of data.configs) {
        const { datetime, value, type, mes } = signal

        // 将本地日期字符串转为"本地时间当 UTC"的 epoch（与 K 线时间戳语义一致，
        // 显式 +08:00 避免受浏览器时区影响）
        const iso = datetime.includes('T') ? datetime : datetime.replace(' ', 'T')
        const tsStr = /\d{1,2}:\d{2}(:\d{2})?/.test(iso) ? iso : iso + 'T00:00:00'
        const timestamp = new Date(tsStr + '+08:00').getTime()

        markers.push({
          timestamp,
          value,          // 价格位置
          type,           // B/S/T 等
          mes             // 悬停显示的消息
        })
      }

      // 3. 将所有标记一次性添加到图表
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
</style>
