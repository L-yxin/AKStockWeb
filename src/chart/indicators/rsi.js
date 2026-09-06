// ============================================================================
// RSI 系列指标
// 1. RSI（补丁版）：klinecharts 内置 RSI 计算存在 bug，此处用 technicalindicators
//    库的 RSI.calculate 作为补丁，动态生成各周期图形
// 2. RSISpeedWithAcc：RSI 速度（一阶差分）与加速度（二阶差分）
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

// ---------- RSI 速度与加速度 ----------
registerIndicator({
  name: 'RSISpeedWithAcc',
  shortName: 'RSI S&A',
  series: 'price',
  calcParams: [14],         // RSI周期，默认14
  precision: 2,
  figures: [
    { key: 'speed', title: '速度: ', type: 'line' },
    { key: 'acc',   title: '加速度: ', type: 'line' }
  ],
  calc: (dataList, indicator) => {
    const period = indicator.calcParams[0]        // RSI周期
    const closePrices = dataList.map(item => item.close)
    const total = dataList.length

    const results = Array(total).fill().map(() => ({ speed: null, acc: null }))
    if (total === 0) return results

    // ---------- 1. 计算 RSI 序列 ----------
    const rsi = Array(total).fill(null)
    if (total > period) {
      let gains = 0, losses = 0

      // 计算初始平均涨跌幅（前 period 根K线）
      for (let i = 1; i <= period; i++) {
        const change = closePrices[i] - closePrices[i - 1]
        if (change >= 0) gains += change
        else losses -= change
      }
      let avgGain = gains / period
      let avgLoss = losses / period
      let rs = avgLoss === 0 ? Infinity : avgGain / avgLoss
      rsi[period] = 100 - 100 / (1 + rs)

      // 递归计算后续 RSI（Wilder 平滑）
      for (let i = period + 1; i < total; i++) {
        const change = closePrices[i] - closePrices[i - 1]
        const gain = change > 0 ? change : 0
        const loss = change < 0 ? -change : 0
        avgGain = (avgGain * (period - 1) + gain) / period
        avgLoss = (avgLoss * (period - 1) + loss) / period
        rs = avgLoss === 0 ? Infinity : avgGain / avgLoss
        rsi[i] = 100 - 100 / (1 + rs)
      }
    }

    // ---------- 2. 计算速度（RSI 的一阶差分） ----------
    const speed = Array(total).fill(null)
    for (let i = 1; i < total; i++) {
      if (rsi[i] !== null && rsi[i - 1] !== null) {
        speed[i] = rsi[i] - rsi[i - 1]
      }
    }

    // ---------- 3. 计算加速度（速度的一阶差分） ----------
    const acc = Array(total).fill(null)
    for (let i = 2; i < total; i++) {
      if (speed[i] !== null && speed[i - 1] !== null) {
        acc[i] = speed[i] - speed[i - 1]
      }
    }

    // 填充结果
    for (let i = 0; i < total; i++) {
      results[i].speed = speed[i]
      results[i].acc = acc[i]
    }

    return results
  }
})
