// ============================================================================
// pyInd Python 指标（K线叠加）
// 数据由 Python 后端（Indicator 目录 + FastAPI /api/pyInd/{name}.js）计算并缓存，
// 前端 fetch JS 后取 window.__pyInd.data（[{timestamp, value}, ...]），
// 动态注册 klinecharts 指标 pyInd_<name> 按时间戳对齐到 K 线展示。
// ============================================================================
import { registerIndicator } from 'klinecharts'
import { fetchPyIndicatorJs } from '@/api'

// 数据缓存：key(`${name}|${params}|${code}|${period}|${adjust}`) -> Map(timestamp -> value)
const dataCache = new Map()
// 已注册的指标模板名（registerIndicator 为全局注册，同名只注册一次）
const registeredNames = new Set()

// 按指标名生成稳定颜色
function colorOf(name) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360
  return `hsl(${h}, 70%, 55%)`
}

function makeTemplate(name) {
  const color = colorOf(name)
  return {
    name: `pyInd_${name}`,
    shortName: name,
    series: 'normal',   // 创建实例时按主图/副图覆盖（主图 price / 副图 normal）
    precision: 6,
    figures: [
      {
        key: 'value',
        title: name,
        type: 'line',
        styles: () => ({ color, size: 1 })
      }
    ],
    calc: (dataList, indicator) => {
      const vmap = dataCache.get(indicator.calcParams?.[0])
      if (!vmap) return dataList.map(() => ({ value: null }))
      // 按数据量级动态设置显示精度：斜率/比率类小数值（如 1e-4）自动提高小数位，
      // 避免 tooltip / 刻度把 0.000245 显示成 0
      let maxAbs = 0
      vmap.forEach(v => {
        const a = Math.abs(v)
        if (a > maxAbs) maxAbs = a
      })
      if (maxAbs >= 100) indicator.precision = 2
      else if (maxAbs >= 1) indicator.precision = 4
      else if (maxAbs >= 0.01) indicator.precision = 6
      else if (maxAbs >= 0.0001) indicator.precision = 8
      else indicator.precision = 10
      return dataList.map(d => ({ value: vmap.get(d.timestamp) ?? null }))
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
  const key = `${name}|${data}|${paramsStr}|${code}|${period}|${adjust}`

  const jsText = await fetchPyIndicatorJs(name, paramsStr, {
    code, period, adjust, data, refresh: refresh ? 1 : 0,
  })
  // 执行 JS（后端仅生成 window.__pyInd 赋值，受控内容）
  const exec = new Function('window', jsText)
  exec(window)
  const indData = window.__pyInd?.data || []
  const vmap = new Map()
  indData.forEach(d => { if (d && d.value != null) vmap.set(d.timestamp, d.value) })
  dataCache.set(key, vmap)

  const indName = `pyInd_${name}`
  if (!registeredNames.has(indName)) {
    registerIndicator(makeTemplate(name))
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
