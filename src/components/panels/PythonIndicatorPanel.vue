<template>
  <div class="pyind-panel">
    <div class="panel-head">
      <el-button type="primary" size="default" @click="loadList">
        刷新指标列表
      </el-button>
      <span class="panel-tip">Python 后端计算（Indicator 目录），结果缓存 5 分钟</span>
    </div>

    <!-- 添加区 -->
    <div class="add-area">
      <el-form label-width="70px" size="small">
        <el-form-item label="指标">
          <el-select v-model="selectedName" filterable placeholder="选择 Python 指标" style="width: 100%"
            @change="onSelectChange">
            <el-option v-for="it in indicatorList" :key="it.name" :value="it.name"
              :label="`${it.name}${it.doc ? ' — ' + it.doc : ''}`" />
          </el-select>
        </el-form-item>

        <!-- 数据源：仅数据参数名为 arr 的指标（mew_low_point / percent_change_nb）显示复合序列分步编辑器；
             其他指标（high/close/sequence 等）只显示基本数据选择 -->
        <el-form-item :label="dataLabel" v-if="selectedSpec">
          <div class="data-form">
            <div class="data-field">
              <span class="param-label">{{ isComposite ? '基本数据' : dataParamName }}</span>
              <el-select v-model="basicData" size="small" style="flex: 1" placeholder="基本数据列">
                <el-option v-for="b in basicOptions" :key="b" :value="b" :label="b" />
              </el-select>
              <span class="param-type">列</span>
            </div>
            <!-- 仅 arr 数据参数：复合序列分步编辑 -->
            <template v-if="isComposite">
              <div class="data-field data-head">
                <span class="param-label">复合序列</span>
                <span class="data-head-tip">分步计算（每步结果自动命名 a、b、c…）</span>
                <el-button size="small" text type="primary" @click="addStep" style="margin-left:auto">+ 步骤</el-button>
              </div>
              <!-- 步骤列表 -->
              <div v-for="(step, si) in steps" :key="si" class="step-box">
                <div class="step-head">
                  <span class="step-var">{{ stepVar(si) }} =</span>
                  <el-select v-model="step.func" filterable size="small" style="flex: 1" placeholder="选择函数"
                    @change="onStepFuncChange(step)">
                    <el-option-group label="Indicator 指标">
                      <el-option v-for="f in indicatorList" :key="f.name" :value="f.name"
                        :label="`${f.name}${f.doc ? ' — ' + f.doc.slice(0, 12) : ''}`" />
                    </el-option-group>
                    <el-option-group label="talib 函数">
                      <el-option v-for="f in talibFuncs" :key="f" :value="'talib.' + f" :label="'talib.' + f" />
                    </el-option-group>
                  </el-select>
                  <el-button size="small" text type="danger"
                    @click="removeStep(si)">×</el-button>
                </div>
                <div class="step-params">
                  <div v-for="(p, pi) in step.params" :key="pi" class="param-field">
                    <el-select v-model="p.type" size="small" style="width: 96px">
                      <el-option value="basic" label="基本数据" />
                      <el-option value="var" label="引用变量" />
                      <el-option value="number" label="数字" />
                      <el-option value="bool" label="bool" />
                    </el-select>
                    <el-select v-if="p.type === 'basic'" v-model="p.value" size="small" style="flex: 1">
                      <el-option v-for="b in basicOptions" :key="b" :value="b" :label="b" />
                    </el-select>
                    <el-select v-else-if="p.type === 'var'" v-model="p.value" size="small" style="flex: 1"
                      placeholder="引用第几步结果">
                      <el-option v-for="si2 in priorIndexes(si)" :key="si2" :value="stepVar(si2)"
                        :label="`${stepVar(si2)}（第 ${si2 + 1} 步）`" />
                    </el-select>
                    <el-input v-else v-model="p.value" size="small" style="flex: 1" placeholder="值"
                      :placeholder="p.type === 'bool' ? 'true / false / 0 / 1' : '数字'" />
                    <el-button size="small" text type="danger" @click="step.params.splice(pi, 1)">×</el-button>
                  </div>
                  <el-button size="small" text type="primary" @click="step.params.push({ type: 'number', value: '' })">
                    + 参数
                  </el-button>
                </div>
              </div>
              <!-- 最终结果选择 -->
              <div class="data-field" v-if="steps.length">
                <span class="param-label">最终结果</span>
                <el-select v-model="finalVar" size="small" style="flex: 1">
                  <el-option v-for="si2 in priorIndexes(steps.length)" :key="si2" :value="stepVar(si2)"
                    :label="`${stepVar(si2)}（第 ${si2 + 1} 步）`" />
                </el-select>
              </div>
              <div class="data-hint">
                每步函数仅限 Indicator 目录或 talib.*（参数：基本数据 / 前步变量 / 数字 / bool）；talib 多输出用 [i] 索引（如 MACD[1] 取 SIGNAL）；第一步建议基于基本数据
              </div>
            </template>
          </div>
        </el-form-item>

        <!-- 参数：表单形式（每个参数一个输入项，默认值预填，必填校验） -->
        <el-form-item label="参数" v-if="selectedSpec && selectedSpec.params.length">
          <div class="param-form">
            <div v-for="p in selectedSpec.params" :key="p.name" class="param-field">
              <span class="param-label">{{ p.name }}</span>
              <el-input v-model="paramsForm[p.name]" size="small"
                :placeholder="p.required ? '必填' : `默认 ${p.default ?? ''}`" />
              <span class="param-type">{{ p.annotation === 'bool' ? '0/1' : p.annotation }}</span>
            </div>
          </div>
        </el-form-item>
        <el-form-item label="参数" v-else-if="selectedSpec">
          <span class="no-param">该指标无参数</span>
        </el-form-item>

        <el-form-item label="位置">
          <el-radio-group v-model="onMainChart">
            <el-radio :value="false">副图</el-radio>
            <el-radio :value="true">主图</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item>
          <el-button type="success" size="small" :disabled="!selectedName || applying" :loading="applying"
            @click="doApply(false)">
            添加 / 刷新
          </el-button>
          <el-button size="small" :disabled="!selectedName || refreshing" :loading="refreshing"
            @click="doApply(true)">
            强制重算
          </el-button>
        </el-form-item>
      </el-form>
    </div>

    <!-- 已应用列表 -->
    <div class="applied-head">已应用（{{ appliedList.length }}）</div>
    <div class="applied-list" v-if="appliedList.length">
      <div v-for="it in appliedList" :key="it.name" class="applied-row">
        <span class="ind-name">{{ it.name }}</span>
        <el-tag v-if="it.data" size="small" type="primary" effect="plain" class="data-tag">
          数据: {{ it.data }}
        </el-tag>
        <el-tag v-for="(p, idx) in it.params" :key="idx" size="small" type="info" effect="plain" class="param-tag">
          {{ p }}
        </el-tag>
        <el-tag :type="it.onMainChart ? 'warning' : 'success'" size="small" effect="plain">
          {{ it.onMainChart ? '主图' : '副图' }}
        </el-tag>
        <el-button size="small" text type="danger" @click="removeOne(it.name)">
          <el-icon><Delete /></el-icon>
        </el-button>
      </div>
    </div>
    <el-empty v-else description="尚未应用 Python 指标" :image-size="60" />
  </div>
</template>

<script setup>
import { Delete } from '@element-plus/icons-vue'
import { getPyIndicatorList } from '@/api'
import { applyPyIndicator, removePyIndicator } from '@/chart/indicators/pyInd'

const props = defineProps({
  // kLineView 组件模板 ref 解包后的实例（props.chartRef.chart 为图表实例）
  chartRef: { type: Object, required: true },
})

const getChart = () => props.chartRef?.chart
const searchStore = useSearchParametersStore()

// klinecharts Period → 后端 period 参数（与 kLineView.periodToBackend 一致）
const periodToBackend = (p) => {
  if (!p) return '1d'
  const { type, span } = p
  if (type === 'minute') return `${span}m`
  if (type === 'hour') return `${span}h`
  if (type === 'day') return '1d'
  if (type === 'week') return '1w'
  if (type === 'month') return '1M'
  return '1d'
}

// ---------- 状态 ----------
const indicatorList = ref([])
const selectedName = ref('')
const onMainChart = ref(false)
const applying = ref(false)
const refreshing = ref(false)
const appliedList = ref([])

// 参数表单：{ 参数名: 输入值 }，切换指标时重建并预填默认值
const paramsForm = reactive({})
// 数据源：基本数据列（默认 close）+ 复合序列分步编辑器
const basicData = ref('close')
const basicOptions = ['close', 'high', 'low', 'open', 'volume', 'amount']
// 步骤：{ func: 'talib.MA' | 指标名, params: [{type:'basic'|'var'|'number'|'bool', value}] }
const steps = ref([{ func: 'talib.MA', params: [{ type: 'basic', value: 'close' }, { type: 'number', value: '5' }] }])
const finalVar = ref('a')
const talibFuncs = ref([])

// 步骤变量名：a / b / c / ...（按步骤下标）
const stepVar = (si) => String.fromCharCode(97 + si)
// 可被引用的前序步骤（含自己，供"最终结果"；参数引用只允许前序）
const priorIndexes = (si) => Array.from({ length: si + 1 }, (_, i) => i)

const selectedSpec = computed(() =>
  indicatorList.value.find(it => it.name === selectedName.value) || null)
// 复合序列数据参数：非 ohlcv 列名的参数名（arr / sequence / speed 等）→ 支持分步编辑
const isComposite = computed(() => {
  const dp = selectedSpec.value?.data_param
  return !!dp && !['close', 'high', 'low', 'open', 'volume', 'amount', 'oi'].includes(dp)
})
const dataParamName = computed(() => selectedSpec.value?.data_param || '数据')
// 标签 = 数据参数名 + 数据（arr数据 / sequence数据 / speed数据 / close数据 / high数据…）
const dataLabel = computed(() => `${dataParamName.value}数据`)

// ---------- 列表加载 ----------
const loadList = async () => {
  try {
    const data = await getPyIndicatorList()
    indicatorList.value = data.items || []
    talibFuncs.value = data.talibFuncs || []
    if (!selectedName.value && indicatorList.value.length) {
      selectedName.value = indicatorList.value[0].name
      onSelectChange()
    }
  } catch (e) {
    console.error('[Python指标] 列表加载失败:', e)
    ElMessage.error(`Python指标列表加载失败：${e.message}`)
  }
}
loadList()

// 切换指标：重建参数表单（必填参数留空，其余预填默认值）；重置数据源
// 数据参数名为列（close/high/low/open/volume/amount）时默认该列，否则默认 close
const onSelectChange = () => {
  Object.keys(paramsForm).forEach(k => delete paramsForm[k])
  const dp = selectedSpec.value?.data_param
  basicData.value = basicOptions.includes(dp) ? dp : 'close'
  steps.value = [{ func: 'talib.MA', params: [{ type: 'basic', value: 'close' }, { type: 'number', value: '5' }] }]
  finalVar.value = 'a'
  const spec = selectedSpec.value
  if (spec) {
    spec.params.forEach(p => {
      if (!p.required && p.default !== null && p.default !== undefined) {
        paramsForm[p.name] = String(p.default)
      } else {
        paramsForm[p.name] = ''
      }
    })
  }
}

// ---------- 分步编辑 ----------
const addStep = () => {
  const si = steps.value.length
  steps.value.push({ func: '', params: [{ type: 'basic', value: 'close' }, { type: 'number', value: '' }] })
  finalVar.value = stepVar(si)
}
const removeStep = (si) => {
  steps.value.splice(si, 1)
  // 修正最终结果指向（删除后变量名整体前移）
  if (steps.value.length === 0) { finalVar.value = 'a' }
  else if (!priorIndexes(steps.value.length - 1).some(i => stepVar(i) === finalVar.value)) {
    finalVar.value = stepVar(steps.value.length - 1)
  }
}
// 切换函数后重置参数为合理默认（Indicator 指标带 doc，talib 默认 close+空数字）
const onStepFuncChange = (step) => {
  const isTalib = String(step.func).startsWith('talib.')
  step.params = [
    { type: 'basic', value: 'close' },
    { type: 'number', value: isTalib ? '' : '' },
  ]
}

// 收集数据源表达式：复合序列指标有步骤时分步序列化，否则/列名指标返回所选基本数据列
const collectData = () => {
  if (!selectedSpec.value || !isComposite.value) return basicData.value || 'close'
  if (!steps.value.length) return basicData.value || 'close'
  const exprs = steps.value.map((s, si) => {
    const fn = String(s.func || '').trim()
    const args = s.params.map(p => {
      if (p.type === 'number' || p.type === 'bool') return String(p.value ?? '').trim() || '0'
      return String(p.value ?? '').trim() || (p.type === 'basic' ? 'close' : '')
    })
    return `${stepVar(si)}=${fn}(${args.join(',')})`
  })
  return `${exprs.join(';')};${finalVar.value}`
}

// ---------- 应用 ----------
const syncStore = () => {
  searchStore.setPythonIndicators(appliedList.value.map(it => ({ ...it })))
}

// 收集表单值 → 参数数组（顺序与 spec.params 一致；必填缺失/非数字报错）
const collectParams = (spec) => {
  const params = []
  for (const p of spec.params) {
    const raw = paramsForm[p.name]
    if (p.required && (raw === undefined || raw === null || String(raw).trim() === '')) {
      ElMessage.warning(`缺少必填参数：${p.name}`)
      return null
    }
    if (raw === undefined || raw === null || String(raw).trim() === '') {
      params.push(p.default)
      continue
    }
    // bool 参数：接受 0/1 与 true/false（含预填的默认值字符串）
    if (p.annotation === 'bool') {
      const s = String(raw).trim().toLowerCase()
      if (['1', 'true', 'yes', 'on'].includes(s)) { params.push(true); continue }
      if (['0', 'false', 'no', 'off'].includes(s)) { params.push(false); continue }
      ElMessage.warning(`参数 ${p.name} 必须为 0/1 或 true/false`)
      return null
    }
    const n = Number(raw)
    if (isNaN(n)) {
      ElMessage.warning(`参数 ${p.name} 必须为数字`)
      return null
    }
    params.push(n)
  }
  return params
}

const doApply = async (force) => {
  const spec = selectedSpec.value
  if (!spec) return
  const params = collectParams(spec)
  if (params === null) return
  const data = collectData()

  force ? (refreshing.value = true) : (applying.value = true)
  try {
    const chart = getChart()
    const id = await applyPyIndicator(chart, {
      name: spec.name,
      params,
      data,
      onMainChart: onMainChart.value,
      code: searchStore.symbol,
      period: periodToBackend(searchStore.period),
      adjust: searchStore.adjust_type,
      refresh: force,
    })
    if (!id) {
      ElMessage.error(`添加 Python 指标 ${spec.name} 失败`)
      return
    }
    const existed = appliedList.value.find(it => it.name === spec.name)
    if (existed) {
      Object.assign(existed, { params: [...params], data, onMainChart: onMainChart.value })
    } else {
      appliedList.value.push({ name: spec.name, params: [...params], data, onMainChart: onMainChart.value })
    }
    syncStore()
    ElMessage.success(`Python 指标 ${spec.name} 已${force ? '强制重算并' : ''}应用`)
  } catch (e) {
    console.error(`[Python指标] ${spec.name} 应用失败:`, e)
    ElMessage.error(`Python 指标 ${spec.name} 计算失败：${e.message}`)
  } finally {
    applying.value = false
    refreshing.value = false
  }
}

const removeOne = (name) => {
  try {
    removePyIndicator(getChart(), name)
  } catch (e) {
    console.error(`[Python指标] 移除 ${name} 失败:`, e)
  }
  appliedList.value = appliedList.value.filter(it => it.name !== name)
  syncStore()
}

defineExpose({ appliedList })
</script>

<style scoped>
.pyind-panel {
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
.add-area {
  border: 1px solid rgba(148, 163, 184, 0.15);
  border-radius: 8px;
  padding: 12px;
  background: rgba(255, 255, 255, 0.02);
  margin-bottom: 16px;
}
.data-form {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.data-field {
  display: flex;
  align-items: center;
  gap: 8px;
}
.data-head-tip {
  font-size: 11px;
  color: #64748b;
}
.step-box {
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 6px;
  padding: 6px 8px;
  background: rgba(255, 255, 255, 0.02);
}
.step-head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}
.step-var {
  font-weight: 600;
  font-size: 12px;
  color: #e2e8f0;
  font-variant-numeric: tabular-nums;
  flex: none;
}
.step-params {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.data-hint {
  font-size: 11px;
  color: #64748b;
  line-height: 1.5;
}
.param-form {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.param-field {
  display: flex;
  align-items: center;
  gap: 8px;
}
.param-label {
  width: 90px;
  flex: none;
  font-size: 12px;
  color: #94a3b8;
  font-variant-numeric: tabular-nums;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.param-field .el-input {
  flex: 1;
}
.param-type {
  width: 40px;
  flex: none;
  font-size: 11px;
  color: #64748b;
  text-align: right;
}
.no-param {
  font-size: 12px;
  color: #64748b;
}
.applied-head {
  font-size: 13px;
  color: #94a3b8;
  margin-bottom: 8px;
}
.applied-list {
  max-height: 40vh;
  overflow-y: auto;
  border: 1px solid rgba(148, 163, 184, 0.15);
  border-radius: 8px;
  padding: 12px;
}
.applied-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 10px;
}
.applied-row:last-child {
  margin-bottom: 0;
}
.ind-name {
  font-weight: 600;
  min-width: 90px;
}
.data-tag {
  font-variant-numeric: tabular-nums;
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.param-tag {
  font-variant-numeric: tabular-nums;
}
</style>
