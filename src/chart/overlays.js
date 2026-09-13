// ============================================================================
// 自定义覆盖图注册（副作用模块，引入即注册）
// 1. simpleAnnotation2：买卖信号注解（方向线 + 彩色标签），支持同时间戳多信号错位偏移
// 2. textTip：黄色文字标注
// ============================================================================
import { registerOverlay } from 'klinecharts'

registerOverlay({
  name: 'simpleAnnotation2',
  needDefaultPointFigure: true,
  lock: true,
  totalStep: 1,
  createPointFigures: function (param) {
    const { overlay, coordinates, chart } = param

    const point = overlay.points[0]
    let kline = null
  if (chart && point.timestamp != null) {
    const dataList = chart.getDataList()                       
    const idx = dataList.findIndex(d => d.timestamp === point.timestamp)
    if (idx !== -1) kline = dataList[idx]
  }

    const market = point.market
    const type = overlay.extendData
    const direction = point.direction || 1
    const basePrice = kline ? direction===1 ? kline.low : kline.high : point.value
  
    const getColor = (market, type) => {
      if (market === 'stock') {
        if (type === 'B' || type === '买') return '#ef5350'
        if (type === 'S' || type === '卖') return '#26a69a'
        if (type === 'T') return '#42a5f5'
      } else if (market === 'futures') {
        if (type === 'L' || type === '多开') return '#ef5350'
        if (type === 'S' || type === '空开') return '#26a69a'
        if (type === 'CL' || type === '多平') return '#42a5f5'
        if (type === 'CS' || type === '空平') return '#ffa726'
      } else if (market === 'predict') {
        if (type === 'BULL' || type === '多') return '#ef5350'
        if (type === 'BEAR' || type === '空') return '#26a69a'
      }
      return '#888888'
    }

    const color = getColor(market, type)

    return [
      {
        key: 'line',
        type: 'line',
        attrs: {
          coordinates: [
            chart.convertToPixel({ timestamp: point.timestamp, value: basePrice+(-direction * 0.01 * basePrice) }),
            chart.convertToPixel({ timestamp: point.timestamp, value: basePrice+(-direction * 0.05 * basePrice) })
          ]
        },
        styles: {
          style: 'dashed',
          color: color,
          size: 1.8,
          dashedValue: [3, 3]
        }
      },
      {
        key: 'text',
        type: 'text',
        attrs: {
          x: chart.convertToPixel({ timestamp: point.timestamp, value: basePrice+(-direction * 0.05 * basePrice) }).x,
          y: chart.convertToPixel({ timestamp: point.timestamp, value: basePrice+(-direction * 0.05 * basePrice) }).y,
          text: overlay.extendData || '',
          align: 'center',
          baseline: 'middle'
        },
        styles: {
          color: '#ffffff',
          size: 12,
          weight: 'bold',
          backgroundColor: color,
          paddingLeft: 8,
          paddingRight: 8,
          paddingTop: 4,
          paddingBottom: 4,
          borderRadius: 4,
        }
      }
    ]
  }
})

registerOverlay({
  name: 'textTip',
  totalStep: 1,              // 只需在第一步点下就完成
  lock: true,                // 锁定，禁止用户交互修改
  createPointFigures: ({ coordinates, overlay }) => {
    // 从 extendData 中取出要显示的文字，没有则用默认值
    const text = overlay.extendData?.text ?? '标注'

    return {
      type: 'text',
      attrs: {
        x: coordinates[0].x,
        y: coordinates[0].y,
        text: text
      },
      styles: {
        style: 'stroke',
        color: '#FFF600',     // 黄色
        size: 12,
        weight: 'normal',
        family: 'Arial'
      }
    }
  }
})
