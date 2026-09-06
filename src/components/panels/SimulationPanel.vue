<template>
  <div class="sim-panel">
    <!-- ==================== 初始化表单（未开始） ==================== -->
    <div v-if="!simStore.active">
      <div class="panel-head">
        <span class="panel-title">模拟交易</span>
        <span class="panel-tip">按K线柱逐根推进，手工下单，结束生成 akquant 绩效报告</span>
        <el-button class="panel-close" text size="small" @click="$emit('close')">关闭</el-button>
      </div>
      <el-form label-position="top" size="default" class="sim-form">
        <el-form-item label="起始时间（默认当前标的起始时间）">
          <el-date-picker v-model="form.startDate" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item label="结束时间（默认当前标的结束时间）">
          <el-date-picker v-model="form.endDate" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item label="标的（仅当前，只读）">
          <el-input :model-value="searchStore.symbol" disabled />
        </el-form-item>
        <el-form-item label="交易方向">
          <el-radio-group v-model="form.direction">
            <el-radio value="long">单向做多</el-radio>
            <el-radio value="short">单向做空</el-radio>
            <el-radio value="both">双向交易</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="保证金">
          <div class="margin-row">
            <el-select v-model="form.marginMode" style="width: 140px">
              <el-option value="amount" label="按金额" />
              <el-option value="percent" label="按百分比" />
            </el-select>
            <el-input-number v-model="form.marginValue" :min="0" :step="form.marginMode === 'percent' ? 1 : 1000"
              :precision="form.marginMode === 'percent' ? 2 : 0" style="flex: 1" />
            <span class="margin-unit">{{ form.marginMode === 'percent' ? '%' : '元/手' }}</span>
          </div>
        </el-form-item>
        <el-form-item label="合约乘数（手 → 股）">
          <el-input-number v-model="form.contractMultiplier" :min="1" :step="10" style="width: 100%" />
        </el-form-item>
        <el-form-item label="交易制度">
          <el-radio-group v-model="form.settlement">
            <el-radio value="T1">T+1</el-radio>
            <el-radio value="T0">T+0</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-button type="primary" class="start-btn" @click="startSim">开始模拟交易</el-button>
      </el-form>
    </div>

    <!-- ==================== 交易操作台（进行中） ==================== -->
    <div v-else>
      <!-- 状态条 -->
      <div class="status-bar">
        <el-tag :type="simStore.paused ? 'warning' : 'success'" effect="dark" size="small">
          {{ simStore.paused ? '已临时退出' : '模拟中' }}
        </el-tag>
        <span class="cur-time">{{ curTimeText }}</span>
        <span class="cur-progress">第 {{ simStore.cursorIndex + 1 }} / {{ simStore.bars.length }} 根</span>
      </div>

      <!-- 跳柱控制 -->
      <div class="step-row">
        <el-button size="small" :disabled="!simStore.active || simStore.paused || simStore.cursorIndex <= 0"
          @click="step(-1)">上一根</el-button>
        <el-button type="primary" size="small"
          :disabled="!simStore.active || simStore.paused || simStore.cursorIndex >= simStore.bars.length - 1"
          @click="step(1)">下一根</el-button>
        <el-button type="warning" size="small" :disabled="!simStore.active || simStore.paused || !simStore.nextSignal"
          @click="jumpSig">下一信号</el-button>
        <el-button size="small" :disabled="!simStore.active" @click="autoPlay">自动播放</el-button>
      </div>

      <!-- 下一根多空信号预告（时间来自后端多空信号返回值） -->
      <div v-if="simStore.nextSignal" class="next-sig">
        下一信号：{{ simStore.nextSignal.datetime }}<span v-if="simStore.nextSignal.message"> · {{ simStore.nextSignal.message }}</span>
      </div>

      <!-- 信号提示（当前柱：买卖提示指标已启用指标返回值） -->
      <div v-if="simStore.currentSignals.length" class="signal-alert">
        <div v-for="(sig, i) in simStore.currentSignals" :key="i"
          class="signal-line" :class="sig.type === 'buy' ? 'sig-buy' : 'sig-sell'">
          <el-icon><CaretTop v-if="sig.type === 'buy'" /><CaretBottom v-else /></el-icon>
          <span>{{ sig.type === 'buy' ? '买入信号' : '卖出信号' }}：{{ sig.message || '该柱出现信号' }}</span>
        </div>
      </div>

      <!-- 价格与数量 -->
      <div class="trade-zone">
        <div class="ohcl-row">
          <el-button size="small" :type="priceMode === 'open' ? 'primary' : 'default'" @click="setPriceMode('open')">开盘 {{ fmt(bar?.open) }}</el-button>
          <el-button size="small" :type="priceMode === 'high' ? 'primary' : 'default'" @click="setPriceMode('high')">最高 {{ fmt(bar?.high) }}</el-button>
          <el-button size="small" :type="priceMode === 'low' ? 'primary' : 'default'" @click="setPriceMode('low')">最低 {{ fmt(bar?.low) }}</el-button>
          <el-button size="small" :type="priceMode === 'close' ? 'primary' : 'default'" @click="setPriceMode('close')">收盘 {{ fmt(bar?.close) }}</el-button>
        </div>
        <div class="custom-price-row">
          <span class="lbl">自定义</span>
          <el-input-number v-model="customPrice" :min="bar ? bar.low : 0" :max="bar ? bar.high : 0"
            :precision="2" :step="0.01" size="small" style="width: 160px"
            @change="priceMode = 'custom'" />
          <span class="lbl">数量（手）</span>
          <el-input-number v-model="quantity" :min="1" :step="1" size="small" style="width: 110px" />
        </div>
      </div>

      <!-- 交易按钮（按方向） -->
      <div class="trade-btns">
        <template v-if="['long', 'both'].includes(simStore.config.direction)">
          <el-button type="danger" size="default" :disabled="simStore.paused" @click="doTrade('open_long')">买（开）</el-button>
          <el-button type="success" size="default" :disabled="simStore.paused" @click="doTrade('close_long')">多平</el-button>
        </template>
        <template v-if="['short', 'both'].includes(simStore.config.direction)">
          <el-button type="warning" size="default" :disabled="simStore.paused" @click="doTrade('open_short')">卖（开）</el-button>
          <el-button type="info" size="default" :disabled="simStore.paused" @click="doTrade('close_short')">空平</el-button>
        </template>
      </div>

      <!-- 持仓与资金 -->
      <div class="pos-grid">
        <div class="pos-card">
          <div class="pos-title">多仓</div>
          <div v-if="simStore.positions.long" class="pos-body">
            <div>数量：{{ simStore.positions.long.quantity }} 手</div>
            <div>均价：{{ fmt(simStore.positions.long.avgPrice) }}</div>
            <div>保证金：{{ fmt(simStore.positions.long.margin) }}</div>
            <div class="pos-pnl" :class="pnlClass(longPnl)">
              浮动盈亏：{{ fmt(longPnl) }}
            </div>
          </div>
          <div v-else class="pos-empty">无持仓</div>
        </div>
        <div class="pos-card">
          <div class="pos-title">空仓</div>
          <div v-if="simStore.positions.short" class="pos-body">
            <div>数量：{{ simStore.positions.short.quantity }} 手</div>
            <div>均价：{{ fmt(simStore.positions.short.avgPrice) }}</div>
            <div>保证金：{{ fmt(simStore.positions.short.margin) }}</div>
            <div class="pos-pnl" :class="pnlClass(shortPnl)">
              浮动盈亏：{{ fmt(shortPnl) }}
            </div>
          </div>
          <div v-else class="pos-empty">无持仓</div>
        </div>
      </div>
      <div class="cash-row">
        <span>初始资金 {{ fmt(simStore.initialCash) }}</span>
        <span>占用保证金 {{ fmt(simStore.usedMargin) }}</span>
        <span>可用 {{ fmt(simStore.availableCash) }}</span>
        <span class="pos-pnl" :class="pnlClass(simStore.realizedPnl)">已实现盈亏 {{ fmt(simStore.realizedPnl) }}</span>
      </div>

      <!-- 控制按钮 -->
      <div class="ctrl-row">
        <el-button size="small" @click="simStore.pause()" :disabled="simStore.paused || !simStore.active">临时退出</el-button>
        <el-button size="small" type="warning" @click="simStore.resume()" :disabled="!simStore.paused">继续模拟</el-button>
        <el-button size="small" type="danger" @click="finishSim">结束模拟交易</el-button>
      </div>
    </div>

    <!-- ==================== 交易记录列表 ==================== -->
    <el-divider v-if="simStore.trades.length" content-position="left">交易记录</el-divider>
    <el-table v-if="simStore.trades.length" :data="simStore.trades" size="small" max-height="260"
      class="trade-table">
      <el-table-column prop="datetime" label="时间" width="130" />
      <el-table-column prop="action" label="动作" width="76" />
      <el-table-column label="价格" width="86">
        <template #default="{ row }">{{ fmt(row.price) }}</template>
      </el-table-column>
      <el-table-column prop="quantity" label="手数" width="60" />
      <el-table-column label="盈亏" width="100">
        <template #default="{ row }">
          <span v-if="row.pnl != null" :class="pnlClass(row.pnl)">{{ row.pnl >= 0 ? '+' : '' }}{{ fmt(row.pnl) }}</span>
          <span v-else>—</span>
        </template>
      </el-table-column>
    </el-table>

    <!-- ==================== 报告区（结束后） ==================== -->
    <div v-if="simStore.finished" class="report-zone">
      <el-divider content-position="left">绩效报告（akquant）</el-divider>
      <div v-if="reportLoading" class="report-loading">正在生成报告…</div>
      <template v-else-if="simStore.report">
        <div class="report-metrics">
          <div class="metric"><span class="m-label">总收益率</span><span class="m-value" :class="pnlClass(simStore.report.metrics?.total_return_pct)">{{ fmtPct(simStore.report.metrics?.total_return_pct) }}</span></div>
          <div class="metric"><span class="m-label">最大回撤</span><span class="m-value" :class="pnlClass(simStore.report.metrics?.max_drawdown_pct)">{{ fmtPct(simStore.report.metrics?.max_drawdown_pct) }}</span></div>
          <div class="metric"><span class="m-label">交易数</span><span class="m-value">{{ simStore.report.metrics?.trade_count ?? '—' }}</span></div>
          <div class="metric"><span class="m-label">胜率</span><span class="m-value">{{ fmtPct(simStore.report.metrics?.win_rate_pct) }}</span></div>
          <div class="metric"><span class="m-label">总盈亏</span><span class="m-value" :class="pnlClass(simStore.report.metrics?.total_pnl)">{{ fmt(simStore.report.metrics?.total_pnl) }}</span></div>
        </div>
        <div class="report-link">
          <a :href="simStore.report.report_url" target="_blank">打开绩效报告（HTML）</a>
          <el-button size="small" type="primary" @click="newSimulation" style="margin-left: 12px">重新模拟</el-button>
        </div>
      </template>
      <el-alert v-else-if="reportError" :title="reportError" type="error" :closable="false" />
    </div>
  </div>
</template>

<script setup>
import { CaretTop, CaretBottom } from '@element-plus/icons-vue'
import { ws_simulationEvaluate_url } from '@/api'

const props = defineProps({
  chartRef: { type: Object, required: true },
})
defineEmits(['close'])

const searchStore = useSearchParametersStore()
const simStore = useSimulationStore()

const getChart = () => props.chartRef?.chart

// ---------- 初始化表单 ----------
const form = reactive({
  startDate: '',
  endDate: '',
  direction: 'long',
  marginMode: 'amount',
  marginValue: 10000,
  contractMultiplier: 100,
  settlement: 'T1',
})

// 默认起始/结束 = 当前图表数据的第一根 / 最后一根（本地日期）
const chartRange = () => {
  const chart = getChart()
  const bars = chart ? chart.getDataList() : []
  if (!bars.length) return { start: '', end: '' }
  return { start: tsToDate(bars[0].timestamp), end: tsToDate(bars[bars.length - 1].timestamp) }
}
const refreshRange = () => {
  const { start, end } = chartRange()
  if (start) { if (!form.startDate || !simStore.active) form.startDate = start }
  if (end) { if (!form.endDate || !simStore.active) form.endDate = end }
}

// ---------- 开始模拟 ----------
const startSim = () => {
  // 图表数据可能晚于面板挂载 → 点击开始时再刷新一次默认区间
  refreshRange()
  const chart = getChart()
  if (!chart) return ElMessage.error('图表实例未就绪')
  const allBars = chart.getDataList()
  if (!allBars.length) return ElMessage.error('图表暂无K线数据，请先加载数据')
  if (!form.startDate || !form.endDate) return ElMessage.error('请选择起始/结束时间')
  if (form.endDate < form.startDate) return ElMessage.error('结束时间不能早于起始时间')
  if (!(form.marginValue > 0)) return ElMessage.error('保证金必须大于0')
  const sTs = parseDateTs(form.startDate)
  const eTs = parseDateTs(form.endDate) + 86400 * 1000
  const filtered = allBars.filter(b => b.timestamp >= sTs && b.timestamp < eTs)
  if (!filtered.length) return ElMessage.error('所选时间区间内无K线数据')

  const ret = simStore.startSimulation({
    ...form,
    symbol: searchStore.symbol,
    bars: filtered,
    chartKey: `${searchStore.symbol}:${periodKey(chart.getPeriod())}`,
  })
  if (!ret.ok) return ElMessage.error(ret.msg)

  // 模拟交易期间独占标记区（避免与其他来源标记叠加），开始前清空一次
  props.chartRef?.clearAllMarkers(chart)
  // 视图定位到起始柱（延迟到遮挡 overlay 布局稳定后，避免被其异步重排覆盖）
  setTimeout(() => {
    simStore.withRangeSyncSuppressed(() => chart.scrollToDataIndex(simStore.cursorIndex, 0))
  }, 80)
  ElMessage.success(`模拟交易已开始（${filtered.length} 根K线）`)
}

// ---------- 跳柱 ----------
const step = (dir) => {
  const moved = dir > 0 ? simStore.nextBar() : simStore.prevBar()
  if (moved) {
    simStore.withRangeSyncSuppressed(() => getChart()?.scrollToDataIndex(simStore.cursorIndex, 0))
  }
}

// ---------- 跳到下一根多空信号 ----------
const jumpSig = () => {
  const ret = simStore.jumpToSignal()
  if (!ret.ok) return ElMessage.info(ret.msg)
  simStore.withRangeSyncSuppressed(() => getChart()?.scrollToDataIndex(simStore.cursorIndex, 0))
  ElMessage.success(`已跳到信号柱：${ret.datetime}`)
}

let playTimer = null
const autoPlay = () => {
  if (playTimer) { clearInterval(playTimer); playTimer = null; return }
  ElMessage.info('自动播放中，点击"自动播放"停止')
  playTimer = setInterval(() => {
    if (simStore.paused || !simStore.active) { clearInterval(playTimer); playTimer = null; return }
    const moved = simStore.nextBar()
    if (!moved) { clearInterval(playTimer); playTimer = null; return }
    simStore.withRangeSyncSuppressed(() => getChart()?.scrollToDataIndex(simStore.cursorIndex, 0))
  }, 800)
}

// ---------- 价格模式 ----------
const priceMode = ref('close')
const customPrice = ref(null)
const quantity = ref(1)
const bar = computed(() => simStore.currentBar)

const fmt = (v) => (v == null ? '—' : Number(v).toFixed(2))
const fmtPct = (v) => (v == null ? '—' : `${v > 0 ? '+' : ''}${Number(v).toFixed(2)}%`)
const pnlClass = (v) => (v == null ? '' : v >= 0 ? 'pnl-up' : 'pnl-down')

const setPriceMode = (mode) => { priceMode.value = mode }
const curPrice = computed(() => {
  if (!bar.value) return 0
  if (priceMode.value === 'custom') return customPrice.value ?? bar.value.close
  return bar.value[priceMode.value]
})

// ---------- 交易 ----------
const doTrade = (side) => {
  const p = curPrice.value
  if (!(p > 0)) return ElMessage.warning('请选择有效价格')
  const qty = quantity.value
  const ret = side.startsWith('open')
    ? simStore.openPosition(side === 'open_long' ? 'long' : 'short', p, qty)
    : simStore.closePosition(side === 'close_long' ? 'long' : 'short', p, qty)
  if (!ret.ok) return ElMessage.warning(ret.msg)
  ElMessage.success(ret.msg || '成交')
  renderTradeMarkers()
}

// 交易记录展示到K线（模拟期间独占标记区，全量重放避免重复）
const renderTradeMarkers = () => {
  const chart = getChart()
  if (!chart) return
  const configs = simStore.getMarkerConfigs()
  props.chartRef?.clearAllMarkers(chart)
  if (configs.length) props.chartRef?.addMarkers(chart, configs, 'futures')
}

// ---------- 结束模拟 ----------
const reportLoading = ref(false)
const reportError = ref('')
const finishSim = async () => {
  const hasPos = simStore.positions.long || simStore.positions.short
  const hasTrades = simStore.trades.length > 0
  if (!hasTrades) {
    ElMessage.warning('尚无成交记录，直接结束将生成空报告')
    simStore.finish()
    return
  }
  if (hasPos) {
    ElMessage.warning('仍有未平仓持仓，akquant 回放将在结束时按最后价强制平仓')
  }
  simStore.finish()
  reportError.value = ''
  reportLoading.value = true
  try {
    const chart = getChart()
    const p = chart ? chart.getPeriod() : { type: 'day', span: 1 }
    const period = periodKey(p)
    const data = await new Promise((resolve, reject) => {
      const ws = new WebSocket(ws_simulationEvaluate_url)
      const timer = setTimeout(() => { ws.close(); reject(new Error('请求超时')) }, 120000)
      ws.onopen = () => ws.send(JSON.stringify({
        action: 'simulationEvaluate',
        symbol: simStore.config.symbol,
        period,
        adjust_type: searchStore.adjust_type,
        initial_cash: simStore.initialCash,
        contract_multiplier: simStore.config.contractMultiplier,
        t_plus_one: simStore.config.settlement === 'T1',
        trades: simStore.trades.map(t => ({
          datetime: t.datetime,
          side: t.side,
          price: t.price,
          quantity: t.quantity,
          note: t.action,
        })),
      }))
      ws.onmessage = (e) => { clearTimeout(timer); ws.close(); resolve(JSON.parse(e.data)) }
      ws.onerror = () => { clearTimeout(timer); reject(new Error('后端连接失败')) }
    })
    if (data.code !== 0) throw new Error(data.error || '评估失败')
    simStore.report = data.data
    ElMessage.success('绩效报告已生成')
  } catch (e) {
    console.error('模拟交易评估失败:', e)
    reportError.value = String(e.message || e)
  } finally {
    reportLoading.value = false
  }
}

const newSimulation = () => {
  if (playTimer) { clearInterval(playTimer); playTimer = null }
  simStore.reset()
  refreshRange()
}

// ---------- 工具 ----------
const parseDateTs = (dateStr) => {
  if (!dateStr) return NaN
  const iso = String(dateStr).includes('T') ? String(dateStr) : `${String(dateStr)}T00:00:00`
  const t = new Date(iso + '+08:00').getTime()
  return Number.isNaN(t) ? NaN : t
}
const tsToDate = (ts) => {
  const d = new Date(ts + 8 * 3600 * 1000)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`
}
const periodKey = (p) => {
  if (p.type === 'minute') return `${p.span}m`
  if (p.type === 'hour') return `${p.span}h`
  if (p.type === 'day') return `${p.span}d`
  if (p.type === 'week') return `${p.span}w`
  if (p.type === 'month') return `${p.span}M`
  return '1d'
}

const curTimeText = computed(() => {
  const cb = simStore.currentBar
  if (!cb) return '—'
  const d = new Date(cb.timestamp + 8 * 3600 * 1000)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`
})

const longPnl = computed(() => {
  if (!simStore.positions.long || !bar.value) return null
  return (bar.value.close - simStore.positions.long.avgPrice) * simStore.config.contractMultiplier * simStore.positions.long.quantity
})
const shortPnl = computed(() => {
  if (!simStore.positions.short || !bar.value) return null
  return (simStore.positions.short.avgPrice - bar.value.close) * simStore.config.contractMultiplier * simStore.positions.short.quantity
})

onMounted(() => {
  refreshRange()
})

onUnmounted(() => {
  if (playTimer) { clearInterval(playTimer); playTimer = null }
})
</script>

<style scoped>
.sim-panel {
  padding: 4px 8px;
}
.panel-head {
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.panel-title {
  font-size: 15px;
  font-weight: 600;
  color: #e2e8f0;
}
.panel-close {
  margin-left: auto;
}
.panel-tip {
  display: block;
  font-size: 12px;
  color: #64748b;
  margin-top: 4px;
  flex-basis: 100%;
}
.sim-form .el-form-item {
  margin-bottom: 14px;
}
.margin-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}
.margin-unit {
  color: #94a3b8;
  font-size: 12px;
  white-space: nowrap;
}
.start-btn {
  width: 100%;
  margin-top: 4px;
}
.status-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}
.cur-time {
  font-size: 14px;
  font-weight: 600;
  color: #60a5fa;
}
.cur-progress {
  font-size: 12px;
  color: #94a3b8;
}
.step-row {
  display: flex;
  gap: 6px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}
.next-sig {
  font-size: 12px;
  color: #fbbf24;
  margin-bottom: 10px;
  padding: 4px 8px;
  border: 1px solid rgba(251, 191, 36, 0.3);
  border-radius: 6px;
  background: rgba(251, 191, 36, 0.08);
}
.signal-alert {
  border-radius: 6px;
  padding: 6px 10px;
  margin-bottom: 10px;
  font-size: 13px;
}
.signal-line {
  display: flex;
  align-items: center;
  gap: 4px;
}
.sig-buy { color: #f87171; }
.sig-sell { color: #60a5fa; }
.trade-zone {
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 8px;
  padding: 10px;
  margin-bottom: 10px;
}
.ohcl-row {
  display: flex;
  gap: 6px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}
.ohcl-row .el-button {
  flex: 1;
  min-width: 0;
}
.custom-price-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.lbl {
  font-size: 12px;
  color: #94a3b8;
  white-space: nowrap;
}
.trade-btns {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}
.trade-btns .el-button {
  flex: 1;
}
.pos-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-bottom: 8px;
}
.pos-card {
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 8px;
  padding: 8px 10px;
}
.pos-title {
  font-size: 12px;
  color: #94a3b8;
  margin-bottom: 6px;
}
.pos-body {
  font-size: 12px;
  color: #e2e8f0;
  line-height: 1.8;
}
.pos-empty {
  font-size: 12px;
  color: #475569;
}
.pos-pnl {
  font-weight: 600;
}
.pnl-up { color: #f87171; }
.pnl-down { color: #34d399; }
.cash-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  font-size: 12px;
  color: #94a3b8;
  margin-bottom: 12px;
}
.ctrl-row {
  display: flex;
  gap: 8px;
}
.ctrl-row .el-button {
  flex: 1;
}
.trade-table {
  width: 100%;
  --el-table-bg-color: transparent;
  --el-table-tr-bg-color: transparent;
  --el-table-header-bg-color: rgba(148, 163, 184, 0.08);
}
.report-zone {
  margin-top: 4px;
}
.report-loading {
  color: #94a3b8;
  font-size: 13px;
  padding: 12px 0;
}
.report-metrics {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-bottom: 12px;
}
.metric {
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 8px;
  padding: 8px;
  text-align: center;
}
.m-label {
  display: block;
  font-size: 11px;
  color: #94a3b8;
  margin-bottom: 4px;
}
.m-value {
  font-size: 14px;
  font-weight: 600;
  color: #e2e8f0;
}
.report-link {
  font-size: 13px;
}
.report-link a {
  color: #60a5fa;
}
</style>
