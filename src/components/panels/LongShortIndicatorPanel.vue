<template>
  <div class="ls-panel">
    <div class="panel-head">
      <el-button type="primary" @click="enableSelectedLongShortIndicators">
        启用选择的多空指标
      </el-button>
      <span class="panel-tip">从后台加载指标目录后勾选启用</span>
    </div>

    <el-form label-position="top" class="ls-form">
      <!-- 买入指标 -->
      <el-divider content-position="left" class="divider-buy">买入指标</el-divider>
      <div v-for="item in buyingAndSellingIndicator.buy" :key="item.method" class="indicator-card">
        <el-checkbox v-model="item.enabled">
          <span class="indicator-name">{{ item.info }}</span>
        </el-checkbox>
        <el-tooltip v-if="item.params.doc" :content="item.params.doc" placement="top">
          <el-icon class="doc-icon"><InfoFilled /></el-icon>
        </el-tooltip>

        <!-- 参数配置区域 -->
        <div v-if="item.enabled && hasUserParams(item)" class="params-block">
          <div v-for="param in getUserParams(item)" :key="param.name" class="param-row">
            <label class="param-label">
              {{ param.name }}
              <el-tag size="small" type="info" effect="plain" class="param-type">{{ formatType(param.annotation) }}</el-tag>
              <span v-if="param.required" class="required">*</span>
            </label>
            <component :is="getInputComponent(param.annotation)" v-model="indicatorParams[item.method][param.name]"
              v-bind="getInputProps(param)" class="param-input" />
          </div>
        </div>
      </div>

      <!-- 卖出指标 -->
      <el-divider content-position="left" class="divider-sell">卖出指标</el-divider>
      <div v-for="item in buyingAndSellingIndicator.sell" :key="item.method" class="indicator-card">
        <el-checkbox v-model="item.enabled">
          <span class="indicator-name">{{ item.info }}</span>
        </el-checkbox>
        <el-tooltip v-if="item.params.doc" :content="item.params.doc" placement="top">
          <el-icon class="doc-icon"><InfoFilled /></el-icon>
        </el-tooltip>

        <!-- 参数配置区域 -->
        <div v-if="item.enabled && hasUserParams(item)" class="params-block">
          <div v-for="param in getUserParams(item)" :key="param.name" class="param-row">
            <label class="param-label">
              {{ param.name }}
              <el-tag size="small" type="info" effect="plain" class="param-type">{{ formatType(param.annotation) }}</el-tag>
              <span v-if="param.required" class="required">*</span>
            </label>
            <component :is="getInputComponent(param.annotation)" v-model="indicatorParams[item.method][param.name]"
              v-bind="getInputProps(param)" class="param-input" />
          </div>
        </div>
      </div>
    </el-form>
  </div>
</template>

<script setup>
import { InfoFilled } from '@element-plus/icons-vue'
import { ws_buyingAndSellingIndicator_url, ws_getLongShortSignal_url } from '@/api'

const props = defineProps({
  chartRef: { type: Object, required: true },
})

const getChart = () => props.chartRef?.chart
const getComponent = () => props.chartRef

const searchStore = useSearchParametersStore()

// ---------- 买卖提示指标状态 ----------
const buyingAndSellingIndicator = reactive({ buy: [], sell: [] })
const indicatorParams = reactive({})

// 辅助函数：判断是否为自动注入的参数（不需要用户配置）
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

const hasUserParams = (item) => getUserParams(item).length > 0

const getUserParams = (item) => {
  if (!item.params || !item.params.params) return []
  return item.params.params.filter(p => !isAutoInjectedParam(p.name, p.annotation))
}

const formatType = (annotation) => {
  if (!annotation) return 'any'
  const match = annotation.match(/'([^']+)'/)
  if (match) return match[1]
  // 修复：旧实现 split('.')[-1] 恒为 undefined，改用 pop()
  const parts = annotation.replace('<class ', '').replace('>', '').split('.')
  return parts[parts.length - 1] || 'any'
}

const getInputComponent = (annotation) => {
  try {
    const type = formatType(annotation).toLowerCase()
    if (type.includes('int') || type.includes('float')) return 'el-input-number'
    if (type.includes('bool')) return 'el-switch'
  } catch (e) {
    return 'el-input'
  }
  return 'el-input'
}

const getInputProps = (param) => {
  const type = formatType(param.annotation).toLowerCase()
  const propsObj = { placeholder: `请输入${param.name}` }
  if (type.includes('int')) {
    propsObj.step = 1
    propsObj.precision = 0
    propsObj.controlsPosition = 'right'
  } else if (type.includes('float')) {
    propsObj.step = 0.0001
    propsObj.precision = 4
    propsObj.controlsPosition = 'right'
  } else if (type.includes('bool')) {
    propsObj.activeText = '开启'
    propsObj.inactiveText = '关闭'
  }
  return propsObj
}

// ---------- 加载买卖指标数据 ----------
const loadIndicators = () => {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(ws_buyingAndSellingIndicator_url)
    ws.onopen = () => ws.send("")
    ws.onmessage = (event) => {
      resolve(event.data)
      ws.close()
    }
    ws.onerror = (error) => {
      ElMessage.error("获取买卖指标失败: " + error)
      reject(error)
      ws.close()
    }
  }).then(raw => {
    let data
    try {
      data = JSON.parse(raw)
    } catch (e) {
      throw new Error('买卖指标目录数据格式不正确')
    }
    const buyRaw = JSON.parse(data.buy)
    const sellRaw = JSON.parse(data.sell)

    // 将对象结构转换为数组
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

    buyingAndSellingIndicator.buy = convertToArray(buyRaw)
    buyingAndSellingIndicator.sell = convertToArray(sellRaw)

    // 初始化参数默认值
    const allItems = [...buyingAndSellingIndicator.buy, ...buyingAndSellingIndicator.sell]
    allItems.forEach(item => {
      if (!indicatorParams[item.method]) {
        indicatorParams[item.method] = {}
      }
      const paramsList = item.params?.params || []
      paramsList.forEach(p => {
        if (!isAutoInjectedParam(p.name, p.annotation)) {
          if (!(p.name in indicatorParams[item.method])) {
            indicatorParams[item.method][p.name] = p.default !== null ? p.default : getDefaultByType(p.annotation)
          }
        }
      })
    })
  }).catch(err => console.error('加载买卖指标失败:', err))
}

// ---------- 启用选择的多空指标 ----------
const enableSelectedLongShortIndicators = () => {
  // 合并买入和卖出指标
  const allItems = [...buyingAndSellingIndicator.buy, ...buyingAndSellingIndicator.sell]
  const enabledItems = allItems.filter(item => item.enabled)

  if (enabledItems.length === 0) {
    ElMessage.warning('请至少选择一个多空指标')
    return null
  }

  // 构造启用指标的配置数组
  const enabledConfigs = enabledItems.map(item => {
    const config = {
      method: item.method,
      type: item.type,
      info: item.info,
      params: {}
    }

    // 获取该指标的用户参数值
    const userParams = indicatorParams[item.method] || {}
    const paramMetaList = item.params?.params || []

    paramMetaList.forEach(meta => {
      const paramName = meta.name
      // 仅处理用户可配置的参数（非自动注入的）
      if (!isAutoInjectedParam(paramName, meta.annotation)) {
        config.params[paramName] = userParams[paramName]
      }
    })

    return config
  })

  // 当前周期（如 "1d"）
  let period = '1d'
  const chart = getChart()
  if (chart) {
    const p = chart.getPeriod()
    if (p) period = `${p.span}${p.type[0]}`
  }

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(ws_getLongShortSignal_url)
    ws.onopen = () => ws.send(JSON.stringify({
      period,
      symbol: searchStore.symbol,
      startTime: searchStore.startDate,
      endTime: searchStore.endDate,
      indicators: enabledConfigs,
      t: new Date().getTime()
    }))
    ws.onmessage = (event) => {
      ElMessage.success("多空指标启用成功")
      resolve(event.data)
      ws.close()
    }
    ws.onerror = (error) => {
      ElMessage.error("启用多空指标失败: " + error)
      reject(error)
      ws.close()
    }
  }).then(data => {
    if (data) {
      return JSON.parse(data).data
    }
  }).then(parsedData => {
    if (!Array.isArray(parsedData)) {
      throw new Error("返回数据格式不正确，预期为数组")
    }
    const component = getComponent()
    const chart = getChart()
    if (!component || !chart) return
    component.clearAllMarkers(chart)
    // 保存信号到 store（含 timestamp），供模拟交易跳柱时按柱提示
    const signalsWithTs = []
    for (const signal of parsedData) {
      const period = signal.period
      const timestamp = (() => {
        // 与 K 线时间戳语义一致：本地时间显式 +08:00 转 epoch
        const dt = String(signal.datetime)
        const iso = dt.includes('T') ? dt : dt.replace(' ', 'T')
        const tsStr = /\d{1,2}:\d{2}(:\d{2})?/.test(iso) ? iso : iso + 'T00:00:00'
        const t = new Date(tsStr + '+08:00').getTime()
        if (period === "1d") {
          // 如果是日线，调整为当天的00:00（本地时区下的当天零点）
          const local = new Date(t + 8 * 3600 * 1000)
          const localMidnight = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()))
          return localMidnight.getTime() - 8 * 3600 * 1000
        }
        return t
      })()
      const type = (() => {
        if (signal.type === "buy") return "BULL"
        if (signal.type === "sell") return "BEAR"
        return signal.type
      })()
      const value = (() => {
        if (type === "BULL") return signal.low
        if (type === "BEAR") return signal.high
        return signal.value
      })()

      signalsWithTs.push({
        period,
        datetime: String(signal.datetime),
        timestamp,
        type: signal.type,       // 原始 buy|sell（模拟交易提示用）
        message: signal.message,
        value,
        low: signal.low,
        high: signal.high,
      })
      component.addMarkers(chart, [{ timestamp, type, value, mes: signal.message }], "predict")
    }
    searchStore.setLongShortSignals(signalsWithTs)
  }).catch(err => console.error('启用多空指标失败:', err))
}

onMounted(() => {
  loadIndicators()
})
</script>

<style scoped>
.ls-panel {
  padding: 4px 8px;
}
.panel-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}
.panel-tip {
  font-size: 12px;
  color: #64748b;
}
.ls-form {
  max-height: 80vh;
  overflow-y: auto;
}
.divider-buy :deep(.el-divider__text) {
  color: #ef4444;
  font-weight: 600;
}
.divider-sell :deep(.el-divider__text) {
  color: #3b82f6;
  font-weight: 600;
}
.indicator-card {
  margin-bottom: 16px;
  border: 1px solid rgba(148, 163, 184, 0.15);
  padding: 12px 14px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.02);
}
.indicator-name {
  font-weight: 600;
  color: #e2e8f0;
}
.doc-icon {
  margin-left: 6px;
  color: #64748b;
  vertical-align: -2px;
}
.params-block {
  margin-top: 10px;
  padding-left: 24px;
}
.param-row {
  margin-bottom: 12px;
}
.param-row:last-child {
  margin-bottom: 0;
}
.param-label {
  font-size: 13px;
  color: #94a3b8;
  display: block;
  margin-bottom: 4px;
}
.param-type {
  margin-left: 8px;
}
.required {
  color: #f56c6c;
  margin-left: 4px;
}
.param-input {
  width: 100%;
}
</style>
