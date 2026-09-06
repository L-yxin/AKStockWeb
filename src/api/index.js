// 对接 Python 后台的 WebSocket 接口地址
// 后台数据源已切换为通达信（tqcenter），不再使用互联网同步通道

const base_ws_url = "ws://localhost:8000/ws"

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

// —— 云指标 ——
const WS_cloudMetrics_url = `${base_ws_url}/cloudMetrics`

// —— 指标信号质量评测（提交买卖价格/时间，由后台 akquant 分析） ——
const ws_signalQualityEvaluate_url = `${base_ws_url}/signalQualityEvaluate`

export {
  base_ws_url,
  ws_kline_url,
  ws_allSymbols_url,
  ws_buyingAndSellingIndicator_url,
  ws_getLongShortSignal_url,
  ws_getTradingSignals_url,
  WS_cloudMetrics_url,
  ws_signalQualityEvaluate_url
}
