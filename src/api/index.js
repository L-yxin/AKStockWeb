// 对接 Python 后台的 WebSocket 接口地址
// 后台数据源已切换为通达信（tqcenter），不再使用互联网同步通道

const base_ws_url = "ws://localhost:8000/ws"
const base_http_url = "http://localhost:8000"

// —— K线数据 ——
const ws_kline_url = `${base_ws_url}/kline`

// —— 标的列表 ——
const ws_allSymbols_url = `${base_ws_url}/allSymbols`

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

export {
  base_ws_url,
  base_http_url,
  ws_kline_url,
  ws_allSymbols_url,
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
}
