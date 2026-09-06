// ============================================================================
// cloudMetrics 云指标
// 从后台 WebSocket 拉取自定义指标序列，按时间戳对齐到 K 线数据上展示
//
// 修复说明（相对旧实现）：
//  1. 原实现 reconnect 分支使用 arguments.callee，在 ES Module 严格模式下会抛错，改为命名函数
//  2. 原实现 wsInstance / refreshTimer 为模块级且从不清理，组件销毁后仍会持续请求，
//     现提供 destroyCloudMetrics() 由图表组件在 onUnmounted 时调用
//  3. 原实现依赖不存在的 indicator.update / window.refreshChart 来触发重绘，
//     现通过 overrideIndicator 传入新 calc 引用（beta1 中 calc 引用变化会触发重算）实现强制刷新
// ============================================================================
import { registerIndicator } from 'klinecharts'
import { WS_cloudMetrics_url } from '@/api'

const REFRESH_INTERVAL = 60 * 1000 // 60 秒轮询

// 模块级状态
const state = {
  ws: null,
  timer: null,
  loading: false,
  data: [],            // [{ timestamp, value }, ...] 缓存，按时间戳升序
  chartGetter: null,   // 由图表组件注入：() => chart 实例
}

const template = {
  name: 'cloudMetrics',
  shortName: 'CloudMetrics',
  series: 'price',
  precision: 0,
  figures: [
    {
      key: 'value',
      title: '云指标',
      type: 'line',
      styles: () => ({ color: '#FFB74D', size: 1 })
    }
  ],
  calc: (dataList) => {
    // 若已有缓存数据，直接按时间戳对齐返回
    if (state.data.length > 0) {
      const valueMap = {}
      state.data.forEach(item => {
        valueMap[item.timestamp] = item.value
      })
      return dataList.map(d => ({
        value: valueMap[d.timestamp] !== undefined ? valueMap[d.timestamp] : null
      }))
    }

    // 数据未加载，发起请求（首次）
    if (!state.loading) {
      state.loading = true
      fetchCloudMetrics()
    }

    // 返回占位空值
    return dataList.map(() => ({ value: null }))
  }
}

registerIndicator(template)

// 由图表组件注入获取当前 chart 实例的方法（用于数据到达后强制刷新）
export function setCloudMetricsChartGetter(getter) {
  state.chartGetter = getter
}

// 组件卸载时清理连接与定时器
export function destroyCloudMetrics() {
  if (state.timer) {
    clearInterval(state.timer)
    state.timer = null
  }
  if (state.ws) {
    try { state.ws.close() } catch (e) { /* ignore */ }
    state.ws = null
  }
  state.data = []
  state.loading = false
}

/** 发送请求到 WebSocket */
function sendRequest() {
  if (!state.ws || state.ws.readyState !== WebSocket.OPEN) return
  state.ws.send(JSON.stringify({
    action: 'cloudMetrics',
    code: searchStore.symbol,
    start: searchStore.startDate,
    end: searchStore.endDate,
    type: searchStore.adjust_type,
    _t: Date.now()
  }))
}

/** 数据到达后，通过 overrideIndicator 换新 calc 引用强制图表重算 */
function forceRefresh() {
  const chart = state.chartGetter ? state.chartGetter() : null
  if (!chart) return
  try {
    chart.overrideIndicator({
      name: 'cloudMetrics',
      calc: (dataList) => template.calc(dataList)
    })
  } catch (e) {
    console.warn('云指标刷新失败:', e)
  }
}

function handleMessage(event) {
  let res
  try {
    res = JSON.parse(event.data)
  } catch (e) {
    console.error('云指标数据解析失败:', e)
    state.loading = false
    return
  }
  if (res.error) {
    console.error('云指标错误:', res.error)
    state.loading = false
    return
  }
  // 更新缓存
  state.data = (res.data || []).sort((a, b) => a.timestamp - b.timestamp)
  state.loading = false
  forceRefresh()
}

/** 建立/复用连接并发送请求（支持重连） */
function openAndSend() {
  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    sendRequest()
    return
  }
  state.ws = new WebSocket(WS_cloudMetrics_url)
  state.ws.onopen = () => sendRequest()
  state.ws.onmessage = handleMessage
  state.ws.onerror = (err) => {
    console.error('云指标 WebSocket 连接失败:', err)
    state.loading = false
  }
  state.ws.onclose = () => {
    state.ws = null
  }
}

/** 从后端获取云指标数据，并设置定时刷新 */
function fetchCloudMetrics() {
  openAndSend()
  if (state.timer) clearInterval(state.timer)
  state.timer = setInterval(() => {
    openAndSend()
  }, REFRESH_INTERVAL)
}
