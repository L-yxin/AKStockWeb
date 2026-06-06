<template>
  <el-container>
    <el-main>
      <selection-device-view />

      <!-- 菜单栏 -->
      <el-row style="border: 1px solid black; background-color:#007CC4; padding: 10px 0; align-items: center;">
        <el-col :span="5" class="menu-item" @click="openDrawer('setting')">
          <el-icon><Setting /></el-icon>
          <span>设置</span>
        </el-col>

        <el-divider direction="vertical" style="height: 35px;" />

        <el-col :span="5" class="menu-item" @click="openDrawer('K_lineTechnicalIndicators')">
          <el-icon><TrendCharts /></el-icon>
          <span>K线技术指标</span>
        </el-col>

        <el-divider direction="vertical" style="height: 35px;" />

        <el-col :span="5" class="menu-item" @click="openDrawer('buyingAndSellingIndicator')">
          <el-icon><Bell /></el-icon>
          <span>买卖提示指标</span>
        </el-col>
        <el-divider direction="vertical" style="height: 35px;" />
        <el-col :span="5" class="menu-item" @click="loadGetTradingSignals">
          <el-icon><Bell /></el-icon>
          <span>加载pybroker订单</span>
        </el-col>
      </el-row>

      <k-line-view ref="klineRef" />
    </el-main>

    <el-aside width="300px" class="transaction">
      <el-text type="primary">交易面板（待开发）</el-text>
      <el-button type="primary" style="margin: 20px;">自由交易</el-button>
      <el-button type="success" style="margin: 20px;">测试买卖点手动交易</el-button>
      <el-button type="danger" style="margin: 20px;">测试买卖点自动交易</el-button>
    </el-aside>
  </el-container>

  <!-- 设置抽屉 -->
  <el-drawer v-model="drawerVisible" :title="getCH(activeMenu)" direction="rtl" size="500px" append-to-body>
    <div v-if="activeMenu === 'setting'">
      <el-form label-position="left" label-width="200px">
        <el-form-item label="python后台数据互联网同步">
          <el-button type="primary" @click="PythonBackgroundBataInternetSynchronization">python后台数据互联网同步</el-button>
        </el-form-item>
      </el-form>
    </div>

    <div v-else-if="activeMenu === 'K_lineTechnicalIndicators'" class="indicator-panel">
      <el-button type="primary" @click="resetTechnicalIndicators" style="margin-bottom: 20px;">
        更新支持的技术指标列表
      </el-button>
      <el-form label-position="left" label-width="160px">
        <div class="indicator-list">
          <div v-for="(config, name) in K_lineTechnicalIndicators" :key="name" class="indicator-row">
            <el-checkbox v-model="config.enabled" @change="(val) => onIndicatorToggle(name, val)">
              {{ name }}
            </el-checkbox>

            <el-checkbox v-model="config.onMainChart" :disabled="!config.enabled" size="small" style="margin-left: 12px"
              @change="(val) => onMainChartToggle(name, val)">
              主图
            </el-checkbox>

            <div class="params-area">
              <el-tag v-for="(p, idx) in config.params" :key="idx" size="small" type="info" effect="plain"
                style="margin-right: 4px">
                {{ p }}
              </el-tag>
              <el-button :disabled="!config.enabled" size="small" text @click="openParamsDialog(name)">
                <el-icon><Edit /></el-icon>
              </el-button>
            </div>
          </div>
        </div>
      </el-form>
    </div>

    <div v-else-if="activeMenu === 'buyingAndSellingIndicator'">
      <el-button type="primary" @click="enableSelectedLongShortIndicators" style="margin-bottom: 20px;">启用选择的多空指标</el-button>
      <el-form label-position="top" class="buyingAndSellingIndicator-form">
        <!-- 买入指标 -->
        <el-divider content-position="left" style="border-top:5px solid red">买入指标</el-divider>
        <div v-for="item in buyingAndSellingIndicator.buy" :key="item.method"
          style="margin-bottom: 20px; border: 1px solid #eee; padding: 12px; border-radius: 8px;">
          <el-checkbox v-model="item.enabled">
            <span style="font-weight: bold;">{{ item.info }}</span>
          </el-checkbox>
          <el-tooltip v-if="item.params.doc" :content="item.params.doc" placement="top">
            <el-icon style="margin-left: 5px; color: #909399;"><InfoFilled /></el-icon>
          </el-tooltip>

          <!-- 参数配置区域 -->
          <div v-if="item.enabled && hasUserParams(item)" style="margin-top: 10px; padding-left: 24px;">
            <div v-for="param in getUserParams(item)" :key="param.name" style="margin-bottom: 12px;">
              <label style="font-size: 13px; color: #606266; display: block; margin-bottom: 4px;">
                {{ param.name }}
                <el-tag size="small" type="info" effect="plain" style="margin-left: 8px;">{{
                  formatType(param.annotation) }}</el-tag>
                <span v-if="param.required" style="color: #f56c6c; margin-left: 4px;">*</span>
              </label>

              <component :is="getInputComponent(param.annotation)" v-model="indicatorParams[item.method][param.name]"
                v-bind="getInputProps(param)" style="width: 100%;" />
            </div>
          </div>
        </div>

        <!-- 卖出指标 -->
        <el-divider content-position="left" style="border-top:5px solid blue">卖出指标</el-divider>
        <div v-for="item in buyingAndSellingIndicator.sell" :key="item.method"
          style="margin-bottom: 20px; border: 1px solid #eee; padding: 12px; border-radius: 8px;">
          <el-checkbox v-model="item.enabled">
            <span style="font-weight: bold;">{{ item.info }}</span>
          </el-checkbox>
          <el-tooltip v-if="item.params.doc" :content="item.params.doc" placement="top">
            <el-icon style="margin-left: 5px; color: #909399;"><InfoFilled /></el-icon>
          </el-tooltip>

          <!-- 参数配置区域 -->
          <div v-if="item.enabled && hasUserParams(item)" style="margin-top: 10px; padding-left: 24px;">
            <div v-for="param in getUserParams(item)" :key="param.name" style="margin-bottom: 12px;">
              <label style="font-size: 13px; color: #606266; display: block; margin-bottom: 4px;">
                {{ param.name }}
                <el-tag size="small" type="info" effect="plain" style="margin-left: 8px;">{{
                  formatType(param.annotation) }}</el-tag>
                <span v-if="param.required" style="color: #f56c6c; margin-left: 4px;">*</span>
              </label>

              <component :is="getInputComponent(param.annotation)" v-model="indicatorParams[item.method][param.name]"
                v-bind="getInputProps(param)" style="width: 100%;" />
            </div>
          </div>
        </div>
       
      </el-form>
    </div>
  </el-drawer>

  <!-- 编辑参数对话框 -->
  <el-dialog v-model="dialogVisible" :title="`编辑 ${editingIndicator} 参数`" width="400px" append-to-body>
    <el-form label-width="100px">
      <el-form-item label="参数值">
        <el-input v-model="tempParamsInput" placeholder="多个参数用英文逗号分隔，如 5,10,20" />
        <div class="hint">
          当前默认：
          {{ editingIndicator ? defaultParamsHint(editingIndicator) : '' }}
        </div>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="dialogVisible = false">取消</el-button>
      <el-button type="primary" @click="saveParams">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { Setting, TrendCharts, Bell, Edit, InfoFilled } from '@element-plus/icons-vue'
import { ws_syncData_url, ws_buyingAndSellingIndicator_url, ws_getLongShortSignal_url,ws_getTradingSignals_url } from '@/api'
import { getSupportedIndicators } from 'klinecharts'

const searchStore = useSearchParametersStore()


// 抽屉控制
const drawerVisible = ref(false)
const activeMenu = ref('')
const klineRef = ref(null)

// ---------- K线技术指标 ----------
const DEFAULT_PARAMS = {
  MA: [5, 10, 20, 60],
  EMA: [6, 12, 20],
  MACD: [12, 26, 9],
  KDJ: [9, 3, 3],
  RSI: [6, 12, 24],
  BOLL: [20, 2],
  VOL: [5, 10, 20],
}
const K_lineTechnicalIndicators = reactive({})
const resetTechnicalIndicators = () => {
  let ind = getSupportedIndicators()
  let t = {}
  ind.forEach(name => {
    t[name] = {
      enabled: false,
      onMainChart: name === 'MA' || name === 'EMA' || name === 'BOLL',
      params: DEFAULT_PARAMS[name] ? [...DEFAULT_PARAMS[name]] : [],
    }
  })
  Object.assign(K_lineTechnicalIndicators, t)
 
}
resetTechnicalIndicators()

// ---------- 买卖提示指标 ----------
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
  return annotation.replace('<class ', '').replace('>', '').split('.')[-1] || 'any'
  
}

const getInputComponent = (annotation) => {
  try{
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
  const props = { placeholder: `请输入${param.name}` }
  if (type.includes('int')) {
    props.step = 1
    props.precision = 0
    props.controlsPosition = 'right'
  } else if (type.includes('float')) {
    props.step = 0.1
    props.precision = 2
    props.controlsPosition = 'right'
  } else if (type.includes('bool')) {
    props.activeText = '开启'
    props.inactiveText = '关闭'
  }
  return props
}

// 加载买卖指标数据
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
    const data = JSON.parse(raw)
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
        let value = userParams[paramName]
        config.params[paramName] = value
      }
    })

    return config
  })


  return new Promise((resolve, reject) => {
    const ws = new WebSocket(ws_getLongShortSignal_url)
    ws.onopen = () => ws.send(JSON.stringify({
      period: (()=>{
        let t = klineRef.value?.chart?.getPeriod()
        return t["span"]+t["type"][0]
      })(),
      symbol: searchStore.symbol,
      startTime: searchStore.startDate,
      endTime: searchStore.endDate,
      indicators: enabledConfigs,
      t:new Date().getTime()
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
      return JSON.parse(data)
    }
  }).then(parsedData => {
    if (!Array.isArray(parsedData)){
      throw new Error("返回数据格式不正确，预期为数组")
    }
    const chart = klineRef.value?.chart
    klineRef.value?.clearAllMarkers(chart)
    for(const signal of parsedData){
      let period = signal.period
      let timestamp = (()=>{
        let t = new Date(signal.datetime).getTime()
        if (period === "1d"){
          // 如果是日线，调整为当天的15:00（假设数据时间为当天的00:00）
          const date = new Date(t)
          date.setHours(0, 0, 0, 0)
          date.setDate(date.getDate())
          return date.getTime()
        }
      })()
      let type = (()=>{
        let t = signal.type
        if (t==="buy"){
          return "BULL"
        }else if (t==="sell"){
          return "BEAR"
        }
      })()

      let value = (()=>{
        if (type === "BULL")return signal.low
        if (type === "BEAR")return signal.high
      })()

      let res = {timestamp, type, value,mes:signal.message}
      klineRef.value?.addMarkers(chart, [res],"predict")
    }
  }).catch(err => console.error('启用多空指标失败:', err))
}


// pyb
const loadGetTradingSignals = () => {
  // 关闭旧的连接（避免重复）
 
  const ws = new WebSocket(ws_getTradingSignals_url)

  ws.onopen = () => {
    // 后端在接受连接后会自动推送数据，无需发送任何请求
    console.log('交易信号 WebSocket 已连接')
  }

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data)
      if (!data || !Array.isArray(data.configs)) {
        throw new Error('返回数据格式不正确，预期包含 configs 数组')
      }

      const chart = klineRef.value?.chart
      if (!chart) {
        ElMessage.error('图表实例未就绪')
        return
      }

      // 1. 清除旧的信号标记
      klineRef.value?.clearAllMarkers(chart)

      // 2. 遍历信号，转换为标记参数并添加
      const markers = []
      for (const signal of data.configs) {
        const { datetime, value, type, mes } = signal

        // 构造时间戳（模仿参考模板中的日线处理）
        const t = new Date(datetime + 'T00:00:00').getTime() // 将日期字符串转为当天0点时间戳
        const date = new Date(t)
        date.setHours(0, 0, 0, 0)
        const timestamp = date.getTime()


        markers.push({
          timestamp,
          value,          // 价格位置
          type: type,
          mes              // 悬停显示的消息
        })
      }

      // 3. 将所有标记一次性添加到图表
      klineRef.value?.addMarkers(chart, markers, 'stock')

      ElMessage.success(`成功加载 ${markers.length} 个交易信号`)
    } catch (e) {
      console.error('处理交易信号失败:', e)
      ElMessage.error('处理交易信号失败：' + e.message)
    } finally {
      if (ws) ws.close()
    }
  }

  ws.onerror = (error) => {
    console.error('WebSocket 错误:', error)
    ElMessage.error('WebSocket 连接异常')
  }
}



// ---------- 技术指标相关方法 ----------
const dialogVisible = ref(false)
const editingIndicator = ref('')
const tempParamsInput = ref('')

const openParamsDialog = (name) => {
  editingIndicator.value = name
  tempParamsInput.value = K_lineTechnicalIndicators[name].params.join(',')
  dialogVisible.value = true
}

const defaultParamsHint = (name) => {
  const def = DEFAULT_PARAMS[name]
  return def ? `默认：${def.join(', ')}` : '无默认参数'
}

const saveParams = () => {
  if (!editingIndicator.value) return
  const raw = tempParamsInput.value.trim()
  let arr = []
  if (raw) {
    arr = raw.split(',').map(v => {
      const num = parseFloat(v)
      return isNaN(num) ? null : num
    })
    if (arr.some(v => v === null)) {
      ElMessage.warning('参数必须为数字，请检查输入')
      return
    }
  }
  const name = editingIndicator.value
  K_lineTechnicalIndicators[name].params = arr
  dialogVisible.value = false
  if (K_lineTechnicalIndicators[name].enabled) {
    updateIndicator(name)
  }
  ElMessage.success('参数已更新')
}

function onIndicatorToggle(name, enabled) {
  const chart = klineRef.value?.chart
  if (!chart) return

  const config = K_lineTechnicalIndicators[name]
  if (enabled) {
    // 添加指标
    const forceNewPane = config.onMainChart
    const options = {
      name,
      calcParams: config.params,
      id: forceNewPane ? "candle_pane" : `${name}_pane` // 强制主图使用candle_pane，副图使用独立pane
    }

    try {
      chart.createIndicator(name, forceNewPane, options)
    } catch (e) {
      ElMessage.error(`添加指标 ${name} 失败`)
      config.enabled = false // 回滚
    }
  } else {
    // 移除指标
    try {
      // 移除指标需要指定 paneId，由于我们可能添加在多个窗格，需遍历移除
      // 简化：假设每个指标只有一个实例，调用 removeIndicator 并传入指标名称
      chart.removeIndicator({ name: name })

    } catch (e) {
      ElMessage.error(`移除指标 ${name} 失败`)
    }
  }
}

const onMainChartToggle = (name, onMain) => {
  const chart = klineRef.value?.chart
  if (!chart) return
  const config = K_lineTechnicalIndicators[name]
  if (!config.enabled) return
  chart.removeIndicator({ name })
  onIndicatorToggle(name, true)
}

const updateIndicator = (name) => {
  const chart = klineRef.value?.chart
  if (!chart) return
  const config = K_lineTechnicalIndicators[name]
  if (!config.enabled) return
  chart.overrideIndicator({ name, calcParams: config.params })
}

// ---------- 其他 ----------
const openDrawer = (menu) => {
  activeMenu.value = menu
  drawerVisible.value = true
}

const getCH = (key) => {
  const map = {
    setting: '系统设置',
    K_lineTechnicalIndicators: 'K线技术指标',
    buyingAndSellingIndicator: '买卖提示指标'
  }
  return map[key] || key
}

const PythonBackgroundBataInternetSynchronization = () => {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(ws_syncData_url)
    ws.onopen = () => ws.send("")
    ws.onmessage = (event) => {
      ElMessage.info(event.data)
      resolve(event.data)
      ws.close()
    }
    ws.onerror = (error) => {
      ElMessage.error("数据同步失败: " + error)
      reject(error)
    }
    ws.onclose = () => ElMessage.info("数据同步连接已关闭")
  })
}

onMounted(() => {
  K_lineTechnicalIndicators['VOL'].enabled = true
  K_lineTechnicalIndicators['MA'].enabled = true
  onIndicatorToggle('VOL', true)
  onIndicatorToggle('MA', true)
  loadIndicators()
})
</script>

<style scoped>
.el-container {
  width: 100%;
  height: 100%;
  color: var(--text);
}
.el-main {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.menu-item {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: #ffffff;
  cursor: pointer;
}
.menu-item:hover {
  color: #f70000;
}
.k-line-view {
  width: 70%;
  height: 80%;
}
.transaction {
  height: calc(100vh);
  border: 2px solid blue;
}
.indicator-panel {
  padding: 10px;
}
.indicator-list {
  max-height: 75vh;
  overflow-y: auto;
  border: 1px solid #ebeef5;
  border-radius: 4px;
  padding: 12px;
}
.indicator-row {
  display: flex;
  align-items: center;
  margin-bottom: 12px;
}
.params-area {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 6px;
}
.hint {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}
.buyingAndSellingIndicator-form {
  max-height: 80vh;
  overflow-y: auto;
}
</style>