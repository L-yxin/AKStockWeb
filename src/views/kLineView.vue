<template>
  <div id="chart" class="chart" ref="chartEle"></div>
  <div ref="unifiedTooltip" class="unified-tooltip" v-show="tooltipVisible"
    :style="{ left: tooltipPos.x + 'px', top: tooltipPos.y + 'px' }">
    <!-- K线部分（有值才显示） -->
    <template v-if="currentKline">
      <div class="tooltip-header">{{ formatDateTime(currentKline.timestamp) }}</div>
      <div class="tooltip-row">
        <span class="label">开</span>
        <span class="value" :class="klineChangeClass(currentKline.open, currentKline.preClose)">{{ currentKline.open
          }}</span>
      </div>
      <div class="tooltip-row">
        <span class="label">高</span>
        <span class="value high-low">{{ currentKline.high }}</span>
      </div>
      <div class="tooltip-row">
        <span class="label">低</span>
        <span class="value high-low">{{ currentKline.low }}</span>
      </div>
      <div class="tooltip-row">
        <span class="label">收</span>
        <span class="value" :class="klineChangeClass(currentKline.close, currentKline.preClose)">{{ currentKline.close
          }}</span>
      </div>
      <div class="tooltip-row">
        <span class="label">量</span>
        <span class="value volume">{{ formatVolume(currentKline.volume) }}</span>
      </div>
      <div class="tooltip-per">
          <span class="label">涨幅</span>
          <span class="value">{{ ((currentKline.close - currentKline.preClose) / currentKline.preClose * 100).toFixed(2) }}%</span>
      </div>
    </template>

    <!-- 交易信号部分 -->
    <template v-if="tooltipMessages.length > 0">
      <div class="tooltip-divider" v-if="currentKline"></div>
      <div class="tooltip-signal" v-for="(msg, idx) in tooltipMessages" :key="idx">
        • {{ msg }}
      </div>
    </template>
  </div>
</template>

<script setup>
import { init, dispose, registerOverlay, registerIndicator,getSupportedFigures } from 'klinecharts'
import { RSI,EMA } from 'technicalindicators'
import { ws_kline_url } from '@/api'
// ==================== Pinia Store ====================
const searchStore = useSearchParametersStore()

// ==================== 响应式状态 ====================
const chart = ref(null)
let pollTimer = null
let currentLatestDate = null

const DEFAULT_PAGE_SIZE = 30 * 2
const WS_URL = ws_kline_url

// ==================== 标记相关全局状态 ====================
const mesMap = new Map() // 按时间戳存储所有消息

// ==================== 工具函数（完整实现） ====================
function normalizeToKLineData(item) {
  return {
    timestamp: item.timestamp,
    open: item.open,
    high: item.high,
    low: item.low,
    close: item.close,
    volume: item.volume,
  }
}
const chartEle = ref(null)
const unifiedTooltip = ref(null)
const tooltipVisible = ref(false)
const tooltipMessages = ref([]) // 当前日期对应的交易信号消息列表
const tooltipPos = ref({ x: 0, y: 0 })
let currentKline = ref(null)

// 格式化函数（与之前高质感版本相同）
function formatDateTime(timestamp) {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  const pad = (n) => n.toString().padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
function formatVolume(vol) {
  if (vol >= 1e9) return (vol / 1e9).toFixed(2) + 'B'
  if (vol >= 1e6) return (vol / 1e6).toFixed(2) + 'M'
  if (vol >= 1e3) return (vol / 1e3).toFixed(2) + 'K'
  return vol.toString()
}
function klineChangeClass(current, prevClose) {
  if (prevClose === undefined || prevClose === null) return ''
  return current >= prevClose ? 'up' : 'down'
}
function timestampToDateStr(timestampMs) {
  if (!timestampMs || isNaN(timestampMs) || timestampMs <= 0) return null
  const date = new Date(timestampMs)
  if (isNaN(date.getTime())) return null
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function addDays(dateStr, days) {
  if (!dateStr) return null
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  const year = parseInt(match[1], 10)
  const month = parseInt(match[2], 10) - 1
  const day = parseInt(match[3], 10)
  const date = new Date(year, month, day)
  date.setDate(date.getDate() + days)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function todayStr() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

// ==================== 历史数据请求 ====================
function fetchHistoryData(symbol, period, startDate, endDate) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL)
    ws.onopen = () => {
      ws.send(JSON.stringify({
        action: "history",
        code: symbol.ticker,
        period: `${period.span}${period.type === 'day' ? 'd' : period.type[0]}`,
        adjust_type: searchStore.adjust_type,
        start_date: startDate,
        end_date: endDate,
      }))
    }
    ws.onmessage = (event) => {
      const res = JSON.parse(event.data)
      const bars = (res.data || []).map(normalizeToKLineData).sort((a, b) => a.timestamp - b.timestamp)
      resolve(bars)
      ws.close()
    }
    ws.onerror = (err) => {
      reject(err)
      ws.close()
    }
  })
}

// ==================== 标记方向与偏移处理 ====================
function getBaseDirection(market, type) {
  if (market === "stock") {
    if (type === "B" || type === "买") return 1
    if (type === "S" || type === "卖") return -1
    if (type === "T") return -1
  } else if (market === "futures") {
    if (type === "L" || type === "多开" || type === "CS" || type === "空平") return 1
    if (type === "S" || type === "空开" || type === "CL" || type === "多平") return -1
  } else if (market === "predict") {
    if (type === "BULL" || type === "多") return 1
    if (type === "BEAR" || type === "空") return -1
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

// ==================== 注册自定义 Overlay（全局一次） ====================
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



    const baseStartDistance = 70;
    const baseEndDistance = 10;
    const extraOffset = 55; // 额外移动的距离
    let startDistance = baseStartDistance + (direction === -1 ? extraOffset : (direction !== -1 ? extraOffset : 0));
    let endDistance = baseEndDistance + (direction === -1 ? extraOffset : (direction !== -1 ? extraOffset : 0));


    const lineEndY = baseY + direction * endDistance
    const lineStartY = baseY + direction * startDistance + groupOffset

    const getColor = (market, type) => {
      if (market === "stock") {
        if (type === "B" || type === "买") return '#ef5350'
        if (type === "S" || type === "卖") return '#26a69a'
        if (type === "T") return '#42a5f5'
      } else if (market === "futures") {
        if (type === "L" || type === "多开") return '#ef5350'
        if (type === "S" || type === "空开") return '#26a69a'
        if (type === "CL" || type === "多平") return '#42a5f5'
        if (type === "CS" || type === "空平") return '#ffa726'
      } else if (market === "predict") {
        if (type === "BULL" || type === "多") return '#ef5350'
        if (type === "BEAR" || type === "空") return '#26a69a'
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
  lock : true,                // 锁定，禁止用户交互修改
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
registerIndicator({
  name: 'RSI',
  shortName: 'RSI',
  series: 'price',
  calcParams: [6, 12, 24],
  precision: 2,
  figures: [
   
  ],
  calc: (dataList, indicator) => {
    const periods = indicator.calcParams
    const closePrices = dataList.map(item => item.close)
    const total = dataList.length

    // 初始化结果数组，所有位置初始为 null
    const results = Array(total).fill().map(() => ({ rsi1: null, rsi2: null, rsi3: null }))
    indicator.figures = [] // 清空原有图形定义
    periods.forEach((period, idx) => {
      // 计算 RSI，返回值长度 = total - period
      const rsiValues = RSI.calculate({ period, values: closePrices })
      const key = `rsi${idx + 1}`
      // 从 period 索引开始填充
      for (let i = 0; i < rsiValues.length; i++) {
        results[period + i][key] = rsiValues[i]
      }
      indicator.figures.push(
        { key: `rsi${idx + 1}`, title: `RSI${idx + 1}: `, type: 'line' }
      )
    })

    return results
  }
})
registerIndicator({
  name: 'RSISpeedWithAcc',
  shortName: 'RSI S&A',
  series: 'price',
  calcParams: [14],         // RSI周期，默认14
  precision: 2,
  figures: [
    { key: 'speed', title: '速度: ', type: 'line' },
    { key: 'acc',   title: '加速度: ', type: 'line' }
  ],
  calc: (dataList, indicator) => {
    const period = indicator.calcParams[0]        // RSI周期
    const closePrices = dataList.map(item => item.close)
    const total = dataList.length

    const results = Array(total).fill().map(() => ({ speed: null, acc: null }))
    if (total === 0) return results

    // ---------- 1. 计算 RSI 序列 ----------
    const rsi = Array(total).fill(null)
    if (total > period) {
      let gains = 0, losses = 0

      // 计算初始平均涨跌幅（前 period 根K线）
      for (let i = 1; i <= period; i++) {
        const change = closePrices[i] - closePrices[i-1]
        if (change >= 0) gains += change
        else losses -= change
      }
      let avgGain = gains / period
      let avgLoss = losses / period
      let rs = avgLoss === 0 ? Infinity : avgGain / avgLoss
      rsi[period] = 100 - 100 / (1 + rs)

      // 递归计算后续 RSI（Wilder 平滑）
      for (let i = period + 1; i < total; i++) {
        const change = closePrices[i] - closePrices[i-1]
        const gain = change > 0 ? change : 0
        const loss = change < 0 ? -change : 0
        avgGain = (avgGain * (period - 1) + gain) / period
        avgLoss = (avgLoss * (period - 1) + loss) / period
        rs = avgLoss === 0 ? Infinity : avgGain / avgLoss
        rsi[i] = 100 - 100 / (1 + rs)
      }
    }

    // ---------- 2. 计算速度（RSI 的一阶差分）----------
    const speed = Array(total).fill(null)
    for (let i = 1; i < total; i++) {
      if (rsi[i] !== null && rsi[i-1] !== null) {
        speed[i] = rsi[i] - rsi[i-1]
      }
    }

    // ---------- 3. 计算加速度（速度的一阶差分）----------
    const acc = Array(total).fill(null)
    for (let i = 2; i < total; i++) {
      if (speed[i] !== null && speed[i-1] !== null) {
        acc[i] = speed[i] - speed[i-1]
      }
    }

    // 填充结果
    for (let i = 0; i < total; i++) {
      results[i].speed = speed[i]
      results[i].acc = acc[i]
    }

    return results
  }
})

registerIndicator({
  name: 'Relative high and low points',
  shortName: 'HL',
  series: 'price',
  calcParams: [1, 5],            // [周期, step]
  precision: 2,
  figures: [],
  calc: (dataList, indicator) => {
    const period = indicator.calcParams[0] ?? 1
    const step = indicator.calcParams[1] ?? 5
    const highs = dataList.map(d => d.high)
    const lows = dataList.map(d => d.low)
    const total = dataList.length

    // ----- EMA -----
    const HighEMA = EMA.calculate({ period, values: highs })
    const LowEMA = EMA.calculate({ period, values: lows })
    // ----- 找出全部拐点（不分 len）-----
    const highPivots = []  // { index, price }
    const lowPivots = []
    for (let i = 2; i < total ; i++) {
      // 高点
      if (HighEMA[i - 2] <= HighEMA[i-1] && HighEMA[i-1] >= HighEMA[i]) {
        const start = Math.max(0, i - step)
        const maxHigh = Math.max(...highs.slice(start, i+1))
        highPivots.push({ index: i, price: maxHigh })
      }
      // 低点
      if (LowEMA[i - 2] >= LowEMA[i-1] && LowEMA[i-1] <= LowEMA[i]) {
        const start = Math.max(0, i - step)
        const minLow = Math.min(...lows.slice(start, i+1))
        lowPivots.push({ index: i, price: minLow })
      }
    }

    // ----- 生成折线数组（每个时点当前有效的价格）-----
    const buildLine = (pivots) => {
      const line = new Array(total).fill(null)
      if (pivots.length === 0) return line

      let pivIdx = 0
      let currentPrice = null
      for (let i = 0; i < total; i++) {
        // 如果到了新极点，更新价格
        if (pivIdx < pivots.length && i >= pivots[pivIdx].index) {
          currentPrice = pivots[pivIdx].price
          pivIdx++
        }
        line[i] = currentPrice
      }
      return line
    }

    const highLine = buildLine(highPivots)   // 高点折线值
    const lowLine = buildLine(lowPivots)     // 低点折线值

    // ----- 结果数组 -----
    const results = new Array(total)
    for (let i = 0; i < total; i++) {
      results[i] = {}
    }

    // 清空 figures
    indicator.figures.splice(0, indicator.figures.length)

   

    const highKey = `high`
    const lowKey = `low`

    // 填充数据
    for (let i = 0; i < total; i++) {
      results[i][highKey] = highLine[i]
      results[i][lowKey] = lowLine[i]
    }

    // 图形定义
    indicator.figures.push({
      key: highKey,
      title: `高: `,
      type: 'line',
      styles: () => ({ color: '#E57373', size: 1 })
    })
    indicator.figures.push({
      key: lowKey,
      title: `低: `,
      type: 'line',
      styles: () => ({ color: '#81C784', size: 1 })
    })  
    

    return results
  }
})

registerIndicator({
  name: 'RelativeHighPoints',
  shortName: 'HighPts',
  series: 'price',
  calcParams: [1, 5],
  precision: 2,
  figures: [],
  calc: (dataList, indicator) => {
    const params = indicator.calcParams;
    const groupCount = Math.floor(params.length / 2);
    const highs = dataList.map(d => d.high);
    const total = dataList.length;

    indicator.figures.splice(0, indicator.figures.length);
    const results = new Array(total);
    for (let i = 0; i < total; i++) results[i] = {};

    for (let g = 0; g < groupCount; g++) {
      const period = params[g * 2] ?? 1;
      const step = params[g * 2 + 1] ?? 5;

      const HighEMA = EMA.calculate({ period, values: highs });
      const highPivots = [];
      for (let i = 2; i < total; i++) {
        if (HighEMA[i] == null) continue;
        if (HighEMA[i - 2] <= HighEMA[i - 1] && HighEMA[i - 1] >= HighEMA[i]) {
          const start = Math.max(0, i - step);
          const maxHigh = Math.max(...highs.slice(start, i + 1));
          highPivots.push({ index: i, price: maxHigh });
        }
      }

      const line = new Array(total).fill(null);
      if (highPivots.length > 0) {
        let pivIdx = 0, currentPrice = null;
        for (let i = 0; i < total; i++) {
          if (pivIdx < highPivots.length && i >= highPivots[pivIdx].index) {
            currentPrice = highPivots[pivIdx].price;
            pivIdx++;
          }
          line[i] = currentPrice;
        }
      }

      const key = `high_${g + 1}`;
      for (let i = 0; i < total; i++) results[i][key] = line[i];

      const colors = ['#E57373', '#EF5350', '#F44336', '#E53935', '#D32F2F'];
      indicator.figures.push({
        key,
        title: `高${g + 1} (${period},${step})`,
        type: 'line',
        styles: () => ({ color: colors[g % colors.length], size: 1 })
      });
    }
    return results;
  }
});


registerIndicator({
  name: 'RelativeLowPoints',
  shortName: 'LowPts',
  series: 'price',
  calcParams: [1, 5],
  precision: 2,
  figures: [],
  calc: (dataList, indicator) => {
    const params = indicator.calcParams;
    const groupCount = Math.floor(params.length / 2);
    const lows = dataList.map(d => d.low);
    const total = dataList.length;

    indicator.figures.splice(0, indicator.figures.length);
    const results = new Array(total);
    for (let i = 0; i < total; i++) results[i] = {};

    for (let g = 0; g < groupCount; g++) {
      const period = params[g * 2] ?? 1;
      const step = params[g * 2 + 1] ?? 5;

      const LowEMA = EMA.calculate({ period, values: lows });
      const lowPivots = [];
      for (let i = 2; i < total; i++) {
        if (LowEMA[i] == null) continue;
        if (LowEMA[i - 2] >= LowEMA[i - 1] && LowEMA[i - 1] <= LowEMA[i]) {
          const start = Math.max(0, i - step);
          const minLow = Math.min(...lows.slice(start, i + 1));
          lowPivots.push({ index: i, price: minLow });
        }
      }

      const line = new Array(total).fill(null);
      if (lowPivots.length > 0) {
        let pivIdx = 0, currentPrice = null;
        for (let i = 0; i < total; i++) {
          if (pivIdx < lowPivots.length && i >= lowPivots[pivIdx].index) {
            currentPrice = lowPivots[pivIdx].price;
            pivIdx++;
          }
          line[i] = currentPrice;
        }
      }

      const key = `low_${g + 1}`;
      for (let i = 0; i < total; i++) results[i][key] = line[i];

      const colors = ['#81C784', '#66BB6A', '#4CAF50', '#43A047', '#388E3C'];
      indicator.figures.push({
        key,
        title: `低${g + 1} (${period},${step})`,
        type: 'line',
        styles: () => ({ color: colors[g % colors.length], size: 1 })
      });
    }
    return results;
  }
});



registerIndicator({
  name: 'VolumeNewLowDays',
  shortName: 'VolNLD',
  series: 'VolumeNewLowDays',
  calcParams: [400],            // [max_lookback]，0=回看全部历史
  precision: 0,
  figures: [
    {
      key: 'days',
      title: '距上次更低量的天数',
      type: 'line',
      styles: () => ({ color: '#FF5722', size: 1 })
    },
  ],
  calc: (dataList, indicator) => {
    const maxLookback = indicator.calcParams[0] ?? 400;
    const volumes = dataList.map(d => d.volume);
    const total = dataList.length;
    const results = new Array(total);

    for (let i = 0; i < total; i++) {
      if (i === 0) {
        results[i] = { days: 0 }; // 第一根无前序数据
        continue;
      }

      // 窗口起点：maxLookback<=0 回看全部
      const start = maxLookback <= 0 ? 0 : Math.max(0, i - maxLookback);

      // 从 i-1 往前找第一个小于 volumes[i] 的位置
      let days = -1; // 初始-1表示未找到
      for (let j = i - 1; j >= start; j--) {
        if (volumes[j] < volumes[i]) {
          days = i - j; // 距离当前的天数
          break;
        }
      }

      // 如果未找到（即当前值是窗口内最低），则返回窗口长度（即创了窗口长度那么多天的新低）
      if (days === -1) {
        days = i - start; // 窗口内所有值都大于等于当前，相当于创了 (i-start) 天新低
        // 若回看全部且找不到，则 days = i（即从第0根到现在的总天数）
      }

      results[i] = { days };
    }
    return results;
  }
});

// ===========================================================================
// 1. 核心工具函数：连续变化统计（支持回看窗口）
// ===========================================================================
/**
 * 统计阶梯线连续上升/下降的阶梯数（支持回看窗口限制）
 * @param {number[]} sequence - 阶梯线序列（含 null/undefined 表示无效）
 * @param {number} maxBacklook - 最大回看 K 线数（0=全部历史）
 * @returns {number[]}
 */
function continuousChange(sequence, maxBacklook = 0) {
  const n = sequence.length;
  const out = new Array(n).fill(0);
  let lastValidIdx = -1;          // 最近有效值的索引
  let prevVal = null;             // 最近有效值
  let direction = 0;              // 当前趋势方向：1上升，-1下降
  let count = 0;                  // 当前计数值（带符号）

  for (let i = 0; i < n; i++) {
    const val = sequence[i];
    if (val == null) {
      out[i] = 0;
      continue;
    }

    // 判断是否需要重置（无前序或超出窗口）
    if (lastValidIdx === -1 || (maxBacklook > 0 && i - lastValidIdx > maxBacklook)) {
      // 新趋势开始，默认视为上升，计数为1
      count = 1;
      direction = 1;
      out[i] = count;
      prevVal = val;
      lastValidIdx = i;
      continue;
    }

    // 有前序且在窗口内
    if (val > prevVal) {
      if (direction === 1) {
        count++;          // 延续上升
      } else {
        direction = 1;    // 方向转升，重置计数为1
        count = 1;
      }
    } else if (val < prevVal) {
      if (direction === -1) {
        count--;          // 延续下降（绝对值增加）
      } else {
        direction = -1;   // 方向转降，重置计数为-1
        count = -1;
      }
    } else {
      // 相等，计数不变，方向不变
    }

    out[i] = count;
    prevVal = val;
    lastValidIdx = i;
  }
  return out;
}

// ===========================================================================
// 2. 注册连续变化指标（基于相对高低点阶梯线）
// ===========================================================================
registerIndicator({
  name: 'ContinuousChange',
  shortName: 'ContChg',
  series: 'price',
  // 参数顺序：[period, step, maxBacklook, type]
  // type: 'high' 或 'low'
  calcParams: [1, 5, 0, 0],
  precision: 0,
  figures: [
    {
      key: 'value',
      title: '连续变化数',
      type: 'line',
      styles: () => ({ color: '#FFB74D', size: 1 })
    }
  ],
  calc: (dataList, indicator) => {
    const params = indicator.calcParams;
    const period = params[0] ?? 1;
    const step = params[1] ?? 5;
    const maxBacklook = params[2] ?? 0;
    const type = params[3] ?? 0;

    const priceArr = dataList.map(d => (type === 1 ? d.high : d.low));
    const total = dataList.length;

    // ---- 计算 EMA（沿用通达信 EMA 计算，此处使用 EMA.calculate，确保已加载） ----
    const ema = EMA.calculate({ period, values: priceArr });

    // ---- 寻找拐点 ----
    const pivots = [];
    for (let i = 2; i < total; i++) {
      if (ema[i] == null || ema[i-1] == null || ema[i-2] == null) continue;
      const isHigh = (type === 1);
      const condition = isHigh
        ? (ema[i-2] <= ema[i-1] && ema[i-1] >= ema[i])
        : (ema[i-2] >= ema[i-1] && ema[i-1] <= ema[i]);
      if (condition) {
        const start = Math.max(0, i - step);
        const slice = priceArr.slice(start, i + 1);
        const extreme = isHigh ? Math.max(...slice) : Math.min(...slice);
        pivots.push({ index: i, price: extreme });
      }
    }

    // ---- 构建阶梯线 ----
    const stepLine = new Array(total).fill(null);
    if (pivots.length > 0) {
      let pIdx = 0;
      let current = null;
      for (let i = 0; i < total; i++) {
        if (pIdx < pivots.length && i >= pivots[pIdx].index) {
          current = pivots[pIdx].price;
          pIdx++;
        }
        stepLine[i] = current;
      }
    }

    // ---- 计算连续变化 ----
    const changes = continuousChange(stepLine, maxBacklook);

    // ---- 组装返回 ----
    const results = new Array(total);
    for (let i = 0; i < total; i++) {
      results[i] = { value: changes[i] };
    }
    return results;
  }
});

// ==================== 对外暴露的标记添加方法 ====================
function addMarkers(chartInstance, configs, market = 'stock') {
  if (!chartInstance) return

  let types = new Set()
  if (market === "stock") {
    types = new Set(["B", "S", "T", "买", "卖"])
  } else if (market === "futures") {
    types = new Set(["L", "S", "CL", "CS", "多开", "空开", "多平", "空平"])
  } else if (market === "predict") {
    types = new Set(["BULL", "BEAR", "多", "空"])
  } else {
    throw new Error("unsupported market")
  }

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

function clearAllMarkers(chartInstance) {
  if (!chartInstance) return
  // 注意：KLineChart 没有直接清除所有 overlay 的 API，需要遍历删除
  // 这里可根据实际 overlay id 存储逻辑进行扩展
  mesMap.clear()
  chartInstance.removeOverlay()
}
function crosshairHandler(event) {
  if (!event) {
    tooltipVisible.value = false
    return
  }
  const { x, y, paneId } = event
  if (paneId !== 'candle_pane') {
    tooltipVisible.value = false
    return
  }

  if (!chart.value) return

  const result = chart.value.convertFromPixel({ x, y })
  if (!result || result.dataIndex == null) {
    tooltipVisible.value = false
    return
  }

  const dataList = chart.value.getDataList()
  const kline = dataList[result.dataIndex]
  if (!kline) {
    tooltipVisible.value = false
    return
  }

  currentKline.value = kline
  currentKline.value.preClose = result.dataIndex > 0 ? dataList[result.dataIndex - 1].close : kline.open
  tooltipPos.value = { x: x + 15, y: y + 15 }

  // 获取该时间戳的交易信号消息
  const ts = kline.timestamp
  const messages = mesMap.get(ts) || []
  tooltipMessages.value = messages

  tooltipVisible.value = true
}
function disableCrosshair() {
  const chart = klineRef.value?.chart
  if (chart && crosshairHandler) {
    chart.unsubscribeAction('onCrosshairChange', crosshairHandler)
  }
}
// ==================== 图表初始化 ====================
const initChart = () => {
  dispose('chart')
  chart.value = null
  currentLatestDate = null

  chart.value = init('chart', { timestampType: 'millisecond' })

  chart.value.setStyles({
    grid: {
      show: true,
      horizontal: { show: true, size: 1, color: '#EDEDED55', style: 'dashed', dashedValue: [2, 2] },
      vertical: { show: true, size: 1, color: '#EDEDED55', style: 'dashed', dashedValue: [2, 2] }
    },
    candle: {
      type: 'candle_solid',
      bar: {
        compareRule: 'current_open',
        upColor: '#ef4444',
        downColor: '#22c55e',
        upBorderColor: '#ef4444',
        downBorderColor: '#22c55e',
        upWickColor: '#ef4444',
        downWickColor: '#22c55e'
      }
    },
    indicator: {
      bars: [{
        style: 'fill',
        borderStyle: 'solid',
        borderSize: 1,
        borderDashedValue: [2, 2],
        upColor: 'rgba(249, 40, 85, .7)',
        downColor: 'rgba(45, 192, 142, .7)',
        noChangeColor: '#888888'
      }],
    }
  })

  const targetSymbol = searchStore.symbol || 'sh000001'
  chart.value.setSymbol({ ticker: targetSymbol })
  chart.value.setPeriod({ span: 1, type: 'day' })
  chart.value.setLocale('zh-CN')

  chart.value.setDataLoader({
    async getBars({ type, timestamp, symbol, period, callback }) {
      try {
        const today = todayStr()
        if (type === 'init') {
          const startDate = searchStore.startDate || addDays(today, -DEFAULT_PAGE_SIZE + 1)
          const endDate = searchStore.endDate || today
          const bars = await fetchHistoryData(symbol, period, startDate, endDate)
          if (bars.length > 0) {
            currentLatestDate = timestampToDateStr(bars[bars.length - 1].timestamp)
          }
          const hasMoreOld = bars.length > 0
          callback(bars, { forward: hasMoreOld, backward: false })
          return
        }

        if (type === 'forward') {
          const leftDate = timestampToDateStr(timestamp)
          if (!leftDate) {
            callback([], { forward: false, backward: false })
            return
          }
          if (leftDate >= searchStore.startDate) {
            callback([], { forward: false, backward: false })
            return
          }
          const endDatePrev = addDays(leftDate, -1)
          if (!endDatePrev) {
            callback([], { forward: false, backward: false })
            return
          }
          const startDatePrev = addDays(endDatePrev, -DEFAULT_PAGE_SIZE + 1)
          const bars = await fetchHistoryData(symbol, period, startDatePrev, endDatePrev)
          const hasMoreOld = bars.length > 0
          callback(bars, { forward: hasMoreOld, backward: false })
          return
        }

        if (type === 'backward') {
          callback([], { forward: true, backward: false })
          return
        }

        callback([], { forward: false, backward: false })
      } catch (err) {
        console.error('[getBars] 错误:', err)
        callback([], { forward: false, backward: false })
      }
    },

    subscribeBar({ symbol, period, callback }) {
      const poll = async () => {
        if (!currentLatestDate) return
        const today = todayStr()
        const nextDate = addDays(currentLatestDate, 1)
        if (nextDate >= searchStore.endDate) return
        if (!nextDate || nextDate > today) return
        try {
          const newBars = await fetchHistoryData(symbol, period, nextDate, today)
          if (newBars.length > 0) {
            newBars.forEach(bar => callback(bar))
            const lastBar = newBars[newBars.length - 1]
            currentLatestDate = timestampToDateStr(lastBar.timestamp)
          }
        } catch (err) {
          console.error('[实时] 错误:', err)
        }
      }
      poll()
      pollTimer = setInterval(poll, 5000)
    },

    unsubscribeBar() {
      if (pollTimer) {
        clearInterval(pollTimer)
        pollTimer = null
      }
    }
  })
  chart.value.subscribeAction('onCrosshairChange', crosshairHandler)
  window.addEventListener('resize', () => chart.value?.resize())
}

const reloadKLineData = () => {
  if (pollTimer) clearInterval(pollTimer)
  initChart()
}


// ==================== 生命周期 ====================
onMounted(() => {
  initChart()
  searchStore.addOnLoadEvent('klineReload', reloadKLineData)
  chartEle.value.addEventListener('mouseleave', () => {
    tooltipVisible.value = false
  })
  console.log(getSupportedFigures())

 
  
})

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer)
  searchStore.removeOnLoadEvent('klineReload')
  window.removeEventListener('resize', () => chart.value?.resize())
  chartEle.value.removeEventListener('mouseleave', () => {
    tooltipVisible.value = false
  })
  disableCrosshair()
  dispose('chart')
})

// 暴露方法供父组件调用
defineExpose({ addMarkers, clearAllMarkers, chart })
</script>

<style scoped>
.chart {
  width: 100%;
  height: 100%;
}

.unified-tooltip {
  position: fixed;
  background: rgba(20, 22, 28, 0.92);
  backdrop-filter: blur(6px);
  color: #e0e0e0;
  padding: 10px 14px;
  border-radius: 6px;
  font-size: 13px;
  line-height: 1.7;
  pointer-events: none;
  z-index: 9999;
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 8px 20px rgba(0,0,0,0.4);
  min-width: 140px;
}
.tooltip-header {
  font-size: 11px;
  color: #aaa;
  border-bottom: 1px solid rgba(255,255,255,0.1);
  padding-bottom: 6px;
  margin-bottom: 6px;
}
.tooltip-row {
  display: flex;
  justify-content: space-between;
  margin: 3px 0;
}
.label {
  opacity: 0.6;
  margin-right: 12px;
}
.value {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.up { color: #ef4444; }
.down { color: #22c55e; }
.high-low { color: #e0e0e0; }
.volume { color: #9aa0a6; }

.tooltip-divider {
  height: 1px;
  background: rgba(255,255,255,0.1);
  margin: 8px 0;
}
.tooltip-signal {
  font-size: 12px;
  color: #ffd54f;
  line-height: 1.5;
}
</style>