<template>
  <div class="chart-wrap">
    <div id="chart" class="chart" ref="chartEle"></div>

    <!-- 模拟交易：未来K线遮挡层（绝对定位在 K 线 canvas 之上，pointer-events 穿透） -->
    <div class="sim-future-mask" :style="maskStyle"></div>
  </div>

  <div ref="unifiedTooltip" class="unified-tooltip" v-show="tooltipVisible"
    :style="{ left: tooltipPos.x + 'px', top: tooltipPos.y + 'px' }">
    <!-- K线部分（有值才显示） -->
    <template v-if="currentKline">
      <div class="tooltip-header">{{ formatDateTime(currentKline.timestamp) }}</div>
      <div class="tooltip-row">
        <span class="label">开</span>
        <span class="value" :class="klineChangeClass(currentKline.open, currentKline.preClose)">{{ formatPrice(currentKline.open) }}</span>
      </div>
      <div class="tooltip-row">
        <span class="label">高</span>
        <span class="value high-low">{{ formatPrice(currentKline.high) }}</span>
      </div>
      <div class="tooltip-row">
        <span class="label">低</span>
        <span class="value high-low">{{ formatPrice(currentKline.low) }}</span>
      </div>
      <div class="tooltip-row">
        <span class="label">收</span>
        <span class="value" :class="klineChangeClass(currentKline.close, currentKline.preClose)">{{ formatPrice(currentKline.close) }}</span>
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
import { init, dispose, utils } from 'klinecharts'

// 副作用模块：注册自定义指标与覆盖图（引入一次即可）
import '@/chart/indicators'
import '@/chart/overlays'

// 标记逻辑与消息表
import { mesMap, addMarkers, clearAllMarkers } from '@/chart/markers'
import { requestLongShortSignals } from '@/chart/longShortSignals'
// 云指标生命周期
import { setCloudMetricsChartGetter, destroyCloudMetrics } from '@/chart/indicators/cloudMetrics'
// Python 指标（Indicator 目录，后端计算）重放
import { applyPyIndicator } from '@/chart/indicators/pyInd'

import { ws_kline_url } from '@/api'

// ==================== Pinia Store ====================
import { useSettingStore } from '@/stores/setting'

const searchStore = useSearchParametersStore()
const settingStore = useSettingStore()
const simStore = useSimulationStore()

// ==================== 响应式状态 ====================
const chart = ref(null)
let pollTimer = null
let currentLatestDate = null

// ==================== 模拟交易：未来K线遮挡（DOM 层） + 拖拽接管 ====================
// 遮挡用绝对定位 div（覆盖在 K 线 canvas 之上），从"当前柱右边缘"延伸到容器右端；
// 位置由 chart.convertToPixel(timestamp) 计算，随滚动/缩放/跳柱实时更新。
// 全程本地数据、无网络请求；pointer-events:none 不干扰 K 线图交互。
const maskLeft = ref(0)
const maskStyle = computed(() => {
  if (!simStore.active) return { display: 'none' }
  const w = maskLeft.value >= 0 ? `calc(100% - ${maskLeft.value}px)` : '100%'
  return { left: `${Math.max(maskLeft.value, 0)}px`, width: w }
})
// 在图表全量数据中定位某根模拟柱的数据索引（chart 数据可能多于模拟 bars）
const barIndexOf = (c, ts) => {
  const data = c.getDataList()
  for (let i = 0; i < data.length; i++) {
    if (data[i].timestamp === ts) return i
  }
  return -1
}
const updateFutureMaskLeft = () => {
  const c = chart.value
  if (!c || !simStore.active) return
  const bars = simStore.bars
  const idx = simStore.cursorIndex
  if (!bars.length || idx < 0 || idx >= bars.length) { maskLeft.value = 0; return }
  try {
    // convertToPixel 的 x 是数据坐标（absolute 仅作用于 y），无法直接用于容器定位；
    // 改用公开 API 自算：pane 左偏移 + (barIdx - realFrom) × barSpace + 半柱宽
    const barIdx = barIndexOf(c, bars[idx].timestamp)
    if (barIdx < 0) { maskLeft.value = 0; return }
    const vr = c.getVisibleRange()
    const bs = c.getBarSpace()
    const paneDom = c.getDom('candle_pane')
    const paneLeft = paneDom ? (paneDom.offsetLeft || 0) : 0
    maskLeft.value = paneLeft + (barIdx - Math.floor(vr.realFrom)) * bs.bar + bs.halfGapBar
  } catch (e) {
    maskLeft.value = 0
  }
}

// 让视区跟随当前模拟柱（scrollToDataIndex 用"数据索引"；模拟 cursor 是 bars 索引，需 timestamp 对齐）
const scrollToCursorBar = () => {
  const c = chart.value
  if (!c || !simStore.active) return
  const bars = simStore.bars
  const idx = simStore.cursorIndex
  if (!bars.length || idx < 0 || idx >= bars.length) return
  const barIdx = barIndexOf(c, bars[idx].timestamp)
  if (barIdx >= 0) {
    try { c.scrollToDataIndex(barIdx, 0) } catch (e) { /* 忽略 */ }
  }
}
const syncSimView = () => {
  scrollToCursorBar()
  updateFutureMaskLeft()
}

// K线对象变更（切换标的/周期/重新加载）后：数据到达时校验模拟上下文，并重建遮挡
const periodKeyOf = (p) => {
  if (!p) return '1d'
  if (p.type === 'minute') return `${p.span}m`
  if (p.type === 'hour') return `${p.span}h`
  if (p.type === 'day') return `${p.span}d`
  if (p.type === 'week') return `${p.span}w`
  if (p.type === 'month') return `${p.span}M`
  return '1d'
}
const onSimulationDataArrived = () => {
  if (!simStore.active) return
  const c = chart.value
  if (!c) return
  try {
    const p = c.getPeriod()
    const currentKey = `${searchStore.symbol}:${periodKeyOf(p)}`
    if (simStore.chartKey && simStore.chartKey !== currentKey) {
      // 标的或周期已变化 → 模拟区间失效，自动结束模拟
      simStore.finish()
      return
    }
  } catch (e) { /* 忽略 */ }
  setTimeout(syncSimView, 0)
}

// K线图滚动/缩放：仅同步遮挡位置（不接管当前柱）
const simRangeHandler = () => {
  if (simStore.active) updateFutureMaskLeft()
}

// 真实用户拖拽接管：pointerdown→pointerup（位移超过阈值才算拖动）→ 当前柱 = 视区最右可见柱
let simDragStart = null
const onChartPointerDown = (e) => {
  simDragStart = { x: e.clientX, y: e.clientY }
}
const onChartPointerUp = (e) => {
  if (!simDragStart) return
  const dx = e.clientX - simDragStart.x
  const dy = e.clientY - simDragStart.y
  simDragStart = null
  if (!simStore.active || simStore.paused) return
  if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return // 点击（非拖动）不接管
  const c = chart.value
  if (!c) return
  try {
    const vr = c.getVisibleRange()
    if (vr && Number.isFinite(vr.realTo)) {
      simStore.setCursorFromChart(Math.floor(vr.realTo))
    }
  } catch (e) { /* 忽略 */ }
}

// 模拟启停 / 当前柱变化 / 模拟数据填充 → 同步遮挡并让视区跟随
watch(() => simStore.active, (act) => {
  // 面板固定显示时 K 线区宽度已变化 → 强制图表重排（画布与容器对齐）
  const c = chart.value
  if (c) { try { c.resize() } catch (e) { /* 忽略 */ } }
  if (act) {
    updateFutureMaskLeft()
  } else {
    maskLeft.value = 0
    // 结束模拟：清除 K 线上的买卖交易标记
    if (c) { try { clearAllMarkers(c) } catch (e) { /* 忽略 */ } }
  }
})
watch(() => simStore.cursorIndex, () => {
  if (simStore.active) syncSimView()
})
watch(() => simStore.bars.length, () => {
  // bars 异步填充可能晚于 cursor=0，填充后再同步一次
  if (simStore.active) syncSimView()
})

// 初始/翻页每次请求的 bar 数（K线分页模型：init 与 forward 都按此数量向后端取数）
const DEFAULT_PAGE_SIZE = 300
const WS_URL = ws_kline_url

// ==================== 工具函数 ====================
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
const currentKline = ref(null)

// ==================== 时间与价格工具 ====================
// 价格显示精度：默认 2 位，设置页可调（跟随 settingStore.pricePrecision）
function formatPrice(v) {
  if (v == null || isNaN(v)) return '--'
  return Number(v).toFixed(settingStore.pricePrecision)
}
// 后端序列化统一约定：通达信本地时间（无时区）→ 先按 Asia/Shanghai 解释再转 epoch（毫秒）。
// 因此前端显示 Asia/Shanghai 时刻 = epoch + 8h 后的 UTC 字段；不依赖浏览器本地时区。
const SHIFT_8H = 8 * 3600 * 1000

function formatDateTime(timestamp) {
  if (!timestamp) return ''
  const date = new Date(timestamp + SHIFT_8H)
  const pad = (n) => n.toString().padStart(2, '0')
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`
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
  if (!timestampMs || isNaN(timestampMs) || timestampMs <= 0) return null;
  const date = new Date(timestampMs + SHIFT_8H);
  if (isNaN(date.getTime())) return null;

  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const seconds = String(date.getUTCSeconds()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function addDays(dateStr, days = 0, hours = 0, minute = 0, second = 0) {
  if (!dateStr) return null;

  // 正则匹配：日期部分（必须），时间部分（可选，格式 HH:mm:ss）
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{2}):(\d{2}):(\d{2}))?$/);
  if (!match) return null;

  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10) - 1;
  const day = parseInt(match[3], 10);

  // 如果输入包含时间，则使用提取的值；否则使用传入的参数（默认0）
  const hh = match[4] !== undefined ? parseInt(match[4], 10) : hours;
  const mm = match[5] !== undefined ? parseInt(match[5], 10) : minute;
  const ss = match[6] !== undefined ? parseInt(match[6], 10) : second;

  // 构造 Date 对象（本地时间）
  const date = new Date(year, month, day, hh, mm, ss);
  date.setDate(date.getDate() + days);

  // 格式化为 "YYYY-MM-DD HH:mm:ss"
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');

  return `${y}-${mo}-${d} ${h}:${mi}:${s}`;
}

function todayStr() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

// ==================== 周期配置与切换 ====================
// 周期类型取值以 klinecharts 官方类型为准：minute / hour / day / week / month
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

const periodKey = (p) => `${p.span}${p.type}`
const isActivePeriod = (p) => periodKey(p) === periodKey(searchStore.period)

// klinecharts Period → 后端 period 参数
// 关键：月线必须传大写 1M（后端 normalize 为 1mon）；小写 1m 会被识别为 1 分钟线
function periodToBackend(p) {
  if (!p) return '1d'
  const { type, span } = p
  if (type === 'minute') return `${span}m`
  if (type === 'hour') return `${span}h`
  if (type === 'day') return '1d'
  if (type === 'week') return '1w'
  if (type === 'month') return '1M'
  return '1d'
}

function switchPeriod(p) {
  if (isActivePeriod(p)) return
  searchStore.setPeriod(p)
  currentLatestDate = null
  // 云指标为日级数据：切走日线时清空缓存（避免分钟/小时K上错位匹配），
  // 切回日线后 calc 会自动重新拉取
  destroyCloudMetrics()
  if (chart.value) {
    chart.value.setPeriod({ type: p.type, span: p.span })
  }
}

// ==================== 历史数据请求 ====================
// 模块级请求序号：快速切换股票/周期时，旧请求返回直接丢弃，防止过期数据覆盖新图
let klineReqSeq = 0
const KLINE_REQ_TIMEOUT = 15000 // 单次 K 线请求超时（ms）；超时/连接异常必 settle，避免 await 永久挂起
function fetchHistoryData(symbol, period, startDate, endDate, limit) {
  const reqId = klineReqSeq // 捕获当前图表代次；仅 initChart 重建时递增
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL)
    let settled = false
    // 超时保护：后端卡死/连接无响应时 15s 内必定结束本次请求
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      try { ws.close() } catch (e) { /* ignore */ }
      reject(new Error('K线请求超时'))
    }, KLINE_REQ_TIMEOUT)
    const finish = (fn, arg) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try { ws.close() } catch (e) { /* ignore */ }
      fn(arg)
    }
    const onMessage = (event) => {
      let res
      try {
        res = JSON.parse(event.data)
      } catch (e) {
        console.error('[kline] 数据解析失败:', e)
        finish(reject, e)
        return
      }
      // 过期请求：期间已切换标的/周期，结果作废（不 resolve、不污染新图）
      if (reqId !== klineReqSeq) return
      const bars = (res.data || []).map(normalizeToKLineData).sort((a, b) => a.timestamp - b.timestamp)
      finish(resolve, bars)
    }
    ws.onopen = () => {
      const payload = {
        action: 'history',
        code: symbol.ticker,
        period: periodToBackend(period),
        adjust_type: searchStore.adjust_type,
        start_date: startDate,
        end_date: endDate,
        // 数据来源：tq（默认直拉）| cache（走后端内存缓存服务）
        source: searchStore.dataSource,
      }
      if (limit) payload.limit = limit
      ws.send(JSON.stringify(payload))
    }
    ws.onmessage = onMessage
    ws.onerror = (err) => finish(reject, err)
    // 服务端关闭/连接中断但未收到数据 → 必须结束 Promise，防止 getBars 永久挂起
    ws.onclose = () => finish(reject, new Error('K线连接关闭'))
  })
}

// 每周期每交易日的 bar 数（A股 4 小时 = 240 分钟，用于把「按根数分页」换算成日期窗口）
function barsPerDay(type, span) {
  if (type === 'minute') return 240 / span
  if (type === 'hour') return 4 / span
  if (type === 'day') return 1
  if (type === 'week') return 1 / 5
  if (type === 'month') return 1 / 21
  return 1
}

// 容纳 limit 根 bar 所需自然日窗口（含冗余，后端再按 limit 截断）
function windowDaysFor(period, limit) {
  const bpd = barsPerDay(period.type, period.span)
  return Math.ceil(limit / bpd) + 3
}

// ==================== 十字光标 / 自定义 Tooltip ====================
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

  // 浅拷贝，避免直接修改图表内部数据对象
  currentKline.value = { ...kline }
  currentKline.value.preClose = result.dataIndex > 0 ? dataList[result.dataIndex - 1].close : kline.open
  tooltipPos.value = { x: x + 15, y: y + 15 }

  // 获取该时间戳的交易信号消息
  const ts = kline.timestamp
  tooltipMessages.value = mesMap.get(ts) || []

  tooltipVisible.value = true
}

function disableCrosshair() {
  if (chart.value) {
    chart.value.unsubscribeAction('onCrosshairChange', crosshairHandler)
  }
}

// 图表深色主题样式（A股红涨绿跌配色）
function getChartStyles() {
  return {
    grid: {
      show: true,
      horizontal: { show: true, size: 1, color: 'rgba(148, 163, 184, 0.10)', style: 'dashed', dashedValue: [2, 2] },
      vertical: { show: true, size: 1, color: 'rgba(148, 163, 184, 0.08)', style: 'dashed', dashedValue: [2, 2] }
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
      },
      priceMark: {
        show: true,
        high: { show: true, color: '#9aa4b2', textMargin: 5, textSize: 10 },
        low: { show: true, color: '#9aa4b2', textMargin: 5, textSize: 10 },
        last: {
          show: true,
          compareRule: 'current_open',
          upColor: '#ef4444',
          downColor: '#22c55e',
          noChangeColor: '#888888',
          line: { show: true, style: 'dashed', dashedValue: [4, 4], size: 1 },
          text: {
            show: true, style: 'fill', size: 11,
            paddingLeft: 4, paddingTop: 4, paddingRight: 4, paddingBottom: 4,
            borderStyle: 'solid', borderSize: 0, borderColor: 'transparent',
            color: '#FFFFFF', family: 'Helvetica Neue', weight: 'normal', borderRadius: 2
          }
        }
      },
      tooltip: {
        showRule: 'none',      // 内置 K 线提示关闭，使用自定义增强 Tooltip
        showType: 'standard'
      }
    },
    indicator: {
      bars: [{
        style: 'fill',
        borderStyle: 'solid',
        borderSize: 1,
        borderDashedValue: [2, 2],
        upColor: 'rgba(239, 68, 68, .75)',
        downColor: 'rgba(34, 197, 94, .75)',
        noChangeColor: '#6b7280'
      }],
      lines: [
        { style: 'solid', smooth: false, size: 1, dashedValue: [2, 2], color: '#f59e0b' },
        { style: 'solid', smooth: false, size: 1, dashedValue: [2, 2], color: '#3b82f6' },
        { style: 'solid', smooth: false, size: 1, dashedValue: [2, 2], color: '#a855f7' },
        { style: 'solid', smooth: false, size: 1, dashedValue: [2, 2], color: '#06b6d4' },
        { style: 'solid', smooth: false, size: 1, dashedValue: [2, 2], color: '#f472b6' }
      ],
      lastValueMark: {
        show: false,
        text: { show: false, style: 'fill', color: '#FFFFFF', size: 12 }
      },
      tooltip: {
        showRule: 'always',
        showType: 'standard',
        title: {
          show: true, showName: true, showParams: true,
          size: 12, family: 'Helvetica Neue', weight: 'normal',
          color: '#cbd5e1', marginLeft: 8, marginTop: 4, marginRight: 8, marginBottom: 4
        },
        legend: {
          size: 12, family: 'Helvetica Neue', weight: 'normal',
          color: '#94a3b8', marginLeft: 8, marginTop: 4, marginRight: 8, marginBottom: 4,
          defaultValue: 'n/a'
        }
      }
    },
    xAxis: {
      show: true,
      size: 'auto',
      axisLine: { show: true, color: '#2a3140', size: 1 },
      tickText: { show: true, color: '#8b93a7', family: 'Helvetica Neue', weight: 'normal', size: 11, marginStart: 4, marginEnd: 4 },
      tickLine: { show: true, size: 1, length: 3, color: '#2a3140' }
    },
    yAxis: {
      show: true,
      size: 'auto',
      axisLine: { show: true, color: '#2a3140', size: 1 },
      tickText: { show: true, color: '#8b93a7', family: 'Helvetica Neue', weight: 'normal', size: 11, marginStart: 4, marginEnd: 4 },
      tickLine: { show: true, size: 1, length: 3, color: '#2a3140' }
    },
    separator: {
      size: 1,
      color: '#232a36',
      fill: true,
      activeBackgroundColor: 'rgba(59, 130, 246, .12)'
    },
    crosshair: {
      show: true,
      horizontal: {
        show: true,
        line: { show: true, style: 'dashed', dashedValue: [4, 2], size: 1, color: 'rgba(148, 163, 184, 0.45)' },
        text: {
          show: true, style: 'fill', color: '#e2e8f0', size: 11,
          borderStyle: 'solid', borderDashedValue: [2, 2], borderSize: 1,
          borderColor: '#334155', borderRadius: 2,
          paddingLeft: 4, paddingRight: 4, paddingTop: 4, paddingBottom: 4,
          backgroundColor: '#334155'
        }
      },
      vertical: {
        show: true,
        line: { show: true, style: 'dashed', dashedValue: [4, 2], size: 1, color: 'rgba(148, 163, 184, 0.45)' },
        text: {
          show: true, style: 'fill', color: '#e2e8f0', size: 11,
          borderStyle: 'solid', borderDashedValue: [2, 2], borderSize: 1,
          borderColor: '#334155', borderRadius: 2,
          paddingLeft: 4, paddingRight: 4, paddingTop: 4, paddingBottom: 4,
          backgroundColor: '#334155'
        }
      }
    },
    overlay: {
      point: {
        color: '#3b82f6', borderColor: 'rgba(59, 130, 246, 0.35)', borderSize: 1, radius: 5,
        activeColor: '#3b82f6', activeBorderColor: 'rgba(59, 130, 246, 0.35)', activeBorderSize: 3, activeRadius: 5
      },
      line: { style: 'solid', smooth: false, color: '#3b82f6', size: 1, dashedValue: [2, 2] },
      rect: { style: 'fill', color: 'rgba(59, 130, 246, 0.25)', borderColor: '#3b82f6', borderSize: 1, borderRadius: 0, borderStyle: 'solid', borderDashedValue: [2, 2] },
      polygon: { style: 'fill', color: '#3b82f6', borderColor: '#3b82f6', borderSize: 1, borderStyle: 'solid', borderDashedValue: [2, 2] },
      circle: { style: 'fill', color: 'rgba(59, 130, 246, 0.25)', borderColor: '#3b82f6', borderSize: 1, borderStyle: 'solid', borderDashedValue: [2, 2] },
      arc: { style: 'solid', color: '#3b82f6', size: 1, dashedValue: [2, 2] },
      text: {
        style: 'fill', color: '#FFFFFF', size: 12, family: 'Helvetica Neue', weight: 'normal',
        borderStyle: 'solid', borderDashedValue: [2, 2], borderSize: 0, borderRadius: 2, borderColor: '#3b82f6',
        paddingLeft: 0, paddingRight: 0, paddingTop: 0, paddingBottom: 0, backgroundColor: '#3b82f6'
      }
    }
  }
}

// ==================== 图表初始化 ====================
const initChart = () => {
  dispose('chart')
  chart.value = null
  currentLatestDate = null
  // 图表代次 +1：使在途的旧标的/周期请求结果全部作废（见 fetchHistoryData reqId）
  klineReqSeq++

  // v10 时间戳统一为毫秒，不再需要 timestampType；locale/timezone 走 init 选项
  chart.value = init('chart', {
    locale: 'zh-CN',
    timezone: 'Asia/Shanghai',
    // 价格显示精度（价格轴刻度 / 内置 crosshair 文本等），默认 2 位，设置页可调
    precision: settingStore.pricePrecision
  })

  chart.value.setStyles(getChartStyles())

  // 图表上方（crosshair）时间精确到秒：klinecharts v10 的模板由周期决定，
  // 分钟级模板为 'YYYY-MM-DD HH:mm'（无秒），通过官方 setFormatter 在渲染
  // crosshair 时把模板补齐到秒；其余位置（xAxis/tooltip）保持原模板。
  const crosshairSecondsTemplate = (template) => {
    if (/:mm$/.test(template)) return `${template}:ss`
    if (template.indexOf('HH') === -1) return `${template} 00:00:00`
    return template
  }
  chart.value.setFormatter({
    formatDate({ dateTimeFormat, timestamp, template, type }) {
      if (type === 'crosshair') {
        template = crosshairSecondsTemplate(template)
      }
      return utils.formatDate(dateTimeFormat, timestamp, template)
    }
  })

  const targetSymbol = searchStore.symbol || 'sh000001'
  chart.value.setSymbol({ ticker: targetSymbol })
  // 周期以 store 为准（用户切换后由 store 记忆，重新加载不重置回日线）
  chart.value.setPeriod({ type: searchStore.period.type, span: searchStore.period.span })

  chart.value.setDataLoader({
    async getBars({ type, timestamp, symbol, period, callback }) {
      try {
        const today = todayStr()
        if (type === 'init') {
          // 分页模型：只取最近 DEFAULT_PAGE_SIZE 根（按周期换算日期窗口），
          // 不一次性请求用户设定的整个日期区间，否则分钟周期会一次性灌入上万根，
          // 且数据源边界早于用户 startDate 时永远无法正确翻页
          const endDate = searchStore.endDate || today
          const winStart = addDays(endDate, -windowDaysFor(period, DEFAULT_PAGE_SIZE))
          const startDate = (searchStore.startDate && winStart < searchStore.startDate)
            ? searchStore.startDate
            : winStart
          const bars = await fetchHistoryData(symbol, period, startDate, endDate, DEFAULT_PAGE_SIZE)
          if (bars.length > 0) {
            currentLatestDate = timestampToDateStr(bars[bars.length - 1].timestamp)
          }
          // 已触达用户设定起点 → 不再提供更旧数据
          const reachedUserStart = bars.length > 0
            && timestampToDateStr(bars[0].timestamp) <= searchStore.startDate
          callback(bars, { forward: bars.length > 0 && !reachedUserStart, backward: false })
          onSimulationDataArrived()
          searchStore.notifyKlineLoaded()
          return
        }

        if (type === 'forward') {
          const leftDate = timestampToDateStr(timestamp)
          if (!leftDate) {
            callback([], { forward: false, backward: false })
            return
          }
          // 已到达用户设定起点（或更早）→ 停止加载旧数据
          
          
          const endDatePrev = addDays(leftDate, -1)
          if (!endDatePrev) {
            callback([], { forward: false, backward: false })
            return
          }
          const startDatePrev0 = addDays(endDatePrev, -windowDaysFor(period, DEFAULT_PAGE_SIZE)-10)

          if (searchStore.startDate && leftDate <= searchStore.startDate) {
            callback([], { forward: false, backward: false })
            return
          }
          let startDatePrev = startDatePrev0
          if (startDatePrev && searchStore.startDate && startDatePrev < searchStore.startDate) {
            startDatePrev = searchStore.startDate
          }


          const bars = await fetchHistoryData(symbol, period, startDatePrev, endDatePrev, DEFAULT_PAGE_SIZE)
          // 返回为空 = 数据源边界（无更旧数据）；触达用户起点后也不再翻页
          const reachedUserStart = bars.length > 0
            && timestampToDateStr(bars[0].timestamp) <= searchStore.startDate
          callback(bars, { forward: bars.length > 0 && !reachedUserStart, backward: false })
          onSimulationDataArrived()
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
  // 模拟交易拖拽接管：拖动/缩放 K 线图 → 当前模拟柱跟随
  chart.value.subscribeAction('onVisibleRangeChange', simRangeHandler)

  // 重放已启用指标：K线对象重建（切换标的/重新加载）后恢复用户勾选的指标，
  // 修复"显示已启用的指标未在K线对象变更后重新启用"
  searchStore.enabledIndicators.forEach(({ name, calcParams, onMainChart }) => {
    try {
      const paneId = onMainChart ? 'candle_pane' : `${name}_pane`
      const pane = chart.value.createIndicator({ name, calcParams }, onMainChart, { id: paneId })
      if (!pane) console.warn(`重建指标失败(同名已存在?): ${name}`)
    } catch (e) {
      console.error(`重建指标失败: ${name}`, e)
    }
  })

  // 云指标数据到达后强制刷新
  setCloudMetricsChartGetter(() => chart.value)

  // Python 指标重放：K线对象重建后恢复用户已应用的 Python 指标
  // （数据由后端计算，异步拉取 JS 后注册，失败不影响图表主体）
    // Python 指标重放：K线对象重建后恢复用户已应用的 Python 指标
  // （K 线技术指标重放是同步的；Python 指标重放是异步的，需等全部完成后再通知面板，
  //   否则面板会读到"指标还没建完"的状态，导致 calcParams 缺项）
  const pyIndPromises = searchStore.pythonIndicators.map((it) => {
    return applyPyIndicator(chart.value, {
      ...it,
      code: searchStore.symbol,
      period: periodToBackend(searchStore.period),
      adjust: searchStore.adjust_type,
    })
      .then(id => { if (!id) console.warn(`Python指标重放失败(同名已存在?): ${it.name}`); return id })
      .catch(e => { console.error(`Python指标 ${it.name} 重放失败:`, e); return null })
  })

  if (pyIndPromises.length) {
    Promise.allSettled(pyIndPromises).then(() => searchStore.bumpIndicatorsVersion())
  } else {
    // 无 pyInd → K 线技术指标同步重放已就绪，立即通知
    searchStore.bumpIndicatorsVersion()
  }

  // 模拟交易进行中：K线对象重建（切换标的/重新加载）后重放交易记录标记
  const simStore = useSimulationStore()
  if (simStore.active) {
    const simConfigs = simStore.getMarkerConfigs()
    if (simConfigs.length) {
      try {
        addMarkers(chart.value, simConfigs, 'futures', 'sim')
      } catch (e) {
        console.warn('重放模拟交易标记失败:', e)
      }
    }
  }
}

// 窗口缩放监听（具名函数，便于卸载时移除）
function handleResize() {
  chart.value?.resize()
}

const reloadKLineData = () => {
  if (pollTimer) clearInterval(pollTimer)
  initChart()
}

// 价格小数位数设置变更 → 重建图表（precision 为 init 选项，重建后价格轴/tooltip 即时生效）
watch(() => settingStore.pricePrecision, () => {
  reloadKLineData()
})

// ==================== 板块滚轮切换股票 ====================
// 图表区：Ctrl/Shift/Alt + 滚轮 切换上一只/下一只（不干扰 K 线缩放）
// 板块面板列表内：普通滚轮直接切换（见 SectorPanel）
const sectorStore = useSectorStore()
const switchSymbolBySector = (code) => {
  if (!code || searchStore.symbol === code) return
  searchStore.symbol = code
  searchStore.onLoad()
}
// 滚轮切换消抖：一次滚动会连发多个 wheel 事件，0.5s 内只切换一次（取最后一次方向）
let wheelSwitchTimer = null
let wheelSwitchDir = 0
function onChartWheel(e) {
  if (!sectorStore.wheelEnabled) return
  if (!(e.ctrlKey || e.metaKey || e.shiftKey || e.altKey)) return
  e.preventDefault()
  wheelSwitchDir = e.deltaY > 0 ? 1 : -1
  if (wheelSwitchTimer) clearTimeout(wheelSwitchTimer)
  wheelSwitchTimer = setTimeout(() => {
    const item = sectorStore.step(wheelSwitchDir)
    if (item) switchSymbolBySector(item.code)
  }, 500)
}

// ==================== 生命周期 ====================
// 股票/周期/日期切换后：已启用的多空指标自动重算（图表由 klineReload 先重建）
// selfRef 以 getter 引用当前 chart，兼容图表重建后实例变化
const selfRef = {
  get chart() { return chart.value },
  addMarkers: (c, cfg, m) => wrappedAddMarkers(c, cfg, m),
  clearAllMarkers: (c) => wrappedClearMarkers(c),
}

const refreshEnabledLongShort = async () => {
  const cfg = searchStore.enabledLongShortIndicators
  if (!cfg?.configs?.length) return
  try {
    await requestLongShortSignals(selfRef, { configs: cfg.configs, period: cfg.period })
  } catch (e) {
    console.warn('[多空指标] 切换后自动重算失败:', e)
  }
}

onMounted(() => {
  initChart()
  searchStore.addOnLoadEvent('klineReload', reloadKLineData)
  searchStore.addOnLoadEvent('longShortAutoRefresh', refreshEnabledLongShort)
  chartEle.value.addEventListener('mouseleave', hideTooltip)
  // 模拟交易拖拽接管（真实用户拖拽：pointerdown→up 判定）
  chartEle.value.addEventListener('pointerdown', onChartPointerDown)
  chartEle.value.addEventListener('pointerup', onChartPointerUp)
  chartEle.value.addEventListener('wheel', onChartWheel, { passive: false })
  window.addEventListener('resize', handleResize)
})

function hideTooltip() {
  tooltipVisible.value = false
}

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer)
  if (wheelSwitchTimer) clearTimeout(wheelSwitchTimer)
  searchStore.removeOnLoadEvent('klineReload')
  searchStore.removeOnLoadEvent('longShortAutoRefresh')
  window.removeEventListener('resize', handleResize)
  chartEle.value?.removeEventListener('mouseleave', hideTooltip)
  chartEle.value?.removeEventListener('pointerdown', onChartPointerDown)
  chartEle.value?.removeEventListener('pointerup', onChartPointerUp)
  chartEle.value?.removeEventListener('wheel', onChartWheel)
  disableCrosshair()
  destroyCloudMetrics()
  dispose('chart')
})

// 暴露方法供父组件/抽屉面板调用
// addMarkers / clearAllMarkers 包装后同时记录明细，供“导入图表信号”使用
const markerRecords = ref([])

const wrappedAddMarkers = (chartInstance, configs, market = 'stock', group) => {
  addMarkers(chartInstance, configs, market, group)
  ;(configs || []).forEach(c => {
    markerRecords.value.push({ ...c, market, group })
  })
}

const wrappedClearMarkers = (chartInstance, group) => {
  clearAllMarkers(chartInstance, group)
  if (group == null) markerRecords.value = []
  else markerRecords.value = markerRecords.value.filter(r => r.group !== group)
}

const getMarkerRecords = () => markerRecords.value

defineExpose({ addMarkers: wrappedAddMarkers, clearAllMarkers: wrappedClearMarkers, getMarkers: getMarkerRecords, chart })
</script>

<style scoped>
.chart-wrap {
  position: relative;
  width: 100%;
  height: 100%;
}

.chart {
  width: 100%;
  height: 100%;
}

/* 模拟交易未来K线遮挡层：覆盖在 K 线 canvas 之上，从当前柱右边缘延伸到右端 */
.sim-future-mask {
  position: absolute;
  top: 0;
  bottom: 0;
  background: rgba(8, 12, 24, 0.96);
  z-index: 9;
  pointer-events: none;
  transition: left 0.08s linear, width 0.08s linear;
}

/* 周期切换工具条（悬浮于图表顶部中央，深色风格与整体 UI 一致） */
.period-toolbar {
  position: absolute;
  top: 6px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 3px;
  background: rgba(15, 20, 30, 0.85);
  backdrop-filter: blur(6px);
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 8px;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
}
.period-btn {
  border: none;
  background: transparent;
  color: #94a3b8;
  font-size: 12px;
  font-family: inherit;
  padding: 4px 10px;
  border-radius: 5px;
  cursor: pointer;
  transition: all 0.15s;
  user-select: none;
}
.period-btn:hover {
  color: #fff;
  background: rgba(59, 130, 246, 0.15);
}
.period-btn:active {
  transform: scale(0.95);
}
.period-btn.active {
  color: #fff;
  background: rgba(59, 130, 246, 0.30);
  font-weight: 600;
}

.unified-tooltip {
  position: fixed;
  background: rgba(15, 20, 30, 0.94);
  backdrop-filter: blur(6px);
  color: #e2e8f0;
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 13px;
  line-height: 1.7;
  pointer-events: none;
  z-index: 9999;
  border: 1px solid rgba(148, 163, 184, 0.18);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
  min-width: 150px;
}
.tooltip-header {
  font-size: 11px;
  color: #94a3b8;
  border-bottom: 1px solid rgba(148, 163, 184, 0.15);
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
.high-low { color: #e2e8f0; }
.volume { color: #94a3b8; }

.tooltip-divider {
  height: 1px;
  background: rgba(148, 163, 184, 0.15);
  margin: 8px 0;
}
.tooltip-signal {
  font-size: 12px;
  color: #fbbf24;
  line-height: 1.5;
}
</style>
