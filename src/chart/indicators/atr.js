// ============================================================================
// ATR（平均真实波幅）
// 用于衡量市场波动性。通常放在副图，支持同时传入多个周期（如 [14, 20]）。
// ============================================================================
import { ATR } from 'technicalindicators'
import { registerIndicator } from 'klinecharts'
registerIndicator({
  name: 'ATR',
  shortName: 'ATR',
  series: 'normal',    // 放在副图，独立坐标轴
  calcParams: [14],    // 默认周期 14，支持多周期传入如 [14, 20]
  precision: 2,
  figures: [],
  calc: (dataList, indicator) => {
    const periods = indicator.calcParams
    const highPrices = dataList.map(item => item.high)
    const lowPrices = dataList.map(item => item.low)
    const closePrices = dataList.map(item => item.close)
    const total = dataList.length

    // 初始化结果数组
    const results = Array(total).fill().map(() => ({}))
    indicator.figures = [] // 清空原有图形定义

    // 多周期线条的颜色盘
    const colors = ['#FFB74D', '#4FC3F7', '#81C784', '#BA68C8', '#FF8A65']

    periods.forEach((period, idx) => {
      // 计算 ATR，返回值长度 = total - period
      const atrValues = ATR.calculate({
        high: highPrices,
        low: lowPrices,
        close: closePrices,
        period: period
      })

      const key = `atr${idx + 1}`

      // 从 period 索引开始填充（前 period 个为预热期，保持 null）
      for (let i = 0; i < atrValues.length; i++) {
        results[period + i][key] = atrValues[i]
      }

      // 动态添加线条定义
      indicator.figures.push({
        key: key,
        title: `ATR(${period}): `,
        type: 'line',
        styles: () => ({ color: colors[idx % colors.length], size: 1.5 })
      })
    })

    return results
  }
})