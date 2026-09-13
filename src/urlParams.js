// ============================================================================
// URL 参数处理（独立新增模块，不影响其他任何逻辑）
//
// 支持参数（全部可选，无参数时不做任何动作）：
//   code / symbol        标的代码，如 sh600000 / 600000.SH
//   adjust / adjust_type 复权类型：none | front | back
//   start / startDate    起始时间：YYYY-MM-DD 或 YYYY-MM-DD HH:mm:ss
//   end / endDate        结束时间：同上
//   indicators           K线技术指标：名称:参数 用 | 分隔，如 MA:5,10,20,60|VOL:5,10,20
//                        参数只能是数字 + 英文逗号（整数/小数均可）；
//                        只写名称不带参数时使用默认参数（indicatorDefaults）。
//   ls                   买卖提示指标：名称:参数 用 | 分隔。
//                        参数支持两种语法：
//                        ① 位置式（兼容）：数字,数字 按顺序填充 int/float 参数，
//                           如 ls=is_volume_price_sync:5,8
//                        ② 命名式：参数名=值;参数名=值，复合 Config 类型可直接传逗号串，
//                           如 ls=MACD金叉:macdconfig=12,16,8;onTheZeroAxis=1
//                              ls=均线向上:ma_periods=5,10,20,30
//                              ls=RSI超卖:rsi_periods=6,12,24,48;threshold=25
//                              ls=均线金叉:ma_pairs=5,10,10,20;afewDays=2  （ma_pairs 扁平数字两两成对）
//                        指标名匹配后台目录的 method 或 info；
//                        参数在校验时与后台目录定义比对（类型/个数/数值范围），
//                        不合格的指标跳过并给出警告。
//   trades               1 | true → 加载 pybroker 订单
//   cloud                1 | true → 仅刷新云指标（列表 + K线叠加缓存），不打开面板
//
// 示例：
//   http://localhost:5173/?code=sh600000&adjust=front&start=2024-01-01&end=2026-09-06
//     &indicators=MA:5,10,20,60|VOL:5,10,20&ls=MA金叉:5,10&trades=1&cloud=1
// ============================================================================
import {
  ws_buyingAndSellingIndicator_url,
  ws_getLongShortSignal_url,
  listCloudMetrics,
} from '@/api'
import { DEFAULT_PARAMS, MAIN_CHART_INDICATORS } from '@/config/indicatorDefaults'
import { refreshCloudMetrics } from '@/chart/indicators/cloudMetrics'

const truthy = (v) => v === '1' || v === 'true' || v === 'yes' || v === 'on'

// ---------- 通用解析 ----------

/** 日期字符串统一为 YYYY-MM-DD HH:mm:ss（与顶部选择器格式一致），非法返回 null */
function normalizeDateStr(s) {
  if (!s) return null
  const m = String(s).trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/)
  if (!m) return null
  const [, y, mo, d, hh = '00', mm = '00', ss = '00'] = m
  return `${y}-${mo}-${d} ${hh}:${mm}:${ss}`
}

/** 参数串必须为「数字,数字,…」格式（整数/小数 + 英文逗号），否则不合格 */
const PARAMS_RE = /^[\d.]+(,[\d.]+)*$/

/** 解析 K线技术指标：'MA:5,10,20,60|VOL:5,10,20' → [{name, calcParams, onMainChart}] */
function parseIndicators(raw) {
  if (!raw) return null
  const list = []
  for (const seg of raw.split('|')) {
    const s = seg.trim()
    if (!s) continue
    const [namePart, paramsPart] = s.split(':')
    const name = namePart.trim()
    if (!name) continue
    let calcParams = []
    if (paramsPart !== undefined && paramsPart.trim() !== '') {
      const p = paramsPart.trim()
      if (!PARAMS_RE.test(p)) {
        console.warn(`[URL] 技术指标 ${name} 参数不合法（仅允许数字+英文逗号）: ${p}`)
        continue
      }
      calcParams = p.split(',').map(Number)
    } else if (DEFAULT_PARAMS[name]) {
      // 未带参数 → 使用默认参数
      calcParams = [...DEFAULT_PARAMS[name]]
    } else {
      console.warn(`[URL] 技术指标 ${name} 未提供参数且无默认参数，已跳过`)
      continue
    }
    list.push({ name, calcParams, onMainChart: MAIN_CHART_INDICATORS.includes(name) })
  }
  return list.length ? list : null
}

/** 解析买卖提示原始段：'MA金叉:5,10|MACD死叉:macdconfig=12,16,8' → [{name, paramsRaw}] */
function parseLsParam(raw) {
  if (!raw) return []
  const out = []
  for (const seg of raw.split('|')) {
    const s = seg.trim()
    if (!s) continue
    const [namePart, ...rest] = s.split(':')
    const name = namePart.trim()
    if (!name) continue
    out.push({ name, paramsRaw: rest.join(':').trim() })
  }
  return out
}

/** 解析命名参数段：'macdconfig=12,16,8;onTheZeroAxis=1' → [{name, value}]；格式非法返回 null */
function parseNamedParams(seg) {
  if (!seg) return null
  const out = []
  for (const part of seg.split(';')) {
    const p = part.trim()
    if (!p) continue
    const eq = p.indexOf('=')
    if (eq <= 0) return null
    const name = p.slice(0, eq).trim()
    const value = p.slice(eq + 1).trim()
    if (!name || value === '') return null
    out.push({ name, value })
  }
  return out.length ? out : null
}

/** 按目录参数 annotation 校验并转换命名参数值；不合格返回 undefined */
function parseNamedValue(pname, v, annotation) {
  const a = annotation || ''
  // —— 复合 Config 类型（后端 pydantic 支持字符串/列表输入）——
  if (a.includes('Config')) {
    const m = a.match(/([\w]+Config)/)
    const clsName = m ? m[1] : ''
    if (clsName === 'MacdConfig') {
      // 恰 3 个整数：fastperiod,slowperiod,signalperiod → 字符串，后端自动解析
      if (!/^\d+(,\d+){2}$/.test(v)) return undefined
      return v
    }
    if (clsName === 'MaPeriodsConfig' || clsName === 'RsiConfig') {
      // 至少 1 个整数：逗号分隔周期列表 → 数字列表
      if (!/^\d+(,\d+)*$/.test(v)) return undefined
      return v.split(',').map(Number)
    }
    if (clsName === 'MaPairsConfig') {
      // 扁平数字两两成对：5,10,10,20 → [[5,10],[10,20]]（避开分号冲突）
      if (!/^\d+(,\d+)+$/.test(v)) return undefined
      const nums = v.split(',').map(Number)
      if (nums.length % 2 !== 0) return undefined
      const pairs = []
      for (let i = 0; i < nums.length; i += 2) pairs.push([nums[i], nums[i + 1]])
      return pairs
    }
    // 其他 Config：仅允许数字/逗号/分号字符，原样字符串透传
    if (!/^[\d.,;]+$/.test(v)) return undefined
    return v
  }
  // —— 基础类型 ——
  if (a.includes('int') || a.includes('float')) {
    if (!/^-?\d+(\.\d+)?$/.test(v)) return undefined
    return a.includes('int') ? parseInt(v, 10) : parseFloat(v)
  }
  if (a.includes('bool')) {
    if (v === '1' || v === 'true') return true
    if (v === '0' || v === 'false') return false
    return undefined
  }
  return undefined // 其他类型不接受 URL 值
}

// ---------- 买卖提示：目录加载 / 参数校验 / 提交（逻辑与 LongShortIndicatorPanel 一致） ----------

/** 判断是否为自动注入的参数（不需要用户配置）——与 LongShortIndicatorPanel 完全一致 */
const isAutoInjectedParam = (name, annotation) => {
  const autoNames = ['open_', 'high', 'low', 'close', 'volume', 'open', 'high', 'low', 'close', 'volume']
  if (autoNames.includes(name)) return true
  if (annotation && annotation.includes('ndarray')) {
    return autoNames.some(n => name.toLowerCase().includes(n))
  }
  return false
}

const getDefaultByType = (annotation) => {
  if (!annotation) return ''
  if (annotation.includes('int')) return 0
  if (annotation.includes('float')) return 0.0
  if (annotation.includes('bool')) return false
  if (annotation.includes('list') || annotation.includes('List')) return []
  if (annotation.includes('dict') || annotation.includes('Dict')) return {}
  return ''
}

const norm = (s) => String(s || '').replace(/\s+/g, '').toLowerCase()

/** 从后台 WS 拉取买卖指标目录（buy + sell 合并为数组） */
function loadIndicatorCatalog() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(ws_buyingAndSellingIndicator_url)
    ws.onopen = () => ws.send('')
    ws.onmessage = (e) => {
      try { resolve(e.data) } finally { ws.close() }
    }
    ws.onerror = (err) => { reject(err); ws.close() }
  }).then(raw => {
    const data = JSON.parse(raw)
    const convertToArray = (rawObj) => {
      const methods = rawObj.method || {}
      const infos = rawObj.info || {}
      const types = rawObj.type || {}
      const enableds = rawObj.enabled || {}
      const params = rawObj.params || {}
      return Object.keys(methods).map(key => ({
        method: methods[key],
        info: infos[key] || '',
        type: types[key] || '',
        enabled: enableds[key] || false,
        params: params[key] || { params: [], doc: '' }
      }))
    }
    return [...convertToArray(JSON.parse(data.buy)), ...convertToArray(JSON.parse(data.sell))]
  })
}

/** 后端 /ws/getLongShortSignal 严格要求 ISO 格式（%Y-%m-%dT%H:%M:%S.%fZ），
 *  仅提交时转换，不影响 store 中与其他功能一致的 YYYY-MM-DD HH:mm:ss 格式 */
function toBackendIso(s) {
  if (!s) return s
  const str = String(s).trim()
  const m = str.match(/^(\d{4}-\d{2}-\d{2})[T\s]+(\d{2}:\d{2}(?::\d{2})?)/)
  if (m) {
    const hm = m[2].length === 5 ? `${m[2]}:00` : m[2]
    return `${m[1]}T${hm}.000Z`
  }
  const d = str.match(/^\d{4}-\d{2}-\d{2}$/)
  if (d) return `${d[0]}T00:00:00.000Z`
  return str // 已是 ISO 或原样透传
}

/**
 * 买卖提示 URL 处理：
 * 1) 拉取后台指标目录
 * 2) 按 method/info 匹配指标名
 * 3) 参数校验并映射（支持两种语法）：
 *    - 命名式：参数名=值;参数名=值（值可为数字/逗号串/扁平对，Config 复合类型自动转换）
 *    - 位置式（兼容旧）：数字,数字 按顺序填充 int/float 参数
 * 4) 提交多空信号 → 打标记 + 存入 searchStore.longShortSignals
 */
async function applyLongShortFromUrl(raw, ctx) {
  const segs = parseLsParam(raw)
  if (!segs.length) return

  let catalog
  try {
    catalog = await loadIndicatorCatalog()
  } catch (e) {
    console.error('[URL] 买卖指标目录加载失败:', e)
    ElMessage.warning('URL 买卖提示：指标目录加载失败，已跳过')
    return
  }

  const enabledConfigs = []
  const skipped = []
  for (const { name, paramsRaw } of segs) {
    const item = catalog.find(it => norm(it.method) === norm(name) || norm(it.info) === norm(name))
    if (!item) {
      skipped.push(`${name}（目录中不存在）`)
      continue
    }
    // 用户可配置参数（非自动注入）
    const userParams = (item.params?.params || []).filter(p => !isAutoInjectedParam(p.name, p.annotation))
    if (!userParams.length) {
      // 无用户参数：直接启用（全部用后端默认）
      enabledConfigs.push({ method: item.method, type: item.type, info: item.info, params: {} })
      continue
    }

    const config = { method: item.method, type: item.type, info: item.info, params: {} }
    let ok = true

    if (paramsRaw && paramsRaw.includes('=')) {
      // ================= 命名式：参数名=值;参数名=值 =================
      const named = parseNamedParams(paramsRaw)
      if (!named) {
        skipped.push(`${name}（参数段格式不合法，应为 参数名=值;参数名=值）`)
        continue
      }
      // 先全部填默认值，再覆盖命名参数
      userParams.forEach(meta => {
        const a = meta.annotation || ''
        const def = meta.default !== null && meta.default !== undefined ? meta.default : getDefaultByType(a)
        config.params[meta.name] = def
      })
      for (const np of named) {
        const meta = userParams.find(m => norm(m.name) === norm(np.name))
        if (!meta) {
          skipped.push(`${name}（参数 ${np.name} 不在定义中）`)
          ok = false
          break
        }
        const val = parseNamedValue(np.name, np.value, meta.annotation)
        if (val === undefined) {
          skipped.push(`${name}（参数 ${np.name}=${np.value} 不合格）`)
          ok = false
          break
        }
        config.params[meta.name] = val
      }
    } else {
      // ================= 位置式（兼容旧语法）：数字,数字 =================
      // 仅 int/float 类型的参数可接收位置数字；复杂 Config 与 bool 保持默认值
      const numParams = userParams.filter(p => {
        const a = p.annotation || ''
        return a.includes('int') || a.includes('float')
      })
      let values = []
      if (paramsRaw) {
        if (!PARAMS_RE.test(paramsRaw)) {
          skipped.push(`${name}（参数仅允许数字+英文逗号）`)
          continue
        }
        values = paramsRaw.split(',').map(Number)
      }
      if (values.length > numParams.length) {
        skipped.push(`${name}（参数 ${values.length} 个超过定义 ${numParams.length} 个）`)
        continue
      }
      userParams.forEach(meta => {
        const a = meta.annotation || ''
        const isNum = a.includes('int') || a.includes('float')
        const def = meta.default !== null && meta.default !== undefined ? meta.default : getDefaultByType(a)
        if (isNum) {
          const idx = numParams.indexOf(meta)
          config.params[meta.name] = idx < values.length ? values[idx] : def
        } else {
          config.params[meta.name] = def
        }
      })
    }

    if (ok) enabledConfigs.push(config)
  }

  if (skipped.length) {
    console.warn('[URL] 买卖提示跳过不合格指标:', skipped)
    ElMessage.warning(`URL 买卖提示跳过 ${skipped.length} 个：${skipped.join('；')}`)
  }
  if (!enabledConfigs.length) return

  // 当前周期（与面板一致：chart.getPeriod → '1d' / '5m'）
  let period = '1d'
  const chart = ctx.getChartInstance?.()?.chart
  if (chart) {
    const p = chart.getPeriod()
    if (p) period = `${p.span}${p.type[0]}`
  }

  const searchStore = useSearchParametersStore()
  const ws = new WebSocket(ws_getLongShortSignal_url)
  ws.onopen = () => ws.send(JSON.stringify({
    period,
    symbol: searchStore.symbol,
    startTime: toBackendIso(searchStore.startDate),
    endTime: toBackendIso(searchStore.endDate),
    indicators: enabledConfigs,
    t: new Date().getTime()
  }))
  ws.onmessage = (event) => {
    ws.close()
    try {
      const data = JSON.parse(event.data)
      const signals = Array.isArray(data?.data) ? data.data : []
      const comp = ctx.getChartInstance?.()
      const chartInst = comp?.chart
      if (!comp || !chartInst) {
        console.warn('[URL] 图表未就绪，买卖信号仅存入 store')
        searchStore.setLongShortSignals(signals)
        return
      }
      comp.clearAllMarkers(chartInst)
      const signalsWithTs = []
      for (const signal of signals) {
        // 与 K 线时间戳语义一致：本地时间显式 +08:00 转 epoch（逻辑同面板）
        const signalPeriod = signal.period
        const timestamp = (() => {
          const dt = String(signal.datetime)
          const iso = dt.includes('T') ? dt : dt.replace(' ', 'T')
          const tsStr = /\d{1,2}:\d{2}(:\d{2})?/.test(iso) ? iso : iso + 'T00:00:00'
          const t = new Date(tsStr + '+08:00').getTime()
          if (signalPeriod === '1d') {
            const local = new Date(t + 8 * 3600 * 1000)
            const localMidnight = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()))
            return localMidnight.getTime() - 8 * 3600 * 1000
          }
          return t
        })()
        const type = (() => {
          if (signal.type === 'buy') return 'BULL'
          if (signal.type === 'sell') return 'BEAR'
          return signal.type
        })()
        const value = (() => {
          if (type === 'BULL') return signal.low
          if (type === 'BEAR') return signal.high
          return signal.value
        })()
        signalsWithTs.push({
          period: signalPeriod,
          datetime: String(signal.datetime),
          timestamp,
          type: signal.type,
          message: signal.message,
          value,
          low: signal.low,
          high: signal.high,
        })
        comp.addMarkers(chartInst, [{ timestamp, type, value, mes: signal.message }], 'predict')
      }
      searchStore.setLongShortSignals(signalsWithTs)
      ElMessage.success(`URL 买卖提示：启用 ${enabledConfigs.length} 个指标，收到 ${signalsWithTs.length} 个信号`)
    } catch (e) {
      console.error('[URL] 多空信号处理失败:', e)
      ElMessage.error('URL 买卖提示：信号处理失败')
    }
  }
  ws.onerror = () => {
    ws.close()
    console.error('[URL] 多空信号提交失败')
    ElMessage.error('URL 买卖提示：提交失败，请确认后台已启动')
  }
}

// ---------- 主入口 ----------

/**
 * 解析地址栏 URL 参数并应用。
 * @param {object} ctx
 * @param {() => object} ctx.getChartInstance 返回 kLineView 组件实例（用于打标记/取周期）
 * @param {() => void} ctx.loadTradingSignals  加载 pybroker 订单函数（home.vue 传入）
 */
export function applyUrlParams(ctx = {}) {
  const params = new URLSearchParams(window.location.search)
  if (params.size === 0) return

  const searchStore = useSearchParametersStore()
  let changed = false

  // 标的
  const code = params.get('code') || params.get('symbol')
  if (code && String(code).trim()) {
    searchStore.symbol = String(code).trim()
    changed = true
  }

  // 复权类型
  const adjust = params.get('adjust') || params.get('adjust_type')
  if (adjust && ['none', 'front', 'back'].includes(adjust)) {
    searchStore.adjust_type = adjust
    changed = true
  }

  // 起止时间
  const start = normalizeDateStr(params.get('start') || params.get('startDate'))
  if (start) {
    searchStore.startDate = start
    changed = true
  }
  const end = normalizeDateStr(params.get('end') || params.get('endDate'))
  if (end) {
    searchStore.endDate = end
    changed = true
  }
  // URL 未提供起止时间时：store 默认值是 toISOString() 的 ISO 格式，
  // 而 K线分页 addDays 只认 YYYY-MM-DD HH:mm:ss → 一并规范化为选择器格式
  // （用户手动操作时由 el-date-picker 完成该规范化，URL 自动加载需在此补齐）
  if (!start) {
    const s = normalizeDateStr(searchStore.startDate)
    if (s && s !== searchStore.startDate) { searchStore.startDate = s; changed = true }
  }
  if (!end) {
    const e = normalizeDateStr(searchStore.endDate)
    if (e && e !== searchStore.endDate) { searchStore.endDate = e; changed = true }
  }

  // K线技术指标（带参数，参数仅数字+英文逗号）
  const inds = parseIndicators(params.get('indicators'))
  if (inds) {
    searchStore.setEnabledIndicators(inds)
    changed = true
  }

  // 搜索参数有变化 → 触发加载（K线重载由 kLineView 注册的 onLoadEvent 执行）。
  // 延迟 700ms：避免页面加载早期与组件初始化竞态（偶发 WS 失败导致图表空白）。
  if (changed) {
    setTimeout(() => searchStore.onLoad(), 700)
  }

  // 买卖提示（异步：先拉目录 → 校验参数 → 提交信号）
  const ls = params.get('ls')
  if (ls) applyLongShortFromUrl(ls, ctx)

  // 加载 pybroker 订单
  if (truthy(params.get('trades')) && typeof ctx.loadTradingSignals === 'function') {
    ctx.loadTradingSignals()
  }

  // 云指标：仅刷新（列表 + K线叠加缓存），不打开面板
  if (truthy(params.get('cloud'))) {
    const cloudStore = useCloudMetricStore()
    listCloudMetrics()
      .then(items => { cloudStore.metricList = items })
      .catch(e => console.error('[URL] 云指标列表刷新失败:', e))
    refreshCloudMetrics()
  }
}
