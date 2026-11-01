// ============================================================================
// RSI 系列指标
// 1. RSI（补丁版）：klinecharts 内置 RSI 计算存在 bug，此处用 technicalindicators
//    库的 RSI.calculate 作为补丁，动态生成各周期图形
// ============================================================================
import { registerIndicator } from 'klinecharts'
import { RSI } from 'technicalindicators'

// ---------- RSI（补丁） ----------
registerIndicator({
  name: 'RSI',
  shortName: 'RSI',
  series: 'price',
  calcParams: [6, 12, 24],
  precision: 2,
  figures: [],
  calc: (dataList, indicator) => {
    const periods = indicator.calcParams
    const closePrices = dataList.map(item => item.close)
    const total = dataList.length

    // 初始化结果数组，所有位置初始为 null
    const results = Array(total).fill().map(() => ({ rsi1: null, rsi2: null, rsi3: null }))
    indicator.figures = [] // 清空原有图形定义
    periods.forEach((period, idx) => {
      // 计算 RSI，返回值长度 = total - period
      const rsiValues = RSI.calculate({ period, values: closePrices })
      const key = `rsi${idx + 1}`
      // 从 period 索引开始填充
      for (let i = 0; i < rsiValues.length; i++) {
        results[period + i][key] = rsiValues[i]
      }
      indicator.figures.push(
        { key: `rsi${idx + 1}`, title: `RSI${idx + 1}: `, type: 'line' }
      )
    })

    return results
  }
})


