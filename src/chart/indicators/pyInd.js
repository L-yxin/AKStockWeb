// ============================================================================
// pyInd Python 指标（K线叠加）
// 数据由 Python 后端（Indicator 目录 + FastAPI /api/pyInd/{name}.js）计算并缓存，
// 前端 fetch JS 后取 window.__pyInd：
//   - 单线：data: [{timestamp, value}, ...]
//   - 多线：lines: [{key, title, data:[{timestamp, value}]}, ...]（如 platform_box 上下沿）
// 动态注册 klinecharts 指标 pyInd_<name> 按时间戳对齐到 K 线展示。
// ============================================================================
import { registerIndicator } from 'klinecharts'
import { fetchPyIndicatorJs } from '@/api'
import { useSearchParametersStore } from '@/stores/searchParameters'

// 数据缓存：key(`${name}|${params}|${code}|${period}|${adjust}`) -> {lines:[{key,title,map}]}
const dataCache = new Map()
// 已注册的指标模板名（registerIndicator 为全局注册，同名只注册一次）
const registeredNames = new Set()
const MAX_CACHE = 32;
function cachePut(key, value) {
  dataCache.set(key, value)
  if (dataCache.size > MAX_CACHE) {
    const firstKey = dataCache.keys().next().value
    dataCache.delete(firstKey)
  }
}
// 多线配色盘（单线仍用按名哈希色）
const PALETTE = ['#FFB74D', '#4FC3F7', '#81C784', '#BA68C8', '#FF8A65', '#4DD0E1', '#AED581', '#F06292']

// 按指标名生成稳定颜色
function colorOf(name) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360
  return `hsl(${h}, 70%, 55%)`
}

function makeTemplate(name, lineKeys) {
  const color = colorOf(name)
  // 注册模板时即确定分线（fetch 完成后线数已知）：单线用按名哈希色，多线用调色盘
  const keys = lineKeys && lineKeys.length ? lineKeys : ['value']
  const figures = keys.map((k, i) => ({
    key: k,
    title: k === 'value' ? name : k,
    type: 'line',
    styles: () => ({ color: keys.length > 1 ? PALETTE[i % PALETTE.length] : color, size: 1 })
  }))
  return {
    name: `pyInd_${name}`,
    shortName: name,
    series: 'normal',   // 创建实例时按主图/副图覆盖（主图 price / 副图 normal）
    precision: 6,
    figures,
    calc: (dataList, indicator) => {
      const entry = dataCache.get(indicator.calcParams?.[0])
      if (!entry || !entry.lines?.length) return dataList.map(() => ({ value: null }))
      const lines = entry.lines
      // 按数据量级动态设置显示精度：斜率/比率类小数值（如 1e-4）自动提高小数位，
      // 避免 tooltip / 刻度把 0.000245 显示成 0
      let maxAbs = 0
      lines.forEach(ln => ln.map.forEach(v => {
        const a = Math.abs(v)
        if (a > maxAbs) maxAbs = a
      }))
      if (maxAbs >= 100) indicator.precision = 2
      else if (maxAbs >= 1) indicator.precision = 4
      else if (maxAbs >= 0.01) indicator.precision = 6
      else if (maxAbs >= 0.0001) indicator.precision = 8
      else indicator.precision = 10
      return dataList.map(d => {
        const out = {}
        lines.forEach(ln => { out[ln.key] = ln.map.get(d.timestamp) ?? null })
        return out
      })
    }
  }
}

/**
 * 应用（或刷新）一个 Python 指标到图表。
 * @param {object} chart klinecharts 实例
 * @param {{name:string, params?:number[], data?:string, onMainChart?:boolean,
 *          code:string, period?:string, adjust?:string, refresh?:boolean}} cfg
 *        data 数据源表达式：基本数据单词（close/high/low/open/volume/amount）或
 *        复合序列表达式（percent_change_nb(talib.MA(close,5)) 等）；缺省走后端默认列
 * @returns {Promise<string|null>} 指标实例名（失败返回 null）
 */
export async function applyPyIndicator(chart, { name, params = [], data = '', onMainChart = false, code, period = '1d', adjust = 'none', refresh = false }) {
  if (!chart || !name) return null
  const paramsStr = (Array.isArray(params) ? params : [])
    .map(v => v === true ? '1' : v === false ? '0' : v)
    .join(',')
  const store = useSearchParametersStore()
  const symbolAtStart = code
  const startKey = store.startDate || ''
  const endKey = store.endDate || ''
  const key = `${name}|${data}|${paramsStr}|${code}|${period}|${adjust}|${startKey}|${endKey}`
  const jsText = await fetchPyIndicatorJs(name, paramsStr, {
    code, period, adjust, data, refresh: refresh ? 1 : 0,
    start: store.startDate || '', end: store.endDate || '',
  })
  // 股票已切换：丢弃过期响应，避免旧股票指标渲染到新图表
  if (symbolAtStart !== store.symbol) return null
  // 执行 JS（后端仅生成 window.__pyInd 赋值，受控内容）
  const exec = new Function('window', jsText)
  exec(window)
  const raw = window.__pyInd || {}
  // 统一为 lines 结构：单线 data → [{key:'value', map}]；多线 lines → 各线 map
  const lines = []
  if (Array.isArray(raw.lines) && raw.lines.length) {
    raw.lines.forEach(ln => {
      const map = new Map()
      ;(ln.data || []).forEach(d => { if (d && d.value != null) map.set(d.timestamp, d.value) })
      lines.push({ key: ln.key || 'value', title: ln.title || ln.key || name, map })
    })
  } else if (Array.isArray(raw.data)) {
    const map = new Map()
    raw.data.forEach(d => { if (d && d.value != null) map.set(d.timestamp, d.value) })
    lines.push({ key: 'value', title: name, map })
  }
  cachePut(key, { lines })

  const indName = `pyInd_${name}`
  if (!registeredNames.has(indName)) {
    registerIndicator(makeTemplate(name, lines.map(ln => ln.key)))
    registeredNames.add(indName)
  }
  // 同指标已存在（参数/主副图变化）→ 先移除再重建，确保 calcParams 更新生效
  try { chart.removeIndicator({ name: indName }) } catch (e) { /* 不存在忽略 */ }
  const paneId = onMainChart ? 'candle_pane' : `${indName}_pane`
  // 系列按展示位置选择（官方 API）：主图叠加 price（与K线价格同轴），
  // 副图 normal（使用指标自身精度、独立缩放，小数值指标也能展开显示波动）
  const res = chart.createIndicator(
    { name: indName, calcParams: [key], series: onMainChart ? 'price' : 'normal' },
    onMainChart,
    onMainChart ? { id: paneId } : { id: paneId, height: 160 }
  )
  return res ? indName : null
}

/** 移除 Python 指标 */
export function removePyIndicator(chart, name) {
  if (!chart || !name) return
  try { chart.removeIndicator({ name: `pyInd_${name}` }) } catch (e) { /* ignore */ }
}
