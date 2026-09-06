// ============================================================================
// 相对高低点系列指标（基于 EMA 拐点识别）
// 1. Relative high and low points（HL）：同时输出高/低点阶梯线
// 2. RelativeHighPoints：仅高点阶梯线，支持多组 (period, step) 参数
// 3. RelativeLowPoints：仅低点阶梯线，支持多组 (period, step) 参数
// ============================================================================
import { registerIndicator } from 'klinecharts'
import { EMA } from 'technicalindicators'

// ---------- 相对高低点（HL） ----------
registerIndicator({
  name: 'Relative high and low points',
  shortName: 'HL',
  series: 'price',
  calcParams: [1, 5],            // [周期, step]
  precision: 2,
  figures: [],
  calc: (dataList, indicator) => {
    const period = indicator.calcParams[0] ?? 1
    const step = indicator.calcParams[1] ?? 5
    const highs = dataList.map(d => d.high)
    const lows = dataList.map(d => d.low)
    const total = dataList.length

    // ----- EMA -----
    const HighEMA = EMA.calculate({ period, values: highs })
    const LowEMA = EMA.calculate({ period, values: lows })
    // ----- 找出全部拐点（不分 len） -----
    const highPivots = []  // { index, price }
    const lowPivots = []
    for (let i = 2; i < total; i++) {
      // 高点
      if (HighEMA[i - 2] <= HighEMA[i - 1] && HighEMA[i - 1] >= HighEMA[i]) {
        const start = Math.max(0, i - step)
        const maxHigh = Math.max(...highs.slice(start, i + 1))
        highPivots.push({ index: i, price: maxHigh })
      }
      // 低点
      if (LowEMA[i - 2] >= LowEMA[i - 1] && LowEMA[i - 1] <= LowEMA[i]) {
        const start = Math.max(0, i - step)
        const minLow = Math.min(...lows.slice(start, i + 1))
        lowPivots.push({ index: i, price: minLow })
      }
    }

    // ----- 生成折线数组（每个时点当前有效的价格） -----
    const buildLine = (pivots) => {
      const line = new Array(total).fill(null)
      if (pivots.length === 0) return line

      let pivIdx = 0
      let currentPrice = null
      for (let i = 0; i < total; i++) {
        // 如果到了新极点，更新价格
        if (pivIdx < pivots.length && i >= pivots[pivIdx].index) {
          currentPrice = pivots[pivIdx].price
          pivIdx++
        }
        line[i] = currentPrice
      }
      return line
    }

    const highLine = buildLine(highPivots)   // 高点折线值
    const lowLine = buildLine(lowPivots)     // 低点折线值

    // ----- 结果数组 -----
    const results = new Array(total)
    for (let i = 0; i < total; i++) {
      results[i] = {}
    }

    // 清空 figures
    indicator.figures.splice(0, indicator.figures.length)

    const highKey = 'high'
    const lowKey = 'low'

    // 填充数据
    for (let i = 0; i < total; i++) {
      results[i][highKey] = highLine[i]
      results[i][lowKey] = lowLine[i]
    }

    // 图形定义
    indicator.figures.push({
      key: highKey,
      title: '高: ',
      type: 'line',
      styles: () => ({ color: '#E57373', size: 1 })
    })
    indicator.figures.push({
      key: lowKey,
      title: '低: ',
      type: 'line',
      styles: () => ({ color: '#81C784', size: 1 })
    })

    return results
  }
})

// ---------- 相对高点（HighPts，支持多组参数） ----------
registerIndicator({
  name: 'RelativeHighPoints',
  shortName: 'HighPts',
  series: 'price',
  calcParams: [1, 5],
  precision: 2,
  figures: [],
  calc: (dataList, indicator) => {
    const params = indicator.calcParams
    const groupCount = Math.floor(params.length / 2)
    const highs = dataList.map(d => d.high)
    const total = dataList.length

    indicator.figures.splice(0, indicator.figures.length)
    const results = new Array(total)
    for (let i = 0; i < total; i++) results[i] = {}

    for (let g = 0; g < groupCount; g++) {
      const period = params[g * 2] ?? 1
      const step = params[g * 2 + 1] ?? 5

      const HighEMA = EMA.calculate({ period, values: highs })
      const highPivots = []
      for (let i = 2; i < total; i++) {
        if (HighEMA[i] == null) continue
        if (HighEMA[i - 2] <= HighEMA[i - 1] && HighEMA[i - 1] >= HighEMA[i]) {
          const start = Math.max(0, i - step)
          const maxHigh = Math.max(...highs.slice(start, i + 1))
          highPivots.push({ index: i, price: maxHigh })
        }
      }

      const line = new Array(total).fill(null)
      if (highPivots.length > 0) {
        let pivIdx = 0, currentPrice = null
        for (let i = 0; i < total; i++) {
          if (pivIdx < highPivots.length && i >= highPivots[pivIdx].index) {
            currentPrice = highPivots[pivIdx].price
            pivIdx++
          }
          line[i] = currentPrice
        }
      }

      const key = `high_${g + 1}`
      for (let i = 0; i < total; i++) results[i][key] = line[i]

      const colors = ['#E57373', '#EF5350', '#F44336', '#E53935', '#D32F2F']
      indicator.figures.push({
        key,
        title: `高${g + 1} (${period},${step})`,
        type: 'line',
        styles: () => ({ color: colors[g % colors.length], size: 1 })
      })
    }
    return results
  }
})

// ---------- 相对低点（LowPts，支持多组参数） ----------
registerIndicator({
  name: 'RelativeLowPoints',
  shortName: 'LowPts',
  series: 'price',
  calcParams: [1, 5],
  precision: 2,
  figures: [],
  calc: (dataList, indicator) => {
    const params = indicator.calcParams
    const groupCount = Math.floor(params.length / 2)
    const lows = dataList.map(d => d.low)
    const total = dataList.length

    indicator.figures.splice(0, indicator.figures.length)
    const results = new Array(total)
    for (let i = 0; i < total; i++) results[i] = {}

    for (let g = 0; g < groupCount; g++) {
      const period = params[g * 2] ?? 1
      const step = params[g * 2 + 1] ?? 5

      const LowEMA = EMA.calculate({ period, values: lows })
      const lowPivots = []
      for (let i = 2; i < total; i++) {
        if (LowEMA[i] == null) continue
        if (LowEMA[i - 2] >= LowEMA[i - 1] && LowEMA[i - 1] <= LowEMA[i]) {
          const start = Math.max(0, i - step)
          const minLow = Math.min(...lows.slice(start, i + 1))
          lowPivots.push({ index: i, price: minLow })
        }
      }

      const line = new Array(total).fill(null)
      if (lowPivots.length > 0) {
        let pivIdx = 0, currentPrice = null
        for (let i = 0; i < total; i++) {
          if (pivIdx < lowPivots.length && i >= lowPivots[pivIdx].index) {
            currentPrice = lowPivots[pivIdx].price
            pivIdx++
          }
          line[i] = currentPrice
        }
      }

      const key = `low_${g + 1}`
      for (let i = 0; i < total; i++) results[i][key] = line[i]

      const colors = ['#81C784', '#66BB6A', '#4CAF50', '#43A047', '#388E3C']
      indicator.figures.push({
        key,
        title: `低${g + 1} (${period},${step})`,
        type: 'line',
        styles: () => ({ color: colors[g % colors.length], size: 1 })
      })
    }
    return results
  }
})
