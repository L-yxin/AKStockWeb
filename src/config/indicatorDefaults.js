// K线技术指标默认参数（供主界面初始加载与指标面板共用）
export const DEFAULT_PARAMS = {
  MA: [5, 10, 20, 60],
  EMA: [6, 12, 20],
  MACD: [12, 26, 9],
  KDJ: [9, 3, 3],
  RSI: [6, 12, 24],
  BOLL: [20, 2],
  VOL: [5, 10, 20],
}

// 默认显示在主图上的指标
export const MAIN_CHART_INDICATORS = ['MA', 'EMA', 'BOLL']

// 应用启动时默认启用的指标（与旧版行为保持一致）
export const INITIAL_ENABLED_INDICATORS = ['VOL', 'MA']
