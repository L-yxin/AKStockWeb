// ============================================================================
// cloudMetrics 云指标（K线叠加）
// 从后台 REST 接口 /api/cloudMetrics/get 拉取已上传的云指标序列，
// 按时间戳对齐到 K 线数据上展示（取第一列叠加到主图）。
//
// 数据来源变更说明：
//   原实现通过 WebSocket /ws/cloudMetrics 拉取 Sanguine.ipynb 实时计算结果，
//   现改为 REST getCloudMetric(name, start, end) 读取已上传的 parquet 存储，
//   云指标由 Python 端计算后调用 postCloudMetrics() 上传，前端只读展示。
//
// 修复说明（相对旧实现）：
//  1. 原实现 reconnect 分支使用 arguments.callee，在 ES Module 严格模式下会抛错，改为命名函数
//  2. 原实现 wsInstance / refreshTimer 为模块级且从不清理，组件销毁后仍会持续请求，
//     现提供 destroyCloudMetrics() 由图表组件在 onUnmounted 时调用
//  3. 原实现依赖不存在的 indicator.update / window.refreshChart 来触发重绘，
//     现通过 overrideIndicator 传入新 calc 引用（beta1 中 calc 引用变化会触发重算）实现强制刷新
// ============================================================================
import { registerIndicator } from 'klinecharts'
import { getCloudMetric } from '@/api'
import { useSearchParametersStore } from '@/stores/searchParameters'
import { useCloudMetricStore } from '@/stores/cloudMetricStore'
const REFRESH_INTERVAL = 60 * 1000 // 60 秒轮询

// 模块级状态
const state = {
  timer: null,
  loading: false,
  data: [],            // [{ timestamp, value }, ...] 缓存，按时间戳升序
  chartGetter: null,   // 由图表组件注入：() => chart 实例
  metricName: 'cloudMetrics', // 云指标名称（对应上传时的 name，可通过 setCloudMetricName 切换）
  activeColumn: null,  // 当前展示的列名（取返回数据的第一列）
  calcParams: [0]     // 计算参数（可通过 setCloudMetricName 切换）
}
const randomColor = () => {
  const hue = Math.floor(Math.random() * 360);
  const sat = 70 + Math.floor(Math.random() * 20); // 70%~90%
  const lig = 50 + Math.floor(Math.random() * 20); // 50%~70%
  return `hsl(${hue}, ${sat}%, ${lig}%)`;
};
const template = {
  name: 'cloudMetrics',
  shortName: 'CloudMetrics',
  series: 'price',
  precision: 2,
  calcParams: [0],
  figures: [
    {
      key: 'value',
      title: '云指标',
      type: 'line',
      styles: () => ({ color: '#FFB74D', size: 1 })
    }
  ],
  calc: (dataList, indicator) => {
    // 若已有缓存数据，直接按时间戳对齐返回
    if(state.calcParams[0] !== indicator.calcParams[0]) {
      state.data = []
      state.activeColumn = null
      state.loading = true
      state.calcParams[0] = indicator.calcParams[0]
      fetchCloudMetrics(indicator.calcParams[0])
      return dataList.map(() => ({ value: null }))
    }
    else if (state.data.length > 0) {
      // 构建索引映射
      const res = {};
      state.data.forEach(item => {
        const entry = { timestamp: item.timestamp };
        state.activeColumn.forEach(col => {
          entry[col] = item[col];
        });
        res[item.timestamp] = entry;
      });

      // 构建图表配置
      indicator.figures = state.activeColumn.map(col => {
        let color = randomColor();
        return {
        key: col,
        title: `${state.metricName}-${col}: `,
        type: 'line',
        styles: () => ({ color: color, size: 1 })
      }});

      // 构建输出数组
      const res2 = dataList.map(item => {
        const timestamp = item.timestamp;
        return res[timestamp] ? res[timestamp] : { timestamp };
      });

      return res2;
    }

    // 数据未加载，发起请求（首次）
    if (!state.loading) {
      state.loading = true
      fetchCloudMetrics(indicator.calcParams[0])
    }

    // 返回占位空值
    return dataList.map(() => ({ value: null }))
  }
}

registerIndicator(template)

// 由图表组件注入获取当前 chart 实例的方法（用于数据到达后强制刷新）
export function setCloudMetricsChartGetter(getter) {
  state.chartGetter = getter
}

// 切换云指标名称（对应上传时的 name），切换后自动重新拉取
export function setCloudMetricName(name) {
  if (name && name !== state.metricName) {
    state.metricName = name
    state.data = []
    state.activeColumn = null
    state.loading = false
    fetchCloudMetrics()
  }
}

// 组件卸载时清理定时器与缓存
export function destroyCloudMetrics() {
  if (state.timer) {
    clearInterval(state.timer)
    state.timer = null
  }
  state.data = []
  state.activeColumn = null
  state.loading = false
}

/** 数据到达后，通过 overrideIndicator 换新 calc 引用强制图表重算 */
function forceRefresh() {
  const chart = state.chartGetter ? state.chartGetter() : null
  if (!chart) return
  try {
    chart.overrideIndicator({
      name: 'cloudMetrics',
      calc: (dataList) => template.calc(dataList)
    })
  } catch (e) {
    console.warn('云指标刷新失败:', e)
  }
}

/**
 * 从后端 REST 接口获取云指标数据。
 * 调用 getCloudMetric(name, start, end)，返回多列 DataFrame，
 * 取第一列作为 K线叠加值。
 */
async function fetchCloudMetrics(CloudMetricName) {
  // 设置定时刷新（仅首次调用时设置一次）
  const cloudMetricStore = useCloudMetricStore() // 确保 store 已初始化
  if (!state.timer) {
    state.timer = setInterval(() => {
      fetchCloudMetrics(CloudMetricName)
    }, REFRESH_INTERVAL)
  }

  try {
    const searchStore = useSearchParametersStore()
    cloudMetricStore.metricList = await listCloudMetrics()
    state.metricName = cloudMetricStore.metricList[CloudMetricName].name
    const ret = await getCloudMetric(
      state.metricName,
      searchStore.startDate || '',
      searchStore.endDate || ''
    )

    const columns = ret.columns || []
    if (columns.length === 0 || !ret.data || ret.data.length === 0) {
      console.warn(`云指标「${state.metricName}」无数据或无列`)
      state.data = []
      state.activeColumn = null
      state.loading = false
      return
    }

    // 取第一列作为 K线叠加展示值
    const col = columns[0]
    state.activeColumn = columns
    state.data = ret.data
      .filter(item => item.value !== null && !Number.isNaN(item.value))
      .sort((a, b) => a.timestamp - b.timestamp)

    state.loading = false
    forceRefresh()
  } catch (e) {
    console.error('云指标获取失败:', e)
    state.data = []
    state.activeColumn = null
    state.loading = false
  }
}

// 仅刷新云指标数据（由 URL 参数 cloud=true 触发；清除缓存后重新拉取并强制重算）。
// 纯新增导出，不影响原有逻辑。
export function refreshCloudMetrics() {
  state.data = []
  state.activeColumn = null
  state.loading = false
  fetchCloudMetrics(state.metricName)
}
