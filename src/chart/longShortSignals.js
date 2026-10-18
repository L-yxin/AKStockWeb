// ============================================================================
// 多空信号：请求 + 渲染（公共模块）
// - LongShortIndicatorPanel（手动启用）与 kLineView（股票切换自动刷新）共用
// - 请求 /ws/getLongShortSignal → 清旧标记 → 按时间戳打预测标记 → 存入 store
// ============================================================================
import { ws_getLongShortSignal_url } from '@/api'

/**
 * 请求多空信号并渲染到图表。
 * @param {object} chartRef  kLineView 组件实例（提供 .chart 与 wrappedAddMarkers/clearAllMarkers）
 * @param {object} opts      { configs: 启用指标配置[], period?: '1d'|'5m'|... }
 * @returns {Promise<{data: Array, skipped: Array}>}
 */
export async function requestLongShortSignals(chartRef, { configs, period } = {}) {
  const searchStore = useSearchParametersStore()

  // 周期：优先显式传入，否则取图表当前周期（与面板/URL 逻辑一致）
  let usePeriod = period
  if (!usePeriod) {
    const chart = chartRef?.chart
    if (chart) {
      const p = chart.getPeriod()
      if (p) usePeriod = `${p.span}${p.type[0]}`
    }
  }
  if (!usePeriod) usePeriod = '1d'

  const raw = await new Promise((resolve, reject) => {
    const ws = new WebSocket(ws_getLongShortSignal_url)
    ws.onopen = () => ws.send(JSON.stringify({
      period: usePeriod,
      symbol: searchStore.symbol,
      startTime: searchStore.startDate,
      endTime: searchStore.endDate,
      indicators: configs || [],
      t: new Date().getTime()
    }))
    ws.onmessage = (event) => {
      let res
      try { res = JSON.parse(event.data) } catch (e) { reject(e); ws.close(); return }
      if (res.error) { reject(res.error); ws.close(); return }
      resolve(event.data)
      ws.close()
    }
    ws.onerror = (err) => { reject(err); ws.close() }
  })

  const res = JSON.parse(raw)
  const parsedData = res.data
  if (!Array.isArray(parsedData)) {
    throw new Error('返回数据格式不正确，预期为数组')
  }

  // 图表未就绪：仅保存信号到 store（URL 场景图表重建前）
  const comp = chartRef
  const chart = comp?.chart
  if (!comp || !chart) {
    searchStore.setLongShortSignals(parsedData)
    return { data: parsedData, skipped: res.skipped || [] }
  }

  comp.clearAllMarkers(chart, 'ls')

  // 保存信号到 store（含 timestamp），供模拟交易跳柱时按柱提示
  const signalsWithTs = []
  for (const signal of parsedData) {
    const signalPeriod = signal.period
    const timestamp = (() => {
      // 与 K 线时间戳语义一致：本地时间显式 +08:00 转 epoch
      const dt = String(signal.datetime)
      const iso = dt.includes('T') ? dt : dt.replace(' ', 'T')
      const tsStr = /\d{1,2}:\d{2}(:\d{2})?/.test(iso) ? iso : iso + 'T00:00:00'
      const t = new Date(tsStr + '+08:00').getTime()
      if (signalPeriod === '1d') {
        // 日线调整为当天 00:00（本地时区下的当天零点）
        const local = new Date(t + 8 * 3600 * 1000)
        const localMidnight = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()))
        return localMidnight.getTime() - 8 * 3600 * 1000
      }
      return t
    })()

    // 标记类型：买入→BULL 卖出→BEAR 中性→NEUTRAL
    // 包级信号（如 StockSelectionStrategy 选股策略）：入选即看多 → BULL
    const type = (() => {
      if (signal.type === 'buy') return 'BULL'
      if (signal.type === 'sell') return 'BEAR'
      if (signal.type === 'neutral') return 'NEUTRAL'
      return 'BULL'
    })()
    const value = (() => {
      if (type === 'BULL') return signal.low
      if (type === 'BEAR') return signal.high
      if (type === 'NEUTRAL') return signal.close
      return signal.value
    })()

    signalsWithTs.push({
      period: signalPeriod,
      datetime: String(signal.datetime),
      timestamp,
      type: signal.type,       // 原始 buy|sell|neutral（模拟交易提示用）
      message: signal.message,
      value,
      low: signal.low,
      high: signal.high,
    })
    comp.addMarkers(chart, [{ timestamp, type, value, mes: signal.message }], 'predict', 'ls')
  }
  searchStore.setLongShortSignals(signalsWithTs)
  return { data: parsedData, skipped: res.skipped || [] }
}
