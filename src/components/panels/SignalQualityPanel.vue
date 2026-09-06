<template>
  <div class="sq-panel">
    <!-- 评测上下文 -->
    <div class="sq-meta">
      <el-tag effect="dark" class="meta-tag">{{ searchStore.symbol }}</el-tag>
      <el-tag effect="plain" type="info" class="meta-tag">{{ currentPeriod }}</el-tag>
      <el-tag effect="plain" type="info" class="meta-tag">{{ adjustText }}</el-tag>
      <span class="meta-desc">提交买卖价格/时间，由后台 akquant 完成信号质量评测（按日线回放）</span>
    </div>

    <!-- 操作栏 -->
    <div class="sq-toolbar">
      <el-button type="primary" plain @click="addSignal">
        <el-icon><Plus /></el-icon>&nbsp;添加信号
      </el-button>
      <el-button @click="importFromChart" :disabled="!canImport">
        <el-icon><Download /></el-icon>&nbsp;从图表导入
      </el-button>
      <el-button @click="clearSignals" :disabled="signals.length === 0">清空</el-button>
    </div>

    <!-- 信号列表 -->
    <div class="sq-list" v-if="signals.length > 0">
      <div v-for="(sig, idx) in signals" :key="idx" class="sq-row">
        <div class="sq-row-head">
          <span class="sq-index">#{{ idx + 1 }}</span>
          <el-tag :type="sig.direction === 'long' ? 'danger' : 'success'" effect="dark" size="small"
            class="sq-direction">
            {{ sig.direction === 'long' ? '做多' : '做空' }}
          </el-tag>
          <el-button text size="small" type="danger" class="sq-delete" @click="removeSignal(idx)">
            <el-icon><Delete /></el-icon>
          </el-button>
        </div>
        <div class="sq-row-body">
          <el-date-picker v-model="sig.datetime" type="datetime"
            placeholder="信号时间" value-format="YYYY-MM-DD HH:mm:ss"
            class="sq-datetime" :clearable="false" />
          <el-input-number v-model="sig.price" :precision="4" :step="0.01"
            :min="0" placeholder="价格" class="sq-price" controls-position="right" />
          <el-input v-model="sig.note" placeholder="备注（可选）" class="sq-note" />
        </div>
      </div>
    </div>
    <el-empty v-else description="暂无评测信号，可手动添加或从图表导入" :image-size="72" />

    <!-- 提交 -->
    <div class="sq-footer">
      <el-button type="primary" size="large" class="sq-submit"
        :disabled="signals.length === 0 || submitting" :loading="submitting"
        @click="submitEvaluation">
        提交后台评测（{{ signals.length }} 条）
      </el-button>
    </div>

    <!-- 评测结果：报告 URL + 指标摘要（后台 akquant 评测完成返回） -->
    <div class="sq-result" v-if="result">
      <div class="sq-result-head">
        <span class="sq-result-title">评测报告已生成</span>
        <el-button text size="small" type="primary" @click="openReport">
          <el-icon><View /></el-icon>&nbsp;打开报告
        </el-button>
        <el-button text size="small" @click="copyReportPath">
          <el-icon><CopyDocument /></el-icon>&nbsp;复制路径
        </el-button>
      </div>
      <div class="sq-report-path" :title="result.report_url">{{ result.report_url }}</div>

      <div class="sq-metrics">
        <div v-for="m in metricItems" :key="m.label" class="sq-metric-item">
          <span class="sq-metric-label">{{ m.label }}</span>
          <span class="sq-metric-value" :class="m.cls">{{ m.value }}</span>
        </div>
      </div>

      <div class="sq-signal-stats" v-if="result.signals">
        <span class="sq-ss-label">信号统计</span>
        <el-tag size="small" effect="plain" type="info">共 {{ result.signals.total }} 条</el-tag>
        <el-tag size="small" effect="plain" type="success">成交 {{ result.signals.matched }} 条</el-tag>
        <el-tag size="small" effect="plain" type="warning" v-if="result.signals.ignored_total">
          忽略 {{ result.signals.ignored_total }} 条
        </el-tag>
        <el-tag size="small" effect="plain" type="danger" v-if="result.signals.missed_dates?.length">
          错失 {{ result.signals.missed_dates.length }} 个日期
        </el-tag>
      </div>
      <div class="sq-warning" v-if="result.signals?.warning">{{ result.signals.warning }}</div>
    </div>
  </div>
</template>

<script setup>
import { Plus, Delete, Download, View, CopyDocument } from '@element-plus/icons-vue'
import { ws_signalQualityEvaluate_url } from '@/api'
import { getBaseDirection } from '@/chart/markers'

const props = defineProps({
  chartRef: { type: Object, required: true },
})

const searchStore = useSearchParametersStore()

// ---------- 评测上下文 ----------
// 周期中文标签（与 kLineView 周期工具条一致）
const PERIOD_LABELS = {
  '1minute': '1分', '5minute': '5分', '15minute': '15分', '30minute': '30分',
  '1hour': '60分', '1day': '日线', '1week': '周线', '1month': '月线',
}
const currentPeriod = computed(() => {
  const p = searchStore.period || { type: 'day', span: 1 }
  return PERIOD_LABELS[`${p.span}${p.type}`] || `${p.span}${p.type}`
})
const adjustText = computed(() => {
  const map = { none: '不复权', front: '前复权', back: '后复权' }
  return map[searchStore.adjust_type] || searchStore.adjust_type
})

// klinecharts Period → 后端 period 参数（月线必须大写 1M，否则被后端识别为 1 分钟）
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

// ---------- 信号列表 ----------
const signals = ref([])

const addSignal = () => {
  signals.value.push({
    direction: 'long',
    datetime: '',
    price: null,
    note: '',
  })
}

const removeSignal = (idx) => {
  signals.value.splice(idx, 1)
}

const clearSignals = () => {
  signals.value = []
  ElMessage.success('已清空全部信号')
}

// 从图表当前标记导入（仅当图表存在标记时可用）
const canImport = computed(() => {
  const records = props.chartRef?.getMarkers?.()
  return Array.isArray(records) && records.length > 0
})

const importFromChart = () => {
  const records = props.chartRef?.getMarkers?.()
  if (!Array.isArray(records) || records.length === 0) {
    ElMessage.warning('图表上暂无信号标记')
    return
  }
  const imported = records.map(rec => {
    const direction = getBaseDirection(rec.market || 'stock', rec.type) === 1 ? 'long' : 'short'
    return {
      direction,
      datetime: formatTs(rec.timestamp),
      price: rec.value,
      note: rec.mes || `信号: ${rec.type}`,
    }
  }).filter(s => s.datetime)
  if (imported.length === 0) {
    ElMessage.warning('没有可用的信号时间')
    return
  }
  signals.value = signals.value.concat(imported)
  ElMessage.success(`已从图表导入 ${imported.length} 条信号`)
}

function formatTs(ts) {
  if (!ts) return ''
  const d = new Date(ts + 8 * 3600 * 1000) // 与 K 线时间戳语义一致：本地时间当 UTC
  if (isNaN(d.getTime())) return ''
  const pad = n => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
}

// ---------- 提交评测（只负责提交，后台处理） ----------
const submitting = ref(false)
// 评测结果（后台返回：报告 URL + 指标摘要 + 信号统计）
const result = ref(null)

const metricItems = computed(() => {
  const m = result.value?.metrics
  if (!m) return []
  const fmtMoney = (v) => {
    const n = Number(v)
    if (isNaN(n)) return '-'
    return n.toLocaleString('zh-CN', { maximumFractionDigits: 2 })
  }
  return [
    { label: '初始资金', value: fmtMoney(m.initial_cash), cls: '' },
    { label: '期末权益', value: fmtMoney(m.final_equity), cls: '' },
    { label: '总收益率', value: `${Number(m.total_return_pct).toFixed(2)}%`, cls: Number(m.total_return_pct) >= 0 ? 'pos' : 'neg' },
    { label: '最大回撤', value: `${Number(m.max_drawdown_pct).toFixed(2)}%`, cls: 'neg' },
    { label: '交易次数', value: m.trade_count ?? '-', cls: '' },
    { label: '胜率', value: `${Number(m.win_rate_pct).toFixed(1)}%`, cls: '' },
    { label: '总盈亏', value: fmtMoney(m.total_pnl), cls: Number(m.total_pnl) >= 0 ? 'pos' : 'neg' },
    { label: '净盈亏', value: fmtMoney(m.net_pnl), cls: Number(m.net_pnl) >= 0 ? 'pos' : 'neg' },
  ]
})

const openReport = () => {
  if (!result.value?.report_url) return
  try {
    const w = window.open(result.value.report_url, '_blank')
    if (!w) throw new Error('blocked')
  } catch (e) {
    ElMessage.warning('浏览器会拦截从网页跳转的 file:// 本地链接，请用「复制路径」后粘贴到地址栏打开')
  }
}

const copyReportPath = async () => {
  const url = result.value?.report_url
  if (!url) return
  try {
    await navigator.clipboard.writeText(url)
    ElMessage.success('报告路径已复制，粘贴到浏览器地址栏即可打开')
  } catch (e) {
    ElMessage.warning('复制失败，请手动选择报告路径复制')
  }
}

const submitEvaluation = () => {
  if (signals.value.length === 0) {
    ElMessage.warning('请先添加评测信号')
    return
  }
  // 校验每条信号
  for (const s of signals.value) {
    if (!s.datetime) {
      ElMessage.warning('存在未设置时间的信号，请补充完整')
      return
    }
    if (!s.price || s.price <= 0) {
      ElMessage.warning('存在未设置价格或价格非法的信号，请补充完整')
      return
    }
  }

  // 构造请求体
  // 评测基准周期固定为日线：信号按 {datetime, price} 逐日回放（与后端 viz.report 的
  // curve_freq='D' 一致）；若用周/月线回测，日级信号将无法匹配 K 线日期而全部错失
  const payload = {
    action: 'signalQualityEvaluate',
    symbol: searchStore.symbol,
    period: '1d',
    adjust_type: searchStore.adjust_type,
    signals: signals.value.map(s => ({
      direction: s.direction,           // long=做多(买入) / short=做空(卖出)
      datetime: s.datetime,             // YYYY-MM-DD HH:mm:ss
      price: s.price,                   // 信号触发价格
      note: s.note || '',               // 可选备注
    })),
    t: new Date().getTime(),
  }

  submitting.value = true
  result.value = null
  const ws = new WebSocket(ws_signalQualityEvaluate_url)
  ws.onopen = () => {
    ws.send(JSON.stringify(payload))
    ElMessage.success(`已提交 ${signals.value.length} 条信号，后台开始评测`)
  }
  ws.onmessage = (event) => {
    // 后台评测完成：展示报告 URL 与指标摘要；失败则提示原因
    try {
      const res = JSON.parse(event.data)
      if (res.code === 0 && res.data) {
        result.value = res.data
        ElMessage.success('评测完成，报告已生成')
      } else if (res.error) {
        ElMessage.error('评测失败：' + res.error)
      }
    } catch (e) { /* ignore */ }
    submitting.value = false
    ws.close()
  }
  ws.onerror = () => {
    ElMessage.error('提交失败：无法连接后台评测服务，请确认后台已启动')
    submitting.value = false
    ws.close()
  }
  ws.onclose = () => {
    submitting.value = false
  }
}
</script>

<style scoped>
.sq-panel {
  padding: 4px 8px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.sq-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 10px 12px;
  border: 1px solid rgba(148, 163, 184, 0.15);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.02);
}
.meta-tag {
  font-variant-numeric: tabular-nums;
}
.meta-desc {
  font-size: 12px;
  color: #64748b;
  margin-left: 4px;
}
.sq-toolbar {
  display: flex;
  gap: 8px;
}
.sq-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 46vh;
  overflow-y: auto;
  padding-right: 2px;
}
.sq-row {
  border: 1px solid rgba(148, 163, 184, 0.15);
  border-radius: 8px;
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.02);
}
.sq-row-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.sq-index {
  font-size: 11px;
  color: #64748b;
}
.sq-direction {
  font-weight: 600;
}
.sq-delete {
  margin-left: auto;
}
.sq-row-body {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.sq-datetime {
  width: 190px;
}
.sq-price {
  width: 130px;
}
.sq-note {
  flex: 1;
  min-width: 140px;
}
.sq-footer {
  padding-top: 6px;
  border-top: 1px solid rgba(148, 163, 184, 0.12);
}
.sq-submit {
  width: 100%;
  background: linear-gradient(135deg, #3b82f6, #6366f1);
  border: none;
  font-weight: 600;
}

/* 评测结果卡片 */
.sq-result {
  border: 1px solid rgba(59, 130, 246, 0.28);
  border-radius: 8px;
  padding: 10px 12px;
  background: rgba(59, 130, 246, 0.06);
}
.sq-result-head {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 6px;
}
.sq-result-title {
  font-size: 13px;
  font-weight: 600;
  color: #93c5fd;
  margin-right: auto;
}
.sq-report-path {
  font-size: 11px;
  color: #64748b;
  background: rgba(15, 20, 30, 0.6);
  border-radius: 5px;
  padding: 6px 8px;
  margin-bottom: 10px;
  word-break: break-all;
  font-family: Consolas, Menlo, monospace;
}
.sq-metrics {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6px 12px;
  margin-bottom: 10px;
}
.sq-metric-item {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: 5px 8px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 5px;
}
.sq-metric-label {
  font-size: 11px;
  color: #64748b;
}
.sq-metric-value {
  font-size: 13px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.sq-metric-value.pos {
  color: #ef4444;
}
.sq-metric-value.neg {
  color: #22c55e;
}
.sq-signal-stats {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.sq-ss-label {
  font-size: 11px;
  color: #64748b;
  margin-right: 2px;
}
.sq-warning {
  margin-top: 8px;
  font-size: 12px;
  color: #f59e0b;
}
</style>
