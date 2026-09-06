// ============================================================================
// 交易信号标记逻辑
// - mesMap：按时间戳存储信号消息，供图表 Tooltip 展示
// - addMarkers / clearAllMarkers：向图表添加/清除信号注解覆盖图
// - getMarkers：导出当前标记列表（供信号质量评测面板导入）
// ============================================================================

// 按时间戳存储所有消息
export const mesMap = new Map()

// 标记方向与偏移处理（导出供信号评测面板判断多空）
export function getBaseDirection(market, type) {
  if (market === 'stock') {
    if (type === 'B' || type === '买') return 1
    if (type === 'S' || type === '卖') return -1
    if (type === 'T') return -1
  } else if (market === 'futures') {
    if (type === 'L' || type === '多开' || type === 'CS' || type === '空平') return 1
    if (type === 'S' || type === '空开' || type === 'CL' || type === '多平') return -1
  } else if (market === 'predict') {
    if (type === 'BULL' || type === '多') return 1
    if (type === 'BEAR' || type === '空') return -1
  }
  return 1
}

function prepareMarkersWithOffset(configs) {
  const grouped = new Map()
  configs.forEach(cfg => {
    const ts = cfg.timestamp
    const dir = getBaseDirection(cfg.market || 'stock', cfg.type)
    const key = `${ts}_${dir}`
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key).push(cfg)
  })

  const processed = []
  grouped.forEach((items) => {
    items.forEach((item, index) => {
      processed.push({
        ...item,
        _offsetIndex: index,
        _totalInGroup: items.length,
        _direction: getBaseDirection(item.market || 'stock', item.type)
      })
    })
  })
  return processed
}

const SUPPORTED_TYPES = {
  stock: new Set(['B', 'S', 'T', '买', '卖']),
  futures: new Set(['L', 'S', 'CL', 'CS', '多开', '空开', '多平', '空平']),
  predict: new Set(['BULL', 'BEAR', '多', '空'])
}

// 对外暴露的标记添加方法
export function addMarkers(chartInstance, configs, market = 'stock') {
  if (!chartInstance) return

  const types = SUPPORTED_TYPES[market]
  if (!types) throw new Error('unsupported market')

  const fullConfigs = configs.map(c => ({ ...c, market }))
  const processed = prepareMarkersWithOffset(fullConfigs)

  for (const config of processed) {
    const { timestamp, value, mes, type, _offsetIndex, _totalInGroup, _direction } = config
    if (!types.has(type)) throw new Error(`unsupported type: ${type}`)

    // 存入消息 Map
    if (!mesMap.has(timestamp)) mesMap.set(timestamp, [])
    if (!mesMap.get(timestamp).includes(mes)) mesMap.get(timestamp).push(mes)

    chartInstance.createOverlay({
      name: 'simpleAnnotation2',
      extendData: type,
      points: [{
        timestamp,
        value,
        mes,
        market,
        offsetIndex: _offsetIndex,
        totalInGroup: _totalInGroup,
        direction: _direction
      }]
    })
  }
}

export function clearAllMarkers(chartInstance) {
  if (!chartInstance) return
  mesMap.clear()
  chartInstance.removeOverlay()
}

// 导出当前全部标记（供“导入图表信号”使用）
export function getMarkers() {
  return Array.from(mesMap.keys()).map(timestamp => {
    return {
      timestamp,
      messages: mesMap.get(timestamp) || []
    }
  })
}
