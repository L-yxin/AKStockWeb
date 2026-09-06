// ============================================================================
// ContinuousChange 指标
// 统计阶梯线（相对高低点）连续上升/下降的阶梯数，支持回看窗口限制
// ============================================================================
import { registerIndicator } from 'klinecharts'
import { EMA } from 'technicalindicators'

/**
 * 统计阶梯线连续上升/下降的阶梯数（支持回看窗口限制）
 * @param {number[]} sequence - 阶梯线序列（含 null/undefined 表示无效）
 * @param {number} maxBacklook - 最大回看 K 线数（0=全部历史）
 * @returns {number[]}
 */
function continuousChange(sequence, maxBacklook = 0) {
  const n = sequence.length
  const out = new Array(n).fill(0)
  let lastValidIdx = -1          // 最近有效值的索引
  let prevVal = null             // 最近有效值
  let direction = 0              // 当前趋势方向：1上升，-1下降
  let count = 0                  // 当前计数值（带符号）

  for (let i = 0; i < n; i++) {
    const val = sequence[i]
    if (val == null) {
      out[i] = 0
      continue
    }

    // 判断是否需要重置（无前序或超出窗口）
    if (lastValidIdx === -1 || (maxBacklook > 0 && i - lastValidIdx > maxBacklook)) {
      // 新趋势开始，默认视为上升，计数为1
      count = 1
      direction = 1
      out[i] = count
      prevVal = val
      lastValidIdx = i
      continue
    }

    // 有前序且在窗口内
    if (val > prevVal) {
      if (direction === 1) {
        count++          // 延续上升
      } else {
        direction = 1    // 方向转升，重置计数为1
        count = 1
      }
    } else if (val < prevVal) {
      if (direction === -1) {
        count--          // 延续下降（绝对值增加）
      } else {
        direction = -1   // 方向转降，重置计数为-1
        count = -1
      }
    } else {
      // 相等，计数不变，方向不变
    }

    out[i] = count
    prevVal = val
    lastValidIdx = i
  }
  return out
}

registerIndicator({
  name: 'ContinuousChange',
  shortName: 'ContChg',
  series: 'price',
  // 参数顺序：[period, step, maxBacklook, type]
  // type: 0=低点 1=高点
  calcParams: [1, 5, 0, 0],
  precision: 0,
  figures: [
    {
      key: 'value',
      title: '连续变化数',
      type: 'line',
      styles: () => ({ color: '#FFB74D', size: 1 })
    }
  ],
  calc: (dataList, indicator) => {
    const params = indicator.calcParams
    const period = params[0] ?? 1
    const step = params[1] ?? 5
    const maxBacklook = params[2] ?? 0
    const type = params[3] ?? 0

    const priceArr = dataList.map(d => (type === 1 ? d.high : d.low))
    const total = dataList.length

    // ---- 计算 EMA ----
    const ema = EMA.calculate({ period, values: priceArr })

    // ---- 寻找拐点 ----
    const pivots = []
    for (let i = 2; i < total; i++) {
      if (ema[i] == null || ema[i - 1] == null || ema[i - 2] == null) continue
      const isHigh = (type === 1)
      const condition = isHigh
        ? (ema[i - 2] <= ema[i - 1] && ema[i - 1] >= ema[i])
        : (ema[i - 2] >= ema[i - 1] && ema[i - 1] <= ema[i])
      if (condition) {
        const start = Math.max(0, i - step)
        const slice = priceArr.slice(start, i + 1)
        const extreme = isHigh ? Math.max(...slice) : Math.min(...slice)
        pivots.push({ index: i, price: extreme })
      }
    }

    // ---- 构建阶梯线 ----
    const stepLine = new Array(total).fill(null)
    if (pivots.length > 0) {
      let pIdx = 0
      let current = null
      for (let i = 0; i < total; i++) {
        if (pIdx < pivots.length && i >= pivots[pIdx].index) {
          current = pivots[pIdx].price
          pIdx++
        }
        stepLine[i] = current
      }
    }

    // ---- 计算连续变化 ----
    const changes = continuousChange(stepLine, maxBacklook)

    // ---- 组装返回 ----
    const results = new Array(total)
    for (let i = 0; i < total; i++) {
      results[i] = { value: changes[i] }
    }
    return results
  }
})
