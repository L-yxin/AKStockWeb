<template>
  <div class="indicator-panel">
    <div class="panel-head">
      <el-button type="primary" size="default" @click="resetTechnicalIndicators">
        更新支持的技术指标列表
      </el-button>
      <span class="panel-tip">勾选启用指标，点击参数可修改</span>
    </div>

    <div class="indicator-list">
      <div v-for="(config, name) in K_lineTechnicalIndicators" :key="name" class="indicator-row">
        <el-checkbox v-model="config.enabled" @change="(val) => onIndicatorToggle(name, val)">
          {{ name }}
        </el-checkbox>

        <el-checkbox v-model="config.onMainChart" :disabled="!config.enabled" size="small" class="main-chart-cb"
          @change="(val) => onMainChartToggle(name, val)">
          主图
        </el-checkbox>

        <div class="params-area">
          <el-tag v-for="(p, idx) in config.params" :key="idx" size="small" type="info" effect="plain"
            class="param-tag">
            {{ p }}
          </el-tag>
          <el-button :disabled="!config.enabled" size="small" text @click="openParamsDialog(name)">
            <el-icon><Edit /></el-icon>
          </el-button>
        </div>
      </div>
    </div>

    <!-- 编辑参数对话框 -->
    <el-dialog v-model="dialogVisible" :title="`编辑 ${editingIndicator} 参数`" width="420px" append-to-body>
      <el-form label-width="90px">
        <el-form-item label="参数值">
          <el-input v-model="tempParamsInput" placeholder="多个参数用英文逗号分隔，如 5,10,20" />
          <div class="hint">
            当前默认：{{ editingIndicator ? defaultParamsHint(editingIndicator) : '' }}
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveParams">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { Edit } from '@element-plus/icons-vue'
import { getSupportedIndicators } from 'klinecharts'
import { DEFAULT_PARAMS, MAIN_CHART_INDICATORS } from '@/config/indicatorDefaults'

const props = defineProps({
  // kLineView 组件的模板 ref 解包后的组件实例（props.chartRef.chart 为图表实例）
  chartRef: { type: Object, required: true },
  // 预置已启用的指标（启动时由主界面在图表上创建的指标，面板需同步勾选状态）
  presetEnabled: { type: Array, default: () => [] },
})

// 获取图表实例的辅助函数
const getChart = () => props.chartRef?.chart
const searchStore = useSearchParametersStore()

// 把面板勾选状态同步到 store（K线对象重建后由 kLineView 据此重放指标）
const syncStore = () => {
  const list = Object.entries(K_lineTechnicalIndicators)
    .filter(([, cfg]) => cfg.enabled)
    .map(([name, cfg]) => ({ name, calcParams: [...cfg.params], onMainChart: cfg.onMainChart }))
  searchStore.setEnabledIndicators(list)
}

// ---------- 指标列表状态 ----------
const K_lineTechnicalIndicators = reactive({})

// klinecharts v10 返回的 Indicator.calcParams 运行时可能是数组，也可能是
// 类数组普通对象（{'0':5,'1':10,...}），统一转成真正的数组
const toParamsArray = (c) => {
  if (Array.isArray(c)) return [...c]
  if (c && typeof c === 'object') return Object.values(c)
  return []
}

// 通过 klinecharts API 读取图表上真实指标对象（Indicator 含 name/paneId/calcParams），
// 把真实计算参数回填到面板显示——只认 klinecharts 返回的对象，不依赖默认值。
const syncParamsFromChart = () => {
  const chart = getChart()
  if (!chart) return
  let indicators = []
  try {
    indicators = chart.getIndicators() || []
  } catch (e) {
    console.error('[IndicatorPanel] 读取图表指标失败:', e)
    return
  }
  if (!indicators.length) return
  indicators.forEach(ind => {
    if (!ind || !ind.name) return
    const calcParams = toParamsArray(ind.calcParams)
    if (!K_lineTechnicalIndicators[ind.name]) {
      K_lineTechnicalIndicators[ind.name] = { enabled: false, onMainChart: false, params: [] }
    }
    Object.assign(K_lineTechnicalIndicators[ind.name], {
      enabled: true,
      onMainChart: ind.paneId === 'candle_pane',
      params: calcParams.length ? calcParams : K_lineTechnicalIndicators[ind.name].params,
    })
  })
}

const resetTechnicalIndicators = () => {
  const supported = getSupportedIndicators()
  // 以 store 中的已启用指标为唯一权威来源（K线对象重建也据此重放），
  // presetEnabled 仅作兜底（如 store 尚未初始化）
  const storeState = {}
  searchStore.enabledIndicators.forEach(it => { storeState[it.name] = it })
  const t = {}
  supported.forEach(name => {
    const s = storeState[name]
    t[name] = {
      enabled: !!s || props.presetEnabled.includes(name),
      onMainChart: s ? !!s.onMainChart : MAIN_CHART_INDICATORS.includes(name),
      params: s && Array.isArray(s.calcParams) && s.calcParams.length
        ? [...s.calcParams]
        : (DEFAULT_PARAMS[name] ? [...DEFAULT_PARAMS[name]] : []),
    }
  })
  Object.assign(K_lineTechnicalIndicators, t)
  // 图表上已创建的指标，以 klinecharts API 返回的真实参数覆盖面板显示
  syncParamsFromChart()
}
resetTechnicalIndicators()

// 挂载后图表实例必然就绪，再同步一次 klinecharts API 的真实指标参数。
// kLineView 的指标重放随数据加载异步完成，getIndicators 在重放完成前可能不完整，
// 故短间隔重试若干次，保证面板拿到的是图表上最终的真实 calcParams。
onMounted(() => {
  let tries = 0
  const trySync = () => {
    syncParamsFromChart()
    tries++
    if (tries < 15) setTimeout(trySync, 250)
  }
  trySync()
})

// ---------- 参数编辑 ----------
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
  syncStore()
  ElMessage.success('参数已更新')
}

// ---------- 指标开关 ----------
function onIndicatorToggle(name, enabled) {
  const chart = getChart()
  if (!chart) return

  const config = K_lineTechnicalIndicators[name]
  if (!config) return

  if (enabled) {
    const onMain = config.onMainChart
    const paneId = onMain ? 'candle_pane' : `${name}_pane`
    try {
      // v10 API：createIndicator(value, isStack, paneOptions)
      //  - 指标名与 calcParams 必须放入第一个参数对象（旧实现放第三个参数会被丢弃）
      //  - 主图指标叠加到 candle_pane（isStack=true），副图指标独立窗格
      if (config.params.length === 0) {
       chart.createIndicator({ name, }, onMain, { id: paneId })
      }
      else{
        chart.createIndicator({ name, calcParams: config.params }, onMain, { id: paneId })
      }
    } catch (e) {
      console.error('添加指标失败:', e)
      ElMessage.error(`添加指标 ${name} 失败`)
      config.enabled = false // 回滚
    }
  } else {
    try {
      chart.removeIndicator({ name })
    } catch (e) {
      console.error('移除指标失败:', e)
      ElMessage.error(`移除指标 ${name} 失败`)
    }
  }
  syncStore()
}

const onMainChartToggle = (name, onMain) => {
  const chart = getChart()
  if (!chart) return
  const config = K_lineTechnicalIndicators[name]
  if (!config || !config.enabled) return
  chart.removeIndicator({ name })
  onIndicatorToggle(name, true)
}
const updateIndicator = (name) => {
  const chart = getChart()
  if (!chart) return
  const config = K_lineTechnicalIndicators[name]
  if (!config || !config.enabled) return
  chart.overrideIndicator({ name, calcParams: config.params })
}

defineExpose({ onIndicatorToggle })
</script>

<style scoped>
.indicator-panel {
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
.indicator-list {
  max-height: 72vh;
  overflow-y: auto;
  border: 1px solid rgba(148, 163, 184, 0.15);
  border-radius: 8px;
  padding: 12px;
  background: rgba(255, 255, 255, 0.02);
}
.indicator-row {
  display: flex;
  align-items: center;
  margin-bottom: 12px;
}
.indicator-row:last-child {
  margin-bottom: 0;
}
.main-chart-cb {
  margin-left: 12px;
}
.params-area {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 6px;
}
.param-tag {
  font-variant-numeric: tabular-nums;
}
.hint {
  font-size: 12px;
  color: #64748b;
  margin-top: 4px;
}
</style>
