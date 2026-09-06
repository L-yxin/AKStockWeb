// ============================================================================
// VolumeNewLowDays 指标
// 统计当前成交量距上一次更低成交量之间的天数（回看窗口可配）
// ============================================================================
import { registerIndicator } from 'klinecharts'

registerIndicator({
  name: 'VolumeNewLowDays',
  shortName: 'VolNLD',
  series: 'VolumeNewLowDays',
  calcParams: [400],            // [max_lookback]，0=回看全部历史
  precision: 0,
  figures: [
    {
      key: 'days',
      title: '距上次更低量的天数',
      type: 'line',
      styles: () => ({ color: '#FF5722', size: 1 })
    },
  ],
  calc: (dataList, indicator) => {
    const maxLookback = indicator.calcParams[0] ?? 400
    const volumes = dataList.map(d => d.volume)
    const total = dataList.length
    const results = new Array(total)

    for (let i = 0; i < total; i++) {
      if (i === 0) {
        results[i] = { days: 0 } // 第一根无前序数据
        continue
      }

      // 窗口起点：maxLookback<=0 回看全部
      const start = maxLookback <= 0 ? 0 : Math.max(0, i - maxLookback)

      // 从 i-1 往前找第一个小于 volumes[i] 的位置
      let days = -1 // 初始-1表示未找到
      for (let j = i - 1; j >= start; j--) {
        if (volumes[j] < volumes[i]) {
          days = i - j // 距离当前的天数
          break
        }
      }

      // 如果未找到（即当前值是窗口内最低），则返回窗口长度（即创了窗口长度那么多天的新低）
      if (days === -1) {
        days = i - start // 窗口内所有值都大于等于当前，相当于创了 (i-start) 天新低
        // 若回看全部且找不到，则 days = i（即从第0根到现在的总天数）
      }

      results[i] = { days }
    }
    return results
  }
})
