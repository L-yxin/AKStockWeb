// 对接 Python 后台的 WebSocket 接口地址
// 后台数据源已切换为通达信（tqcenter），不再使用互联网同步通道

const base_ws_url = "ws://localhost:8000/ws"
const base_http_url = "http://localhost:8000"

// —— K线数据 ——
const ws_kline_url = `${base_ws_url}/kline`

// —— 标的列表 ——
const ws_allSymbols_url = `${base_ws_url}/allSymbols`

// —— 键盘搜索标的（A股+重点指数，全量下发） ——
const ws_searchSymbols_url = `${base_ws_url}/searchSymbols`

// —— 买卖提示指标（后台指标目录） ——
const ws_buyingAndSellingIndicator_url = `${base_ws_url}/buyingAndSellingIndicator`

// —— 多空信号生成 ——
const ws_getLongShortSignal_url = `${base_ws_url}/getLongShortSignal`

// —— 交易订单信号（pybroker） ——
const ws_getTradingSignals_url = `${base_ws_url}/getTradingSignals`


// —— 指标信号质量评测（提交买卖价格/时间，由后台 akquant 分析） ——
const ws_signalQualityEvaluate_url = `${base_ws_url}/signalQualityEvaluate`

// —— 模拟交易绩效评估（结束模拟时提交逐笔成交，后台 akquant 回放） ——
const ws_simulationEvaluate_url = `${base_ws_url}/simulationEvaluate`

// ============================================================
// 云指标上传（REST）：全市场多列 DataFrame，索引为日期
// ============================================================

/** 上传云指标 DataFrame */
async function uploadCloudMetric({ name, start, end, columns, data }) {
  const resp = await fetch(`${base_http_url}/api/cloudMetrics/upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, start, end, columns, data }),
  })
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}))
    throw new Error(err.detail || `上传失败 (${resp.status})`)
  }
  return resp.json()
}

/** 列出已上传的云指标 */
async function listCloudMetrics() {
  const resp = await fetch(`${base_http_url}/api/cloudMetrics/list`)
  if (!resp.ok) throw new Error(`列表获取失败 (${resp.status})`)
  const j = await resp.json()
  return j.items || []
}

/** 按起止时间查询云指标 */
async function getCloudMetric(name, start = "", end = "") {
  const params = new URLSearchParams({ name })
  if (start) params.set("start", start)
  if (end) params.set("end", end)
  const resp = await fetch(`${base_http_url}/api/cloudMetrics/get?${params.toString()}`)
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}))
    throw new Error(err.detail || `查询失败 (${resp.status})`)
  }
  return resp.json()
}

/** 删除云指标 */
async function deleteCloudMetric(name) {
  const resp = await fetch(`${base_http_url}/api/cloudMetrics/delete?name=${encodeURIComponent(name)}`, {
    method: "DELETE",
  })
  if (!resp.ok) throw new Error(`删除失败 (${resp.status})`)
  return resp.json()
}

// ============================================================
// Python 指标（Indicator 目录，后端 FastAPI 计算 + 内存缓存）
// ============================================================

/** 列出 Python 指标（名称 / 参数定义 / 说明） */
async function getPyIndicatorList() {
  const resp = await fetch(`${base_http_url}/api/pyInd/list`)
  if (!resp.ok) throw new Error(`Python指标清单获取失败 (${resp.status})`)
  const j = await resp.json()
  return { items: j.items || [], talibFuncs: j.talib_funcs || [] }
}

/** 计算 Python 指标并返回 JS 文本（window.__pyInd） */
async function fetchPyIndicatorJs(name, paramsStr, { code, period, adjust, data = "", refresh = 0, start = "", end = "" }) {
  const qs = new URLSearchParams({ code, period, adjust_type: adjust, params: paramsStr, refresh: String(refresh) })
  if (data) qs.set("data", data)
  if (start) qs.set("start", start)
  if (end) qs.set("end", end)
  const resp = await fetch(`${base_http_url}/api/pyInd/${encodeURIComponent(name)}.js?${qs.toString()}`)
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}))
    throw new Error(err.detail || `Python指标计算失败 (${resp.status})`)
  }
  return resp.text()
}

// ============================================================
// K 线信号表现分析（替代原 akquant 信号质量评测）
// ============================================================

/**
 * 提交 bool 信号序列做未来 N 根 K 线表现分析。
 * @param {object} payload { signals, range, horizons, mergeConsecutive, returnType, minSample, period }
 */
async function signalAnalyze(payload) {
  const resp = await fetch(`${base_http_url}/api/signalAnalyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}))
    throw new Error(err.detail || `信号表现分析失败 (${resp.status})`)
  }
  return resp.json()
}

// ============================================================
// Monaco 编辑器（pythonCode 智能补全 + hover 文档）
// ============================================================

/** 获取 ta/ind/klf 补全名单 */
async function getPyCodeCompletions() {
  const resp = await fetch(`${base_http_url}/api/pyCodeCompletions`)
  if (!resp.ok) throw new Error(`补全名单获取失败 (${resp.status})`)
  return resp.json()
}

/** 获取函数签名 + docstring（hover 用） */
async function getPyCodeDoc(ns, name) {
  const resp = await fetch(`${base_http_url}/api/pyCodeDoc?ns=${ns}&name=${encodeURIComponent(name)}`)
  if (!resp.ok) throw new Error(`文档获取失败 (${resp.status})`)
  return resp.json()
}

// ============================================================
// 板块 / 指数成分 / 自选（REST）
// ============================================================

/** 分组列表：type ∈ sector | index | watchlist */
async function getSectorGroups(type) {
  const resp = await fetch(`${base_http_url}/api/sectors/list?type=${type}`)
  if (!resp.ok) throw new Error(`分组获取失败 (${resp.status})`)
  return resp.json()
}

/** 成分股列表：type ∈ sector | index | watchlist，id 为分组 id */
async function getSectorStocks(type, id) {
  const resp = await fetch(`${base_http_url}/api/sectors/stocks?type=${type}&id=${encodeURIComponent(id)}`)
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}))
    throw new Error(err.detail || `成分股获取失败 (${resp.status})`)
  }
  return resp.json()
}

/** 自选操作：action ∈ create / add / remove / rename / delete */
async function watchlistOp(action, body = {}) {
  const resp = await fetch(`${base_http_url}/api/sectors/watchlist`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...body }),
  })
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}))
    throw new Error(err.detail || `自选操作失败 (${resp.status})`)
  }
  return resp.json()
}

/** 全部自选组（含明细） */
async function getWatchlist() {
  const resp = await fetch(`${base_http_url}/api/sectors/watchlist`)
  if (!resp.ok) throw new Error(`自选获取失败 (${resp.status})`)
  return resp.json()
}

// ============================================================
// 股票数据内存缓存服务（回测数据源 / 网页可选数据来源）
// ============================================================

/** 缓存状态：entries / used_gb / budget_gb / utilization / ttl */
async function getCacheStats() {
  const resp = await fetch(`${base_http_url}/api/v1/cache/stats`)
  if (!resp.ok) throw new Error(`缓存状态获取失败 (${resp.status})`)
  return resp.json()
}

/** 清空全部缓存 */
async function clearCache() {
  const resp = await fetch(`${base_http_url}/api/v1/cache`, { method: "DELETE" })
  if (!resp.ok) throw new Error(`清空缓存失败 (${resp.status})`)
  return resp.json()
}

/** 失效单标的缓存（所有复权/周期版本） */
async function evictCacheSymbol(symbol) {
  const resp = await fetch(`${base_http_url}/api/v1/cache/${encodeURIComponent(symbol)}`, { method: "DELETE" })
  if (!resp.ok) throw new Error(`失效缓存失败 (${resp.status})`)
  return resp.json()
}

/** 单标的 K 线（缓存服务，懒加载） */
async function getCachedKline(symbol, { adjust = "qfq", period = "1d", start = "", end = "", columns } = {}) {
  const params = new URLSearchParams({ adjust, period })
  if (start) params.set("start", start)
  if (end) params.set("end", end)
  if (columns) params.set("columns", columns)
  const resp = await fetch(`${base_http_url}/api/v1/stocks/${encodeURIComponent(symbol)}?${params.toString()}`)
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}))
    throw new Error(err.detail || `缓存K线获取失败 (${resp.status})`)
  }
  return resp.json()
}

// ============================================================
// 后台管理（/api/admin：数据预加载 + 缓存策略调整）
// ============================================================

/** 预加载计划预览（基于 data 下 sector_cache.json / watchlist.json） */
async function getPreloadPlan(sources = ["watchlist", "sector", "index"]) {
  const resp = await fetch(`${base_http_url}/api/admin/preload/plan?sources=${sources.join(",")}`)
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}))
    throw new Error(err.detail || `预加载计划获取失败 (${resp.status})`)
  }
  return resp.json()
}

/** 预加载分组清单（精确勾选：自选组 / 板块 / 指数，含数量） */
async function getPreloadSources() {
  const resp = await fetch(`${base_http_url}/api/admin/preload/sources`)
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}))
    throw new Error(err.detail || `预加载分组清单获取失败 (${resp.status})`)
  }
  return resp.json()
}

/** 执行数据预加载：groups 为精确组 id（wl_* / sector_stocks:* / index_stocks:*）；兼容 sources 粗粒度 */
async function runPreload({ groups, sources = ["watchlist", "sector", "index"], period = "1d", adjust = "none", start = "2024-01-01", end = "", limit } = {}) {
  const body = groups ? { groups, period, adjust, start, end, limit } : { sources, period, adjust, start, end, limit }
  const resp = await fetch(`${base_http_url}/api/admin/preload`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}))
    throw new Error(err.detail || `数据预加载失败 (${resp.status})`)
  }
  return resp.json()
}

/** 读取后台管理配置（data/setting.json：预加载选择 + 缓存策略） */
async function getAdminSettings() {
  const resp = await fetch(`${base_http_url}/api/admin/settings`)
  if (!resp.ok) throw new Error(`后台管理配置读取失败 (${resp.status})`)
  return resp.json()
}

/** 保存后台管理配置（含缓存策略时同步应用） */
async function saveAdminSettings(body = {}) {
  const resp = await fetch(`${base_http_url}/api/admin/settings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}))
    throw new Error(err.detail || `后台管理配置保存失败 (${resp.status})`)
  }
  return resp.json()
}

/** 读取缓存策略 */
async function getCacheConfig() {
  const resp = await fetch(`${base_http_url}/api/admin/cache/config`)
  if (!resp.ok) throw new Error(`缓存策略读取失败 (${resp.status})`)
  return resp.json()
}

/** 调整缓存策略：{ budget_gb, ttl_seconds, sweep_interval_seconds } */
async function setCacheConfig(body = {}) {
  const resp = await fetch(`${base_http_url}/api/admin/cache/config`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}))
    throw new Error(err.detail || `缓存策略调整失败 (${resp.status})`)
  }
  return resp.json()
}

export {
  base_ws_url,
  base_http_url,
  ws_kline_url,
  ws_allSymbols_url,
  ws_searchSymbols_url,
  ws_buyingAndSellingIndicator_url,
  ws_getLongShortSignal_url,
  ws_getTradingSignals_url,
  ws_signalQualityEvaluate_url,
  ws_simulationEvaluate_url,
  // 云指标上传 REST
  uploadCloudMetric,
  listCloudMetrics,
  getCloudMetric,
  deleteCloudMetric,
  // Python 指标 REST
  getPyIndicatorList,
  fetchPyIndicatorJs,
  // 信号表现分析 REST
  signalAnalyze,
  // Monaco 编辑器 REST
  getPyCodeCompletions,
  getPyCodeDoc,
  // 板块/自选 REST
  getSectorGroups,
  getSectorStocks,
  watchlistOp,
  getWatchlist,
  // 股票数据内存缓存服务 REST
  getCacheStats,
  clearCache,
  evictCacheSymbol,
  getCachedKline,
  // 后台管理 REST
  getPreloadPlan,
  getPreloadSources,
  runPreload,
  getCacheConfig,
  setCacheConfig,
  getAdminSettings,
  saveAdminSettings,
}
