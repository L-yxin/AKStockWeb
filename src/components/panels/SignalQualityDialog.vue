<template>
  <teleport to="body">
    <div v-if="visible" class="saq-mask" @click.self="close">
      <div class="saq-frame" :style="frameStyle" @pointerdown.stop>
        <!-- 标题栏（拖拽区） -->
        <div class="saq-titlebar" @pointerdown="onTitleDown">
          <span class="saq-title">信号表现分析 · 可视化</span>
          <div class="saq-actions">
            <el-tag size="small" type="info" v-if="result?.period">周期 {{ result.period }}</el-tag>
            <span class="saq-rt-switch" @click="toggleRt">
              <span :class="{ active: rt === 'simple' }">简单</span>
              <span :class="{ active: rt === 'log' }">对数</span>
            </span>
            <el-button text size="small" @click="close"><el-icon><Close /></el-icon></el-button>
          </div>
        </div>

        <!-- 内容区 -->
        <div class="saq-body">
          <!-- 信号错误 -->
          <div v-if="errors.length" class="saq-errors">
            <div v-for="(e, i) in errors" :key="i" class="saq-error">
              <b>{{ e.displayName || e.name }}</b>：{{ e.error }}
            </div>
          </div>

          <template v-if="result?.signals?.length">
            <!-- 统计表格 -->
            <div class="saq-block">
              <div class="saq-sub-head">
                <span class="saq-sub-title">统计表（按未来 N 根 K 线）</span>
                <span class="saq-hint">多信号并排 · 简单/对数收益可切换（面板右上角）</span>
              </div>
              <div class="saq-table-scroll">
                <table class="saq-table">
                  <thead>
                    <tr>
                      <th rowspan="2">N</th>
                      <th v-for="s in result.signals" :key="s.name" :colspan="11" class="th-sig">{{ s.displayName }}</th>
                    </tr>
                    <tr>
                      <template v-for="s in result.signals" :key="s.name">
                        <th>样本</th><th>胜率</th><th>平均收益</th><th>平均盈利</th>
                        <th>平均亏损</th><th>盈亏比</th><th>回撤</th><th>波动率</th>
                        <th>夏普</th><th>索提诺</th><th>卡玛</th>
                      </template>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="n in result.horizons" :key="n">
                      <td class="td-n">{{ n }}</td>
                      <template v-for="s in result.signals" :key="s.name">
                        <td>{{ cell(s, n, 'count') }}</td>
                        <td :class="retCls(cell(s, n, 'win'))">{{ pct(cell(s, n, 'win')) }}</td>
                        <td :class="retCls(cell(s, n, 'ret'))">{{ pct(cell(s, n, 'ret')) }}</td>
                        <td :class="retCls(cell(s, n, 'avgWin'))">{{ pct(cell(s, n, 'avgWin')) }}</td>
                        <td :class="retCls(cell(s, n, 'avgLoss'))">{{ pct(cell(s, n, 'avgLoss')) }}</td>
                        <td>{{ plr(s, n) }}</td>
                        <td :class="retCls(cell(s, n, 'dd'))">{{ pct(cell(s, n, 'dd')) }}</td>
                        <td>{{ pct(cell(s, n, 'vol')) }}</td>
                        <td>{{ ratio(s, n, 'sharpe') }}</td>
                        <td>{{ ratio(s, n, 'sortino') }}</td>
                        <td>{{ ratio(s, n, 'calmar') }}</td>
                      </template>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div v-if="result.minSample" class="saq-note">* 某 N 有效样本 &lt; minSample({{ result.minSample }}) 时该行显示「样本不足」</div>
            </div>

            <!-- 柱状图 -->
            <div class="saq-block">
              <div class="saq-sub-head">
                <span class="saq-sub-title">指标柱状图</span>
                <el-select v-model="barMetric" size="small" style="width: 140px" @change="renderBar">
                  <el-option v-for="m in BAR_METRICS" :key="m.value" :label="m.label" :value="m.value" />
                </el-select>
              </div>
              <div ref="barEl" class="saq-echart saq-echart-lg"></div>
            </div>

            <!-- 分布图 -->
            <div class="saq-block">
              <div class="saq-sub-head">
                <span class="saq-sub-title">分布图（按 N 分组）</span>
                <el-select v-model="distGroup" size="small" style="width: 120px" @change="renderDist">
                  <el-option label="回撤" value="dd" />
                  <el-option label="波动率" value="vol" />
                </el-select>
                <el-select v-model="distStat" size="small" style="width: 120px" @change="renderDist">
                  <el-option v-for="st in (distGroup === 'dd' ? DD_STATS : VOL_STATS)" :key="st.value" :label="st.label" :value="st.value" />
                </el-select>
              </div>
              <div ref="distEl" class="saq-echart"></div>
            </div>
          </template>

          <el-empty v-else-if="result && !result.signals.length" description="全部信号无效，请检查配置" :image-size="56" />
        </div>

        <!-- 右下角 resize 手柄 -->
        <div class="saq-resize" @pointerdown="onResizeDown"></div>
      </div>
    </div>
  </teleport>
</template>

<script setup>
import { ref, reactive, computed, watch, nextTick, onBeforeUnmount } from 'vue'
import { Close } from '@element-plus/icons-vue'
import * as echarts from 'echarts'

const props = defineProps({
  visible: Boolean,
  result: Object,
  errors: Array,
  returnType: { type: String, default: 'simple' },
})
const emit = defineEmits(['update:visible'])

const close = () => emit('update:visible', false)

// 收益口径（弹窗内可切换，纯前端：后端同时返回 simple/log 两套字段）
const rt = ref(props.returnType === 'log' ? 'log' : 'simple')
function toggleRt() {
  rt.value = rt.value === 'log' ? 'simple' : 'log'
  nextTick(() => { renderBar(); renderDist() })
}
watch(() => props.returnType, (v) => { rt.value = v === 'log' ? 'log' : 'simple' })

// ---------------- 窗口拖拽 / 缩放 ----------------
const MIN_W = 680
const MIN_H = 440
const frame = reactive({
  left: 0, top: 0, width: 960, height: 660,
})
const frameStyle = computed(() => ({
  left: `${frame.left}px`,
  top: `${frame.top}px`,
  width: `${frame.width}px`,
  height: `${frame.height}px`,
}))

let positioned = false
function centerFrame() {
  if (positioned) return
  frame.width = Math.min(960, window.innerWidth - 40)
  frame.height = Math.min(660, window.innerHeight - 80)
  frame.left = Math.max(8, Math.round((window.innerWidth - frame.width) / 2))
  frame.top = Math.max(8, Math.round((window.innerHeight - frame.height) / 2))
  positioned = true
}

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi)

let drag = null
let rafId = null

function onTitleDown(e) {
  // 关闭按钮等控件不触发拖拽
  if (e.target.closest('button, .el-button, .el-tag, .saq-rt-switch')) return
  drag = {
    type: 'move',
    startX: e.clientX, startY: e.clientY,
    origLeft: frame.left, origTop: frame.top,
  }
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
  e.preventDefault()
}

function onResizeDown(e) {
  e.stopPropagation()
  drag = {
    type: 'resize',
    startX: e.clientX, startY: e.clientY,
    origW: frame.width, origH: frame.height,
  }
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
  e.preventDefault()
}

function onPointerMove(e) {
  if (!drag) return
  if (drag.type === 'move') {
    frame.left = clamp(drag.origLeft + e.clientX - drag.startX, -frame.width + 140, window.innerWidth - 80)
    frame.top = clamp(drag.origTop + e.clientY - drag.startY, 0, window.innerHeight - 80)
  } else {
    frame.width = clamp(drag.origW + e.clientX - drag.startX, MIN_W, window.innerWidth - 16)
    frame.height = clamp(drag.origH + e.clientY - drag.startY, MIN_H, window.innerHeight - 16)
    scheduleChartsResize()
  }
}

function onPointerUp() {
  drag = null
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
}

function scheduleChartsResize() {
  if (rafId) cancelAnimationFrame(rafId)
  rafId = requestAnimationFrame(() => {
    ;[barEl.value, distEl.value].forEach(el => {
      if (el) echarts.getInstanceByDom(el)?.resize()
    })
    rafId = null
  })
}

// ---------------- 表格取值 ----------------
function cell(sig, n, key) {
  const h = sig?.horizons?.[String(n)]
  if (!h) return null
  if (h.insufficient) return '样本不足'
  switch (key) {
    case 'count': return h.count
    case 'win': return rt.value === 'log' ? h.winRateLog : h.winRateSimple
    case 'ret': return rt.value === 'log' ? h.avgReturnLog : h.avgReturnSimple
    case 'avgWin': return h.avgWin
    case 'avgLoss': return h.avgLoss
    case 'dd': return h.maxDrawdown?.avg
    case 'vol': return h.volatility?.pooled
    default: return null
  }
}
const retCls = (v) => {
  if (typeof v !== 'number') return ''
  return v >= 0 ? 'pos' : 'neg'
}
const pct = (v) => {
  if (v === null || v === undefined) return '-'
  if (typeof v === 'string') return v
  return `${(v * 100).toFixed(2)}%`
}
const plr = (sig, n) => {
  const h = sig?.horizons?.[String(n)]
  if (!h || h.insufficient) return '-'
  if (h.profitLossRatio === null) return '∞'
  if (typeof h.profitLossRatio !== 'number') return '-'
  return h.profitLossRatio.toFixed(2)
}
const ratio = (sig, n, key) => {
  const h = sig?.horizons?.[String(n)]
  if (!h || h.insufficient) return '-'
  const v = h[key]
  if (v === null || v === undefined) return '-'
  return Number(v).toFixed(2)
}

// ---------------- 柱状图 ----------------
const barEl = ref(null)
const barMetric = ref('win')
const BAR_METRICS = [
  { value: 'win', label: '胜率' },
  { value: 'ret', label: '平均收益' },
  { value: 'avgWin', label: '平均盈利' },
  { value: 'avgLoss', label: '平均亏损' },
  { value: 'plr', label: '盈亏比' },
  { value: 'dd', label: '最大回撤' },
  { value: 'vol', label: '波动率' },
  { value: 'sharpe', label: '夏普' },
  { value: 'sortino', label: '索提诺' },
  { value: 'calmar', label: '卡玛' },
]
const RATIO_METRICS = new Set(['plr', 'sharpe', 'sortino', 'calmar'])
const PCT_METRICS = new Set(['win', 'ret', 'dd'])

function barValue(sig, n, metric) {
  const h = sig?.horizons?.[String(n)]
  if (!h || h.insufficient) return null
  switch (metric) {
    case 'win': return rt.value === 'log' ? h.winRateLog : h.winRateSimple
    case 'ret': return rt.value === 'log' ? h.avgReturnLog : h.avgReturnSimple
    case 'avgWin': return h.avgWin
    case 'avgLoss': return h.avgLoss
    case 'plr': return h.profitLossRatio
    case 'dd': return h.maxDrawdown?.avg
    case 'vol': return h.volatility?.pooled
    case 'sharpe': return h.sharpe
    case 'sortino': return h.sortino
    case 'calmar': return h.calmar
    default: return null
  }
}

function renderBar() {
  const el = barEl.value
  if (!el || !props.result) return
  const chart = echarts.getInstanceByDom(el) || echarts.init(el)
  const sigs = props.result.signals
  const ns = props.result.horizons
  const series = sigs.map((s, i) => ({
    name: s.displayName,
    type: 'bar',
    data: ns.map(n => {
      const v = barValue(s, n, barMetric.value)
      if (v === null || v === undefined) return null
      if (PCT_METRICS.has(barMetric.value)) return Number((v * 100).toFixed(2))
      if (RATIO_METRICS.has(barMetric.value)) return Number(v.toFixed(2))
      return Number(v.toFixed(4))
    }),
    itemStyle: { color: SIG_COLORS[i % SIG_COLORS.length] },
  }))
  chart.setOption({
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis' },
    legend: { textStyle: { color: '#94a3b8' }, top: 0 },
    grid: { left: 44, right: 16, top: 32, bottom: 28 },
    xAxis: { type: 'category', data: ns.map(n => `${n}`), axisLabel: { color: '#94a3b8' }, axisLine: { lineStyle: { color: 'rgba(148,163,184,0.4)' } } },
    yAxis: { type: 'value', axisLabel: { color: '#94a3b8' }, splitLine: { lineStyle: { color: 'rgba(148,163,184,0.12)' } } },
    series,
  }, true)
}

// ---------------- 分布图 ----------------
const distEl = ref(null)
const distGroup = ref('dd')
const distStat = ref('avg')
const DD_STATS = [
  { value: 'avg', label: '回撤均值' },
  { value: 'median', label: '回撤中位' },
  { value: 'max', label: '回撤最大' },
]
const VOL_STATS = [
  { value: 'pooled', label: '池化波动' },
  { value: 'avg', label: '波动均值' },
  { value: 'median', label: '波动中位' },
  { value: 'max', label: '波动最大' },
]

function renderDist() {
  const el = distEl.value
  if (!el || !props.result) return
  const chart = echarts.getInstanceByDom(el) || echarts.init(el)
  const sigs = props.result.signals
  const ns = props.result.horizons
  const pick = (s, n) => {
    const h = s?.horizons?.[String(n)]
    if (!h || h.insufficient) return null
    const obj = distGroup.value === 'dd' ? h.maxDrawdown : h.volatility
    let v = obj?.[distStat.value]
    if (typeof v !== 'number') return null
    return distGroup.value === 'dd' ? Number((v * 100).toFixed(2)) : Number(v.toFixed(4))
  }
  const series = sigs.map((s, i) => ({
    name: s.displayName,
    type: 'bar',
    data: ns.map(n => pick(s, n)),
    itemStyle: { color: SIG_COLORS[i % SIG_COLORS.length] },
  }))
  chart.setOption({
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis' },
    legend: { textStyle: { color: '#94a3b8' }, top: 0 },
    grid: { left: 44, right: 16, top: 32, bottom: 28 },
    xAxis: { type: 'category', data: ns.map(n => `${n}根`), axisLabel: { color: '#94a3b8' }, axisLine: { lineStyle: { color: 'rgba(148,163,184,0.4)' } } },
    yAxis: { type: 'value', axisLabel: { color: '#94a3b8' }, splitLine: { lineStyle: { color: 'rgba(148,163,184,0.12)' } } },
    series,
  }, true)
}

const SIG_COLORS = ['#3b82f6', '#f59e0b', '#22c55e', '#a855f7', '#ef4444', '#06b6d4', '#f97316', '#84cc16']

// 打开 / 数据变化时渲染
watch(() => props.visible, (v) => {
  if (v) {
    centerFrame()
    nextTick(() => {
      renderBar()
      renderDist()
    })
  } else {
    // 关闭时释放实例（teleport 卸载 DOM）
    ;[barEl.value, distEl.value].forEach(el => {
      if (el) echarts.getInstanceByDom(el)?.dispose()
    })
  }
})
watch(() => props.result, () => {
  if (props.visible) {
    nextTick(() => {
      renderBar()
      renderDist()
    })
  }
})

onBeforeUnmount(() => {
  ;[barEl.value, distEl.value].forEach(el => {
    if (el) echarts.getInstanceByDom(el)?.dispose()
  })
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
})
</script>

<style scoped>
.saq-mask {
  position: fixed;
  inset: 0;
  z-index: 1500;
  background: rgba(4, 8, 18, 0.55);
  backdrop-filter: blur(2px);
}
.saq-frame {
  position: fixed;
  display: flex;
  flex-direction: column;
  border: 1px solid rgba(59, 130, 246, 0.35);
  border-radius: 10px;
  background: #0f1524;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
  overflow: hidden;
  min-width: 680px;
  min-height: 440px;
}
.saq-titlebar {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: linear-gradient(180deg, rgba(59, 130, 246, 0.16), rgba(59, 130, 246, 0.06));
  border-bottom: 1px solid rgba(59, 130, 246, 0.22);
  cursor: move;
  user-select: none;
  touch-action: none;
}
.saq-title {
  font-size: 14px;
  font-weight: 600;
  color: #e2e8f0;
}
.saq-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.saq-rt-switch {
  display: inline-flex;
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 6px;
  overflow: hidden;
  font-size: 12px;
  cursor: pointer;
  user-select: none;
}
.saq-rt-switch span {
  padding: 2px 10px;
  color: #94a3b8;
  transition: all 0.15s;
}
.saq-rt-switch span.active {
  background: rgba(59, 130, 246, 0.85);
  color: #fff;
  font-weight: 600;
}
.saq-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.saq-errors { display: flex; flex-direction: column; gap: 4px; }
.saq-error {
  font-size: 12px;
  color: #f87171;
  background: rgba(239, 68, 68, 0.08);
  border: 1px solid rgba(239, 68, 68, 0.2);
  border-radius: 6px;
  padding: 6px 8px;
  word-break: break-all;
}
.saq-block {
  border: 1px solid rgba(59, 130, 246, 0.22);
  border-radius: 8px;
  padding: 10px 12px;
  background: rgba(59, 130, 246, 0.05);
}
.saq-sub-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.saq-sub-title { font-size: 13px; font-weight: 600; color: #93c5fd; margin-right: auto; }
.saq-hint { font-size: 11px; color: #64748b; }
.saq-echart { height: 240px; width: 100%; }
.saq-echart-lg { height: 340px; }

.saq-table-scroll { overflow: auto; max-height: 320px; }
.saq-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.saq-table th, .saq-table td {
  border: 1px solid rgba(148, 163, 184, 0.14);
  padding: 5px 8px;
  text-align: center;
  color: #cbd5e1;
  white-space: nowrap;
}
.saq-table thead th { background: rgba(59, 130, 246, 0.08); color: #93c5fd; font-weight: 600; position: sticky; top: 0; z-index: 1; }
.saq-table .th-sig { border-left: 2px solid rgba(59, 130, 246, 0.3); }
.saq-table .td-n { font-weight: 600; color: #e2e8f0; }
.saq-table tbody td.pos { color: #f87171; }
.saq-table tbody td.neg { color: #34d399; }
.saq-note { font-size: 11px; color: #64748b; margin-top: 6px; }

/* 右下角缩放手柄 */
.saq-resize {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 26px;
  height: 26px;
  cursor: nwse-resize;
  touch-action: none;
  z-index: 5;
}
.saq-resize::after {
  content: '';
  position: absolute;
  right: 3px;
  bottom: 3px;
  width: 16px;
  height: 16px;
  background: linear-gradient(135deg, transparent 50%, rgba(148, 163, 184, 0.75) 50%);
  border-bottom-right-radius: 10px;
  transition: background 0.15s;
}
.saq-resize:hover::after {
  background: linear-gradient(135deg, transparent 50%, rgba(96, 165, 250, 0.95) 50%);
}

</style>

<style>
/* 下拉浮层必须高于弹窗遮罩（teleport 到 body，scoped 样式管不到，单独非 scoped 块） */
.el-select__popper,
.el-popper.el-select__popper {
  z-index: 4000 !important;
}
</style>

