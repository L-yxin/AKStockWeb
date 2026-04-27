// 对接python接口WebSocket


const base_ws_url = "ws://localhost:8000/ws"
const ws_kline_url = `${base_ws_url}/kline`
const ws_allSymbols_url = `${base_ws_url}/allSymbols`
const ws_syncData_url = `${base_ws_url}/syncData`
const ws_buyingAndSellingIndicator_url = `${base_ws_url}/buyingAndSellingIndicator`
const ws_getLongShortSignal_url = `${base_ws_url}/getLongShortSignal`
const ws_getTradingSignals_url = `${base_ws_url}/getTradingSignals`
export  {
    base_ws_url,
    ws_kline_url,
    ws_allSymbols_url,
    ws_syncData_url,
    ws_buyingAndSellingIndicator_url,
    ws_getLongShortSignal_url,
    ws_getTradingSignals_url
}