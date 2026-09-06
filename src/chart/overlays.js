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
    const { overlay, coordinates } = param
    const point = overlay.points[0]
    const market = point.market
    const type = overlay.extendData
    const offsetIndex = point.offsetIndex || 0
    const total = point.totalInGroup || 1
    const direction = point.direction || 2.5

    const centerX = coordinates[0].x
    const baseY = coordinates[0].y

    const offsetStep = 27
    const groupOffset = (offsetIndex - (total - 1) / 2) * offsetStep

    const baseStartDistance = 70
    const baseEndDistance = 10
    const extraOffset = 55 // 额外移动的距离
    const startDistance = baseStartDistance + extraOffset
    const endDistance = baseEndDistance + extraOffset

    const lineEndY = baseY + direction * endDistance
    const lineStartY = baseY + direction * startDistance + groupOffset

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
            { x: centerX, y: lineStartY },
            { x: centerX, y: lineEndY }
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
          x: centerX,
          y: lineStartY - direction * 6,
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
