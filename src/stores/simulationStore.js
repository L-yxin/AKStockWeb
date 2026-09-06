// ============================================================================
// 模拟交易状态机（前端驱动，逐根跳柱 + 手工下单）
// - 交易撮合/持仓/盈亏全部在前端实时计算；结束模拟交易时把逐笔成交提交
//   后端 akquant（/ws/simulationEvaluate）生成绩效报告。
// - 时间语义与 K 线一致：本地时间显式 +08:00 转 epoch（毫秒）。
// ============================================================================

const _INITIAL_CASH = 1000000 // 初始资金（默认，面板展示）

// 本地时间串（YYYY-MM-DD）→ epoch ms（按 Asia/Shanghai 解释）
const parseDateTs = (dateStr) => {
  if (!dateStr) return NaN
  const iso = String(dateStr).includes('T') ? String(dateStr) : `${String(dateStr)}T00:00:00`
  const t = new Date(iso + '+08:00').getTime()
  return Number.isNaN(t) ? NaN : t
}

// epoch ms → 本地日期 'YYYY-MM-DD'（+08:00 语义，不受浏览器时区影响）
const barDate = (ts) => {
  const d = new Date(ts + 8 * 3600 * 1000)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`
}

// epoch ms → 本地时间串 'YYYY-MM-DD HH:mm:ss'
const formatDateTime = (ts) => {
  const d = new Date(ts + 8 * 3600 * 1000)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`
}

// 成交 side → 图表标记类型（futures market，markers.js 支持：多开/空开/多平/空平）
const _MARKER_TYPE = {
  open_long: '多开',
  close_long: '多平',
  open_short: '空开',
  close_short: '空平',
}

export const useSimulationStore = defineStore('simulation', () => {
  // ---------- 初始化配置（开始前设置） ----------
  const config = ref({
    startDate: '',             // 起始时间（默认当前标的图表起始时间）
    endDate: '',               // 结束时间（默认当前标的图表结束时间）
    symbol: '',                // 标的：仅当前，只读
    direction: 'long',         // long 单向做多 | short 单向做空 | both 双向交易
    marginMode: 'amount',      // amount 按金额 | percent 按百分比
    marginValue: 10000,        // 保证金金额 或 百分比数值
    contractMultiplier: 100,   // 合约乘数，默认 100
    settlement: 'T1',          // T1 | T0，默认 T+1
  })

  // ---------- 运行状态 ----------
  const active = ref(false)      // 模拟进行中
  const paused = ref(false)      // 临时退出（暂停）
  const finished = ref(false)    // 已结束（含报告）
  const bars = ref([])           // 模拟区间 K 线（chart.getDataList() 截取）
  const cursorIndex = ref(-1)    // 当前模拟位置（K 线索引）
  const trades = ref([])         // 成交记录
  const positions = reactive({   // 持仓（null 或 {quantity, avgPrice, openDate, margin}）
    long: null,
    short: null,
  })
  const initialCash = ref(_INITIAL_CASH)
  const usedMargin = ref(0)
  const realizedPnl = ref(0)
  const report = ref(null)       // { report_url, report_path, metrics, trades, generated_at }
  const chartKey = ref('')       // 模拟开始时的 "symbol:period"（K 线对象变更时校验）
  const rangeSyncSuppressed = ref(false) // 程序性滚动期间抑制 K 线图拖拽接管

  // ---------- 计算属性 ----------
  const currentBar = computed(() =>
    cursorIndex.value >= 0 && cursorIndex.value < bars.value.length
      ? bars.value[cursorIndex.value]
      : null
  )
  const availableCash = computed(() => initialCash.value - usedMargin.value)
  const totalEquity = computed(() => initialCash.value + realizedPnl.value + unrealizedPnl.value)

  const currentSignals = computed(() => {
    const cb = currentBar.value
    if (!cb) return []
    // 买卖提示指标已启用指标的返回值（LongShortIndicatorPanel 存于 searchStore）
    const searchStore = useSearchParametersStore()
    const list = searchStore.longShortSignals || []
    return list.filter(s => s.timestamp === cb.timestamp)
  })

  const unrealizedPnl = computed(() => {
    const cb = currentBar.value
    if (!cb) return 0
    const m = config.value.contractMultiplier
    let pnl = 0
    if (positions.long) pnl += (cb.close - positions.long.avgPrice) * m * positions.long.quantity
    if (positions.short) pnl += (positions.short.avgPrice - cb.close) * m * positions.short.quantity
    return pnl
  })

  // 下一根多空信号（时间信息来自后端多空信号返回值 searchStore.longShortSignals）
  const nextSignal = computed(() => {
    if (!active.value) return null
    const searchStore = useSearchParametersStore()
    const list = searchStore.longShortSignals || []
    if (!list.length) return null
    const sigTs = new Set(list.map(s => s.timestamp))
    for (let i = cursorIndex.value + 1; i < bars.value.length; i++) {
      const ts = bars.value[i].timestamp
      if (!sigTs.has(ts)) continue
      const sig = list.find(s => s.timestamp === ts)
      return {
        index: i,
        timestamp: ts,
        datetime: sig?.datetime || formatDateTime(ts), // 后端返回值中的时间
        message: sig?.message || '',
      }
    }
    return null
  })

  // ---------- 生命周期 ----------
  function startSimulation(cfg) {
    const list = Array.isArray(cfg.bars) ? cfg.bars : []
    if (!list.length) return { ok: false, msg: '模拟区间无K线数据' }
    config.value = {
      startDate: cfg.startDate || '',
      endDate: cfg.endDate || '',
      symbol: cfg.symbol || '',
      direction: cfg.direction || 'long',
      marginMode: cfg.marginMode || 'amount',
      marginValue: Number(cfg.marginValue) || 10000,
      contractMultiplier: Number(cfg.contractMultiplier) || 100,
      settlement: cfg.settlement || 'T1',
    }
    chartKey.value = cfg.chartKey || ''
    bars.value = list
    cursorIndex.value = 0
    trades.value = []
    positions.long = null
    positions.short = null
    initialCash.value = _INITIAL_CASH
    usedMargin.value = 0
    realizedPnl.value = 0
    report.value = null
    active.value = true
    paused.value = false
    finished.value = false
    return { ok: true }
  }

  function pause() {
    if (active.value) paused.value = true
  }
  function resume() {
    if (active.value) paused.value = false
  }

  // 结束模拟：保留状态用于展示报告；active 置 false 阻止继续交易
  function finish() {
    if (!active.value) return
    active.value = false
    paused.value = false
    finished.value = true
  }

  function reset() {
    active.value = false
    paused.value = false
    finished.value = false
    bars.value = []
    cursorIndex.value = -1
    trades.value = []
    positions.long = null
    positions.short = null
    usedMargin.value = 0
    realizedPnl.value = 0
    report.value = null
  }

  // ---------- 跳柱（一根一根跳） ----------
  function nextBar() {
    if (!active.value || paused.value) return false
    if (cursorIndex.value >= bars.value.length - 1) return false
    cursorIndex.value++
    return true
  }
  function prevBar() {
    if (!active.value || paused.value) return false
    if (cursorIndex.value <= 0) return false
    cursorIndex.value--
    return true
  }

  // ---------- K线图拖拽接管（onVisibleRangeChange → 当前柱跟随） ----------
  function setCursorFromChart(idx) {
    if (!active.value || paused.value) return false
    if (!Number.isFinite(idx)) return false
    const i = Math.max(0, Math.min(Math.floor(idx), bars.value.length - 1))
    if (i === cursorIndex.value) return false
    cursorIndex.value = i
    return true
  }

  // ---------- 跳到下一根多空信号柱 ----------
  function jumpToSignal() {
    const n = nextSignal.value
    if (!n) return { ok: false, msg: '当前柱之后没有更多多空信号' }
    cursorIndex.value = n.index
    return { ok: true, datetime: n.datetime, message: n.message }
  }

  // ---------- 程序性滚动（跳柱/定位/建遮挡）时抑制 K 线图拖拽接管 ----------
  // 计数器方案：嵌套调用（如"开始模拟"内的多次滚动/建图）取最长抑制窗口
  let rangeSyncDepth = 0
  function withRangeSyncSuppressed(fn, ms = 800) {
    rangeSyncDepth++
    rangeSyncSuppressed.value = true
    try {
      if (typeof fn === 'function') fn()
    } finally {
      setTimeout(() => {
        rangeSyncDepth = Math.max(0, rangeSyncDepth - 1)
        if (rangeSyncDepth === 0) rangeSyncSuppressed.value = false
      }, ms)
    }
  }

  // ---------- 资金与保证金 ----------
  // 每 N 手所需保证金：按金额 = marginValue×N；按百分比 = 开仓价×乘数×N×%
  function marginFor(price, qty) {
    const c = config.value
    if (c.marginMode === 'percent') {
      return price * c.contractMultiplier * qty * (c.marginValue / 100)
    }
    return c.marginValue * qty
  }

  const canTrade = () => active.value && !paused.value && !finished.value && !!currentBar.value

  // ---------- 开仓 ----------
  function openPosition(side, price, qty) {
    if (!canTrade()) return { ok: false, msg: '模拟交易未在进行中' }
    if (!(qty > 0)) return { ok: false, msg: '数量必须大于0' }
    if (config.value.direction === 'long' && side === 'short') {
      return { ok: false, msg: '当前为单向做多，不能开空' }
    }
    if (config.value.direction === 'short' && side === 'long') {
      return { ok: false, msg: '当前为单向做空，不能开多' }
    }
    if (positions[side]) {
      return { ok: false, msg: side === 'long' ? '已持有多仓，请先平仓' : '已持有空仓，请先平仓' }
    }
    const margin = marginFor(price, qty)
    if (availableCash.value < margin) {
      return { ok: false, msg: `可用资金不足（需要 ${margin.toFixed(2)}，可用 ${availableCash.value.toFixed(2)}）` }
    }
    positions[side] = {
      quantity: qty,
      avgPrice: price,
      openDate: barDate(currentBar.value.timestamp),
      margin,
    }
    usedMargin.value += margin
    const trade = {
      timestamp: currentBar.value.timestamp,
      datetime: formatDateTime(currentBar.value.timestamp),
      side: side === 'long' ? 'open_long' : 'open_short',
      action: side === 'long' ? '买（开）' : '卖（开）',
      price,
      quantity: qty,
      margin,
      pnl: null,
      status: '开仓',
    }
    trades.value.push(trade)
    return { ok: true, trade }
  }

  // ---------- 平仓 ----------
  function closePosition(side, price, qty) {
    if (!canTrade()) return { ok: false, msg: '模拟交易未在进行中' }
    const pos = positions[side]
    if (!pos) return { ok: false, msg: side === 'long' ? '无多仓可平' : '无空仓可平' }
    if (!(qty > 0)) return { ok: false, msg: '数量必须大于0' }
    if (qty > pos.quantity) return { ok: false, msg: `平仓数量超过持仓（持仓 ${pos.quantity} 手）` }
    if (config.value.settlement === 'T1' && barDate(currentBar.value.timestamp) === pos.openDate) {
      return { ok: false, msg: 'T+1 规则：当日开仓不能当日平仓' }
    }
    const m = config.value.contractMultiplier
    const pnl = side === 'long'
      ? (price - pos.avgPrice) * m * qty
      : (pos.avgPrice - price) * m * qty
    realizedPnl.value += pnl
    const release = pos.margin * (qty / pos.quantity)
    usedMargin.value -= release
    pos.margin -= release
    pos.quantity -= qty
    if (pos.quantity === 0) positions[side] = null
    const trade = {
      timestamp: currentBar.value.timestamp,
      datetime: formatDateTime(currentBar.value.timestamp),
      side: side === 'long' ? 'close_long' : 'close_short',
      action: side === 'long' ? '多平' : '空平',
      price,
      quantity: qty,
      margin: -release,
      pnl,
      status: '平仓',
    }
    trades.value.push(trade)
    return { ok: true, trade }
  }

  // ---------- 标记（交易记录展示到 K 线） ----------
  function getMarkerConfigs() {
    return trades.value.map(t => ({
      timestamp: t.timestamp,
      value: t.price,
      type: _MARKER_TYPE[t.side] || '多开',
      mes: `${t.action} ${t.quantity} 手 @ ${t.price}` + (t.pnl != null ? `\n盈亏 ${t.pnl >= 0 ? '+' : ''}${t.pnl.toFixed(2)}` : ''),
    }))
  }

  return {
    config,
    active,
    paused,
    finished,
    bars,
    cursorIndex,
    trades,
    positions,
    initialCash,
    usedMargin,
    realizedPnl,
    report,
    chartKey,
    rangeSyncSuppressed,
    currentBar,
    availableCash,
    totalEquity,
    currentSignals,
    unrealizedPnl,
    nextSignal,
    startSimulation,
    pause,
    resume,
    finish,
    reset,
    nextBar,
    prevBar,
    setCursorFromChart,
    jumpToSignal,
    withRangeSyncSuppressed,
    canTrade,
    marginFor,
    openPosition,
    closePosition,
    getMarkerConfigs,
  }
})
