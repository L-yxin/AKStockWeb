<template>
  <div id="chart" class="chart"></div>
  <div ref="follower" class="follower"></div>
  <div
      v-if="currentKline"
      class="kline-tooltip"
      :style="{ left: tooltipPos.x + 'px', top: tooltipPos.y + 'px' }"
    >
      <div>时间：{{ new Date(currentKline.timestamp) }}</div>
      <div>开：{{ currentKline.open }}</div>
      <div>高：{{ currentKline.high }}</div>
      <div>低：{{ currentKline.low }}</div>
      <div>收：{{ currentKline.close }}</div>
      <div>量：{{ currentKline.volume }}</div>
    </div>
</template>

<script setup>
import { init, dispose, registerOverlay,registerIndicator } from 'klinecharts'
import { RSI } from 'technicalindicators'
import { ws_kline_url } from '@/api'
const currentKline = ref(null)      // 当前K线数据
const tooltipPos = ref({ x: 0, y: 0 })
// ==================== Pinia Store ====================
const searchStore = useSearchParametersStore()

// ==================== 响应式状态 ====================
const chart = ref(null)
const follower = ref(null)
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
  },
  onMouseEnter: (param) => {
    const ts = param.overlay.points[0].timestamp
    const messages = mesMap.get(ts) || []
    if (follower.value) {
      follower.value.innerHTML = messages.map(m => `• ${m}`).join('<br>')
      follower.value.style.display = 'block'
    }
  },
  onMouseLeave: () => {
    if (follower.value) follower.value.style.display = 'none'
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
  if (follower.value) follower.value.style.display = 'none'
}
function crosshairHandler (event) {
  const { x, y, paneId } = event
  if (paneId !== 'candle_pane') return

  const result = chart.value.convertFromPixel({ x, y })
  if (!result || result.dataIndex == null) return

  const dataList = chart.value.getDataList()
  const kline = dataList[result.dataIndex]
  if (!kline) return

  currentKline.value = kline
  tooltipPos.value = { x: x + 15, y: y + 15 }
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
        if (nextDate>= searchStore.endDate) return
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

// ==================== 鼠标移动更新悬浮提示位置 ====================
const onGlobalMouseMove = (e) => {
  if (!follower.value) return
  follower.value.style.left = (e.clientX + 20) + 'px'
  follower.value.style.top = (e.clientY - 30) + 'px'
}

// ==================== 生命周期 ====================
onMounted(() => {
  initChart()
  searchStore.addOnLoadEvent('klineReload', reloadKLineData)
  document.addEventListener('mousemove', onGlobalMouseMove)
})

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer)
  searchStore.removeOnLoadEvent('klineReload')
  window.removeEventListener('resize', () => chart.value?.resize())
  document.removeEventListener('mousemove', onGlobalMouseMove)
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

.follower {
  position: fixed;
  background: rgba(0, 0, 0, 0.85);
  color: #fff;
  padding: 10px 16px;
  box-sizing: border-box;
  border-radius: 8px;
  font-size: 14px;
  pointer-events: none;
  z-index: 9999;
  transform: translate(20px, -50%);
  white-space: pre-line;
  line-height: 1.6;
  border-left: 4px solid #00b828;
  display: none;
}


.kline-tooltip {
  position: fixed;          /* 使用 fixed 避免被图表遮挡 */
  background: rgba(0,0,0,0.75);
  color: #fff;
  padding: 6px 10px;
  border-radius: 4px;
  font-size: 12px;
  line-height: 1.6;
  pointer-events: none;    /* 鼠标可穿透浮窗 */
  z-index: 9999;
}
</style>