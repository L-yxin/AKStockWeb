// ============================================================================
// 交易信号标记逻辑（分组隔离）
// - 各功能（买卖提示 ls / pybroker订单 trades / 信号分析 sa / 模拟交易 sim）
//   通过 groupId 相互独立，开启/清除互不影响；股票切换等场景可全清
// - mesMap：按时间戳存储信号消息（含分组），供图表 Tooltip 展示
// - addMarkers / clearAllMarkers：向图表添加/清除信号注解覆盖图（支持按组）
// - getMarkers：导出当前标记列表（供信号质量评测面板导入）
// ============================================================================

// 按时间戳存储所有消息：[{ group, mes }]
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
    if (type === 'NEUTRAL' || type === '中性') return 1
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
  predict: new Set(['BULL', 'BEAR', 'NEUTRAL', '多', '空', '中性'])
}

// 对外暴露的标记添加方法（group：标记分组，默认 'default'）
export function addMarkers(chartInstance, configs, market = 'stock', group = 'default') {
  if (!chartInstance) return

  const types = SUPPORTED_TYPES[market]
  if (!types) throw new Error('unsupported market')

  const fullConfigs = configs.map(c => ({ ...c, market }))
  const processed = prepareMarkersWithOffset(fullConfigs)

  for (const config of processed) {
    const { timestamp, value, mes, type, _offsetIndex, _totalInGroup, _direction } = config
    if (!types.has(type)) throw new Error(`unsupported type: ${type}`)

    // 存入消息 Map（带分组）
    if (!mesMap.has(timestamp)) mesMap.set(timestamp, [])
    const arr = mesMap.get(timestamp)
    if (!arr.some(x => x.group === group && x.mes === mes)) arr.push({ group, mes })

    chartInstance.createOverlay({
      name: 'simpleAnnotation2',
      groupId: group,
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

// 清除标记：group 为空 → 全清（股票切换等场景）；group 有值 → 仅清该组（各功能相互独立）
export function clearAllMarkers(chartInstance, group) {
  if (!chartInstance) return
  if (group == null) {
    mesMap.clear()
    chartInstance.removeOverlay()
    return
  }
  // 按分组精确删除（klinecharts removeOverlay 支持 OverlayFilter 按 groupId 过滤）
  chartInstance.removeOverlay({ groupId: group })
  for (const [ts, arr] of mesMap) {
    const rest = arr.filter(x => x.group !== group)
    if (rest.length) mesMap.set(ts, rest)
    else mesMap.delete(ts)
  }
}

// 导出当前全部标记（供“导入图表信号”使用）
export function getMarkers() {
  return Array.from(mesMap.keys()).map(timestamp => {
    return {
      timestamp,
      messages: (mesMap.get(timestamp) || []).map(x => x.mes)
    }
  })
}
