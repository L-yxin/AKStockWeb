<template>
  <div id="chart" class="chart" ref="chartEle"></div>
  <div ref="unifiedTooltip" class="unified-tooltip" v-show="tooltipVisible"
    :style="{ left: tooltipPos.x + 'px', top: tooltipPos.y + 'px' }">
    <!-- K线部分（有值才显示） -->
    <template v-if="currentKline">
      <div class="tooltip-header">{{ formatDateTime(currentKline.timestamp) }}</div>
      <div class="tooltip-row">
        <span class="label">开</span>
        <span class="value" :class="klineChangeClass(currentKline.open, currentKline.preClose)">{{ currentKline.open
          }}</span>
      </div>
      <div class="tooltip-row">
        <span class="label">高</span>
        <span class="value high-low">{{ currentKline.high }}</span>
      </div>
      <div class="tooltip-row">
        <span class="label">低</span>
        <span class="value high-low">{{ currentKline.low }}</span>
      </div>
      <div class="tooltip-row">
        <span class="label">收</span>
        <span class="value" :class="klineChangeClass(currentKline.close, currentKline.preClose)">{{ currentKline.close
          }}</span>
      </div>
      <div class="tooltip-row">
        <span class="label">量</span>
        <span class="value volume">{{ formatVolume(currentKline.volume) }}</span>
      </div>
      <div class="tooltip-per">
          <span class="label">涨幅</span>
          <span class="value">{{ ((currentKline.close - currentKline.preClose) / currentKline.preClose * 100).toFixed(2) }}%</span>
      </div>
    </template>

    <!-- 交易信号部分 -->
    <template v-if="tooltipMessages.length > 0">
      <div class="tooltip-divider" v-if="currentKline"></div>
      <div class="tooltip-signal" v-for="(msg, idx) in tooltipMessages" :key="idx">
        • {{ msg }}
      </div>
    </template>
  </div>
</template>

<script setup>
import { init, dispose, registerOverlay, registerIndicator } from 'klinecharts'
import { RSI } from 'technicalindicators'
import { ws_kline_url } from '@/api'

// ==================== Pinia Store ====================
const searchStore = useSearchParametersStore()

// ==================== 响应式状态 ====================
const chart = ref(null)
let pollTimer = null
let currentLatestDate = null

const DEFAULT_PAGE_SIZE = 30 * 2
const WS_URL = ws_kline_url

// ==================== 标记相关全局状态 ====================
const mesMap = new Map() // 按时间戳存储所有消息

// ==================== 工具函数（完整实现） ====================
function normalizeToKLineData(item) {
  return {
    timestamp: item.timestamp,
    open: item.open,
    high: item.high,
    low: item.low,
    close: item.close,
    volume: item.volume,
  }
}
const chartEle = ref(null)
const unifiedTooltip = ref(null)
const tooltipVisible = ref(false)
const tooltipMessages = ref([]) // 当前日期对应的交易信号消息列表
const tooltipPos = ref({ x: 0, y: 0 })
let currentKline = ref(null)

// 格式化函数（与之前高质感版本相同）
function formatDateTime(timestamp) {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  const pad = (n) => n.toString().padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
function formatVolume(vol) {
  if (vol >= 1e9) return (vol / 1e9).toFixed(2) + 'B'
  if (vol >= 1e6) return (vol / 1e6).toFixed(2) + 'M'
  if (vol >= 1e3) return (vol / 1e3).toFixed(2) + 'K'
  return vol.toString()
}
function klineChangeClass(current, prevClose) {
  if (prevClose === undefined || prevClose === null) return ''
  return current >= prevClose ? 'up' : 'down'
}
function timestampToDateStr(timestampMs) {
  if (!timestampMs || isNaN(timestampMs) || timestampMs <= 0) return null
  const date = new Date(timestampMs)
  if (isNaN(date.getTime())) return null
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function addDays(dateStr, days) {
  if (!dateStr) return null
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  const year = parseInt(match[1], 10)
  const month = parseInt(match[2], 10) - 1
  const day = parseInt(match[3], 10)
  const date = new Date(year, month, day)
  date.setDate(date.getDate() + days)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function todayStr() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

// ==================== 历史数据请求 ====================
function fetchHistoryData(symbol, period, startDate, endDate) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL)
    ws.onopen = () => {
      ws.send(JSON.stringify({
        action: "history",
        code: symbol.ticker,
        period: `${period.span}${period.type === 'day' ? 'd' : period.type[0]}`,
        adjust_type: "",
        start_date: startDate,
        end_date: endDate,
      }))
    }
    ws.onmessage = (event) => {
      const res = JSON.parse(event.data)
      const bars = (res.data || []).map(normalizeToKLineData).sort((a, b) => a.timestamp - b.timestamp)
      resolve(bars)
      ws.close()
    }
    ws.onerror = (err) => {
      reject(err)
      ws.close()
    }
  })
}

// ==================== 标记方向与偏移处理 ====================
function getBaseDirection(market, type) {
  if (market === "stock") {
    if (type === "B" || type === "买") return 1
    if (type === "S" || type === "卖") return -1
    if (type === "T") return -1
  } else if (market === "futures") {
    if (type === "L" || type === "多开" || type === "CS" || type === "空平") return 1
    if (type === "S" || type === "空开" || type === "CL" || type === "多平") return -1
  } else if (market === "predict") {
    if (type === "BULL" || type === "多") return 1
    if (type === "BEAR" || type === "空") return -1
  }
  return 1
}

function prepareMarkersWithOffset(configs) {
  const grouped = new Map()
  configs.forEach(cfg => {
    const ts = cfg.timestamp
    const dir = getBaseDirection(cfg.market || 'stock', cfg.type)
    const key = `${ts}_${dir}`
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key).push(cfg)
  })

  const processed = []
  grouped.forEach((items) => {
    items.forEach((item, index) => {
      processed.push({
        ...item,
        _offsetIndex: index,
        _totalInGroup: items.length,
        _direction: getBaseDirection(item.market || 'stock', item.type)
      })
    })
  })
  return processed
}

// ==================== 注册自定义 Overlay（全局一次） ====================
registerOverlay({
  name: 'simpleAnnotation2',
  needDefaultPointFigure: true,
  lock: true,
  totalStep: 1,
  createPointFigures: function (param) {
    const { overlay, coordinates } = param
    const point = overlay.points[0]
    const market = point.market
    const type = overlay.extendData
    const offsetIndex = point.offsetIndex || 0
    const total = point.totalInGroup || 1
    const direction = point.direction || 2.5

    const centerX = coordinates[0].x
    const baseY = coordinates[0].y

    const offsetStep = 27
    const groupOffset = (offsetIndex - (total - 1) / 2) * offsetStep



    const baseStartDistance = 70;
    const baseEndDistance = 10;
    const extraOffset = 55; // 额外移动的距离
    let startDistance = baseStartDistance + (direction === -1 ? extraOffset : (direction !== -1 ? extraOffset : 0));
    let endDistance = baseEndDistance + (direction === -1 ? extraOffset : (direction !== -1 ? extraOffset : 0));


    const lineEndY = baseY + direction * endDistance
    const lineStartY = baseY + direction * startDistance + groupOffset

    const getColor = (market, type) => {
      if (market === "stock") {
        if (type === "B" || type === "买") return '#ef5350'
        if (type === "S" || type === "卖") return '#26a69a'
        if (type === "T") return '#42a5f5'
      } else if (market === "futures") {
        if (type === "L" || type === "多开") return '#ef5350'
        if (type === "S" || type === "空开") return '#26a69a'
        if (type === "CL" || type === "多平") return '#42a5f5'
        if (type === "CS" || type === "空平") return '#ffa726'
      } else if (market === "predict") {
        if (type === "BULL" || type === "多") return '#ef5350'
        if (type === "BEAR" || type === "空") return '#26a69a'
      }
      return '#888888'
    }

    const color = getColor(market, type)

    return [
      {
        key: 'line',
        type: 'line',
        attrs: {
          coordinates: [
            { x: centerX, y: lineStartY },
            { x: centerX, y: lineEndY }
          ]
        },
        styles: {
          style: 'dashed',
          color: color,
          size: 1.8,
          dashedValue: [3, 3]
        }
      },
      {
        key: 'text',
        type: 'text',
        attrs: {
          x: centerX,
          y: lineStartY - direction * 6,
          text: overlay.extendData || '',
          align: 'center',
          baseline: 'middle'
        },
        styles: {
          color: '#ffffff',
          size: 12,
          weight: 'bold',
          backgroundColor: color,
          paddingLeft: 8,
          paddingRight: 8,
          paddingTop: 4,
          paddingBottom: 4,
          borderRadius: 4,
        }
      }
    ]
  }
})
registerIndicator({
  name: 'RSI',
  shortName: 'RSI',
  series: 'price',
  calcParams: [6, 12, 24],
  precision: 2,
  figures: [
    { key: 'rsi1', title: 'RSI1: ', type: 'line' },
    { key: 'rsi2', title: 'RSI2: ', type: 'line' },
    { key: 'rsi3', title: 'RSI3: ', type: 'line' }
  ],
  calc: (dataList, indicator) => {
    const periods = indicator.calcParams
    const closePrices = dataList.map(item => item.close)
    const total = dataList.length

    // 初始化结果数组，所有位置初始为 null
    const results = Array(total).fill().map(() => ({ rsi1: null, rsi2: null, rsi3: null }))

    periods.forEach((period, idx) => {
      // 计算 RSI，返回值长度 = total - period
      const rsiValues = RSI.calculate({ period, values: closePrices })
      const key = `rsi${idx + 1}`
      // 从 period 索引开始填充
      for (let i = 0; i < rsiValues.length; i++) {
        results[period + i][key] = rsiValues[i]
      }
    })

    return results
  }
})
registerIndicator({
  name: 'RSISpeedWithAcc',
  shortName: 'RSI S&A',
  series: 'price',
  calcParams: [14],         // RSI周期，默认14
  precision: 2,
  figures: [
    { key: 'speed', title: '速度: ', type: 'line' },
    { key: 'acc',   title: '加速度: ', type: 'line' }
  ],
  calc: (dataList, indicator) => {
    const period = indicator.calcParams[0]        // RSI周期
    const closePrices = dataList.map(item => item.close)
    const total = dataList.length

    const results = Array(total).fill().map(() => ({ speed: null, acc: null }))
    if (total === 0) return results

    // ---------- 1. 计算 RSI 序列 ----------
    const rsi = Array(total).fill(null)
    if (total > period) {
      let gains = 0, losses = 0

      // 计算初始平均涨跌幅（前 period 根K线）
      for (let i = 1; i <= period; i++) {
        const change = closePrices[i] - closePrices[i-1]
        if (change >= 0) gains += change
        else losses -= change
      }
      let avgGain = gains / period
      let avgLoss = losses / period
      let rs = avgLoss === 0 ? Infinity : avgGain / avgLoss
      rsi[period] = 100 - 100 / (1 + rs)

      // 递归计算后续 RSI（Wilder 平滑）
      for (let i = period + 1; i < total; i++) {
        const change = closePrices[i] - closePrices[i-1]
        const gain = change > 0 ? change : 0
        const loss = change < 0 ? -change : 0
        avgGain = (avgGain * (period - 1) + gain) / period
        avgLoss = (avgLoss * (period - 1) + loss) / period
        rs = avgLoss === 0 ? Infinity : avgGain / avgLoss
        rsi[i] = 100 - 100 / (1 + rs)
      }
    }

    // ---------- 2. 计算速度（RSI 的一阶差分）----------
    const speed = Array(total).fill(null)
    for (let i = 1; i < total; i++) {
      if (rsi[i] !== null && rsi[i-1] !== null) {
        speed[i] = rsi[i] - rsi[i-1]
      }
    }

    // ---------- 3. 计算加速度（速度的一阶差分）----------
    const acc = Array(total).fill(null)
    for (let i = 2; i < total; i++) {
      if (speed[i] !== null && speed[i-1] !== null) {
        acc[i] = speed[i] - speed[i-1]
      }
    }

    // 填充结果
    for (let i = 0; i < total; i++) {
      results[i].speed = speed[i]
      results[i].acc = acc[i]
    }

    return results
  }
})

// ==================== 对外暴露的标记添加方法 ====================
function addMarkers(chartInstance, configs, market = 'stock') {
  if (!chartInstance) return

  let types = new Set()
  if (market === "stock") {
    types = new Set(["B", "S", "T", "买", "卖"])
  } else if (market === "futures") {
    types = new Set(["L", "S", "CL", "CS", "多开", "空开", "多平", "空平"])
  } else if (market === "predict") {
    types = new Set(["BULL", "BEAR", "多", "空"])
  } else {
    throw new Error("unsupported market")
  }

  const fullConfigs = configs.map(c => ({ ...c, market }))
  const processed = prepareMarkersWithOffset(fullConfigs)

  for (const config of processed) {
    const { timestamp, value, mes, type, _offsetIndex, _totalInGroup, _direction } = config
    if (!types.has(type)) throw new Error(`unsupported type: ${type}`)

    // 存入消息 Map
    if (!mesMap.has(timestamp)) mesMap.set(timestamp, [])
    if (!mesMap.get(timestamp).includes(mes)) mesMap.get(timestamp).push(mes)

    chartInstance.createOverlay({
      name: 'simpleAnnotation2',
      extendData: type,
      points: [{
        timestamp,
        value,
        mes,
        market,
        offsetIndex: _offsetIndex,
        totalInGroup: _totalInGroup,
        direction: _direction
      }]
    })
  }
}

function clearAllMarkers(chartInstance) {
  if (!chartInstance) return
  // 注意：KLineChart 没有直接清除所有 overlay 的 API，需要遍历删除
  // 这里可根据实际 overlay id 存储逻辑进行扩展
  mesMap.clear()
  chartInstance.removeOverlay()
}
function crosshairHandler(event) {
  if (!event) {
    tooltipVisible.value = false
    return
  }
  const { x, y, paneId } = event
  if (paneId !== 'candle_pane') {
    tooltipVisible.value = false
    return
  }

  if (!chart.value) return

  const result = chart.value.convertFromPixel({ x, y })
  if (!result || result.dataIndex == null) {
    tooltipVisible.value = false
    return
  }

  const dataList = chart.value.getDataList()
  const kline = dataList[result.dataIndex]
  if (!kline) {
    tooltipVisible.value = false
    return
  }

  currentKline.value = kline
  currentKline.value.preClose = result.dataIndex > 0 ? dataList[result.dataIndex - 1].close : kline.open
  tooltipPos.value = { x: x + 15, y: y + 15 }

  // 获取该时间戳的交易信号消息
  const ts = kline.timestamp
  const messages = mesMap.get(ts) || []
  tooltipMessages.value = messages

  tooltipVisible.value = true
}
function disableCrosshair() {
  const chart = klineRef.value?.chart
  if (chart && crosshairHandler) {
    chart.unsubscribeAction('onCrosshairChange', crosshairHandler)
  }
}
// ==================== 图表初始化 ====================
const initChart = () => {
  dispose('chart')
  chart.value = null
  currentLatestDate = null

  chart.value = init('chart', { timestampType: 'millisecond' })

  chart.value.setStyles({
    grid: {
      show: true,
      horizontal: { show: true, size: 1, color: '#EDEDED55', style: 'dashed', dashedValue: [2, 2] },
      vertical: { show: true, size: 1, color: '#EDEDED55', style: 'dashed', dashedValue: [2, 2] }
    },
    candle: {
      type: 'candle_solid',
      bar: {
        compareRule: 'current_open',
        upColor: '#ef4444',
        downColor: '#22c55e',
        upBorderColor: '#ef4444',
        downBorderColor: '#22c55e',
        upWickColor: '#ef4444',
        downWickColor: '#22c55e'
      }
    },
    indicator: {
      bars: [{
        style: 'fill',
        borderStyle: 'solid',
        borderSize: 1,
        borderDashedValue: [2, 2],
        upColor: 'rgba(249, 40, 85, .7)',
        downColor: 'rgba(45, 192, 142, .7)',
        noChangeColor: '#888888'
      }],
    }
  })

  const targetSymbol = searchStore.symbol || 'sh000001'
  chart.value.setSymbol({ ticker: targetSymbol })
  chart.value.setPeriod({ span: 1, type: 'day' })
  chart.value.setLocale('zh-CN')

  chart.value.setDataLoader({
    async getBars({ type, timestamp, symbol, period, callback }) {
      try {
        const today = todayStr()
        if (type === 'init') {
          const startDate = searchStore.startDate || addDays(today, -DEFAULT_PAGE_SIZE + 1)
          const endDate = searchStore.endDate || today
          const bars = await fetchHistoryData(symbol, period, startDate, endDate)
          if (bars.length > 0) {
            currentLatestDate = timestampToDateStr(bars[bars.length - 1].timestamp)
          }
          const hasMoreOld = bars.length > 0
          callback(bars, { forward: hasMoreOld, backward: false })
          return
        }

        if (type === 'forward') {
          const leftDate = timestampToDateStr(timestamp)
          if (!leftDate) {
            callback([], { forward: false, backward: false })
            return
          }
          if (leftDate >= searchStore.startDate) {
            callback([], { forward: false, backward: false })
            return
          }
          const endDatePrev = addDays(leftDate, -1)
          if (!endDatePrev) {
            callback([], { forward: false, backward: false })
            return
          }
          const startDatePrev = addDays(endDatePrev, -DEFAULT_PAGE_SIZE + 1)
          const bars = await fetchHistoryData(symbol, period, startDatePrev, endDatePrev)
          const hasMoreOld = bars.length > 0
          callback(bars, { forward: hasMoreOld, backward: false })
          return
        }

        if (type === 'backward') {
          callback([], { forward: true, backward: false })
          return
        }

        callback([], { forward: false, backward: false })
      } catch (err) {
        console.error('[getBars] 错误:', err)
        callback([], { forward: false, backward: false })
      }
    },

    subscribeBar({ symbol, period, callback }) {
      const poll = async () => {
        if (!currentLatestDate) return
        const today = todayStr()
        const nextDate = addDays(currentLatestDate, 1)
        if (nextDate >= searchStore.endDate) return
        if (!nextDate || nextDate > today) return
        try {
          const newBars = await fetchHistoryData(symbol, period, nextDate, today)
          if (newBars.length > 0) {
            newBars.forEach(bar => callback(bar))
            const lastBar = newBars[newBars.length - 1]
            currentLatestDate = timestampToDateStr(lastBar.timestamp)
          }
        } catch (err) {
          console.error('[实时] 错误:', err)
        }
      }
      poll()
      pollTimer = setInterval(poll, 5000)
    },

    unsubscribeBar() {
      if (pollTimer) {
        clearInterval(pollTimer)
        pollTimer = null
      }
    }
  })
  chart.value.subscribeAction('onCrosshairChange', crosshairHandler)
  window.addEventListener('resize', () => chart.value?.resize())
}

const reloadKLineData = () => {
  if (pollTimer) clearInterval(pollTimer)
  initChart()
}


// ==================== 生命周期 ====================
onMounted(() => {
  initChart()
  searchStore.addOnLoadEvent('klineReload', reloadKLineData)
  chartEle.value.addEventListener('mouseleave', () => {
    tooltipVisible.value = false
  })
  
})

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer)
  searchStore.removeOnLoadEvent('klineReload')
  window.removeEventListener('resize', () => chart.value?.resize())
  chartEle.value.removeEventListener('mouseleave', () => {
    tooltipVisible.value = false
  })
  disableCrosshair()
  dispose('chart')
})

// 暴露方法供父组件调用
defineExpose({ addMarkers, clearAllMarkers, chart })
</script>

<style scoped>
.chart {
  width: 100%;
  height: 100%;
}

.unified-tooltip {
  position: fixed;
  background: rgba(20, 22, 28, 0.92);
  backdrop-filter: blur(6px);
  color: #e0e0e0;
  padding: 10px 14px;
  border-radius: 6px;
  font-size: 13px;
  line-height: 1.7;
  pointer-events: none;
  z-index: 9999;
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 8px 20px rgba(0,0,0,0.4);
  min-width: 140px;
}
.tooltip-header {
  font-size: 11px;
  color: #aaa;
  border-bottom: 1px solid rgba(255,255,255,0.1);
  padding-bottom: 6px;
  margin-bottom: 6px;
}
.tooltip-row {
  display: flex;
  justify-content: space-between;
  margin: 3px 0;
}
.label {
  opacity: 0.6;
  margin-right: 12px;
}
.value {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.up { color: #ef4444; }
.down { color: #22c55e; }
.high-low { color: #e0e0e0; }
.volume { color: #9aa0a6; }

.tooltip-divider {
  height: 1px;
  background: rgba(255,255,255,0.1);
  margin: 8px 0;
}
.tooltip-signal {
  font-size: 12px;
  color: #ffd54f;
  line-height: 1.5;
}
</style>