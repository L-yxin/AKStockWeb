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
              :label="`${it.name}${it.doc ? '—' + it.doc.slice(0, 12) : ''}`">
              <span class="ind-opt-label">
                <b class="ind-opt-name">{{ it.name }}</b>
                <span v-if="it.doc" class="ind-opt-doc"> — {{ it.doc }}</span>
              </span>
            </el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="详细文档" v-if="selectedSpec && selectedSpec.doc02">
          <el-input type="textarea" v-model="selectedSpec.doc02" placeholder="详细文档" :readonly="true"  :rows="3"></el-input>
        </el-form-item>

        <!-- 数据源：复合序列数据参数（arr/sequence/relative_low 等非列名）分步编辑（极简）；
             列名数据参数（close/high…）数据列由签名固定、后端默认取该列，前端隐藏 -->
        <el-form-item v-for="(ed, ei) in compositeEditors" :key="ed.name" :label="`${ed.name}列`">
          <div class="data-form">
            <!-- 无步骤：直接使用 close 列 -->
            <div v-if="!ed.steps.length" class="step-empty">
              <span class="step-empty-tip">直接使用 close 列</span>
              <el-button size="small" text type="primary" @click="addStep(ed)">+ 步骤</el-button>
            </div>
            <!-- 步骤列表（图2 格式：函数一行 + 参数平铺） -->
            <div v-for="(step, si) in ed.steps" :key="si" class="step-box">
              <div class="step-head">
                <span class="step-var">第 {{ si + 1 }} 步</span>
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
                  @click="removeStep(ed, si)">×</el-button>
              </div>
              <div class="step-params">
                <div v-for="(p, pi) in step.params" :key="pi" class="param-field">
                  <!-- 已知 Indicator 函数：自动类型，显示"参数名 + 值控件 + 类型标注" -->
                  <span v-if="stepFnSpec(step)" class="param-label">{{ stepParamName(step, pi) }}</span>
                  <el-select v-else v-model="p.type" size="small" style="width: 96px">
                    <el-option value="basic" label="基本数据" />
                    <el-option value="var" label="引用变量" />
                    <el-option value="number" label="数字" />
                    <el-option value="bool" label="bool" />
                    <el-option value="string" label="字符串" />
                  </el-select>
                  <!-- ind 函数数据参数：合并"基本数据列 + 前序步骤（本编辑区 + 前序编辑区）"，支持嵌套复合 -->
                  <el-select v-if="isIndDataParam(step, pi)" v-model="p.value" size="small" style="flex: 1">
                    <el-option-group label="基本数据">
                      <el-option v-for="b in basicOptions" :key="b" :value="'col:' + b" :label="b" />
                    </el-option-group>
                    <el-option-group v-if="allRefSteps(ed, si).length" label="前序步骤">
                      <el-option v-for="r in allRefSteps(ed, si)" :key="r.g" :value="'var:' + r.g"
                        :label="r.label" />
                    </el-option-group>
                  </el-select>
                  <el-select v-else-if="p.type === 'basic'" v-model="p.value" size="small" style="flex: 1">
                    <el-option v-for="b in basicOptions" :key="b" :value="b" :label="b" />
                  </el-select>
                  <el-select v-else-if="p.type === 'var'" v-model="p.value" size="small" style="flex: 1"
                    placeholder="引用前序步骤">
                    <el-option v-for="si2 in priorIndexes(ed, si)" :key="si2" :value="si2"
                      :label="`第 ${si2 + 1} 步：${stepFuncName(ed, si2)}`" />
                  </el-select>
                  <el-select v-else-if="p.type === 'bool'" v-model="p.value" size="small" style="flex: 1">
                    <el-option :value="true" label="true / 1" />
                    <el-option :value="false" label="false / 0" />
                  </el-select>
                  <el-input v-else-if="p.type === 'string'" v-model="p.value" size="small" style="flex: 1" placeholder="字符串" />
                  <el-input v-else v-model="p.value" size="small" style="flex: 1" placeholder="数字" />
                  <span v-if="stepFnSpec(step)" class="param-type">
                    {{ isIndDataParam(step, pi) && String(p.value).startsWith('var:') ? '引用' : stepParamType(step, pi) }}
                  </span>
                  <el-button size="small" text type="danger" @click="step.params.splice(pi, 1)">×</el-button>
                </div>
                <el-button size="small" text type="primary" @click="step.params.push({ type: 'number', value: '' })">
                  + 参数
                </el-button>
              </div>
              <div class="step-foot">
                <el-button size="small" text type="primary" @click="addStep(ed)">+ 步骤</el-button>
              </div>
            </div>
            <!-- 最终结果（仅多步时选择哪一步作为结果；单步自动用该步） -->
            <div class="data-field" v-if="ed.steps.length > 1">
              <span class="param-label">最终结果</span>
              <el-select v-model="ed.finalVar" size="small" style="flex: 1">
                <el-option v-for="si2 in priorIndexes(ed, ed.steps.length)" :key="si2" :value="si2"
                  :label="`第 ${si2 + 1} 步：${stepFuncName(ed, si2)}`" />
              </el-select>
            </div>
            <div class="data-hint">
              多步按顺序计算，最后一步即结果（可改）；talib 多输出用 [i] 索引（如 MACD[1] 取 SIGNAL）
            </div>
          </div>
        </el-form-item>

        <!-- 参数：表单形式（每个参数一个输入项，默认值预填，必填校验）；ndarray（财务 FN 字段）自动注入，前端忽略 -->
        <el-form-item label="参数" v-if="selectedSpec && editableParams.length">
          <div class="param-form">
            <div v-for="p in editableParams" :key="p.name" class="param-field">
              <span class="param-label">{{ p.name }}</span>
              <el-select v-if="p.annotation === 'bool'" v-model="paramsForm[p.name]" size="small" style="flex: 1">
                <el-option value="true" label="true / 1" />
                <el-option value="false" label="false / 0" />
              </el-select>
              <el-input v-else v-model="paramsForm[p.name]" size="small"
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
// 数据源：多个数据参数（如 sr_width 的 relative_low / relative_high），每参数独立编辑区
// editor = { name, basicData, steps, finalVar }
const basicOptions = ['close', 'high', 'low', 'open', 'volume', 'amount']
const talibFuncs = ref([])
const dataEditors = ref([])

// 步骤变量名：跨数据参数全局连续（a,b,c… 第一个编辑器；续 d,e,f… 第二个编辑器）
const globalVarOffset = (ed) => {
  let offset = 0
  for (const e of dataEditors.value) {
    if (e === ed) return offset
    offset += e.steps.length
  }
  return offset
}
// 编辑器内第 si 步的全局变量名：a / b / c / ...
const stepVar = (ed, si) => String.fromCharCode(97 + globalVarOffset(ed) + si)
// 编辑器内可被引用的前序步骤（含自己，供"最终结果"；参数引用只允许前序）
const priorIndexes = (ed, si) => Array.from({ length: si + 1 }, (_, i) => i)
// 步骤函数显示名（去掉 talib. 前缀）
const stepFuncName = (ed, si) => {
  const st = ed.steps[si]
  return st && st.func ? String(st.func).replace(/^talib\./, '') : '(未选函数)'
}
// 步骤函数是否为已知 Indicator 指标（有 signature，可自动类型）
const stepFnSpec = (step) => {
  const n = String(step.func || '')
  return indicatorList.value.find(it => it.name === n) || null
}
// 步骤函数可编辑签名项（data + param，过滤财务 FN）
const stepSigItems = (step) => {
  const spec = stepFnSpec(step)
  return spec ? (spec.signature || []).filter(p => p.kind === 'data' || p.kind === 'param') : []
}
// 第 pi 个参数的名称
const stepParamName = (step, pi) => {
  const item = stepSigItems(step)[pi]
  return item ? item.name : `参数${pi + 1}`
}
// 第 pi 个参数的类型标注（列 / int / float / 0-1）
const stepParamType = (step, pi) => {
  const item = stepSigItems(step)[pi]
  if (!item) return 'var'
  if (item.annotation === 'bool') return '0/1'
  if (item.annotation === 'ndarray') return '列'
  return item.annotation || 'var'
}
// 是否为 ind 函数数据参数（kind='data'，值可列可引用前序步骤）
const isIndDataParam = (step, pi) => {
  const item = stepSigItems(step)[pi]
  return !!(item && item.kind === 'data')
}
// 可引用步骤列表（跨编辑区）：本编辑区前序步骤 + 前面编辑区（前序数据参数）全部步骤
// 返回 { g: 全局变量下标, label }，变量字母 = fromCharCode(97 + g)（与全局连续命名一致）
const allRefSteps = (ed, si) => {
  const list = []
  let offset = 0
  for (const e of dataEditors.value) {
    if (e === ed) {
      for (let i = 0; i < si; i++) {
        list.push({ g: offset + i, label: `第 ${i + 1} 步：${stepFuncName(ed, i)}` })
      }
      return list
    }
    for (let i = 0; i < e.steps.length; i++) {
      list.push({ g: offset + i, label: `${e.name}·第 ${i + 1} 步：${stepFuncName(e, i)}` })
    }
    offset += e.steps.length
  }
  return list
}

const selectedSpec = computed(() =>
  indicatorList.value.find(it => it.name === selectedName.value) || null)
// 可编辑参数：过滤财务自动注入（ndarray / FN 字段，前端忽略，后端自动拉取）
const editableParams = computed(() =>
  (selectedSpec.value?.params || []).filter(p => p.annotation !== 'ndarray')
)
// 列名数据参数（数据列由签名固定，后端默认取该列，前端隐藏）
const COLUMN_PARAMS = ['close', 'high', 'low', 'open', 'volume', 'amount', 'oi']
const isColumnParam = (name) => COLUMN_PARAMS.includes(name)
// 复合序列数据参数（arr / sequence / speed / relative_low…非列名）→ 显示分步编辑区
const compositeEditors = computed(() => dataEditors.value.filter(ed => !isColumnParam(ed.name)))

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

// 默认步骤：talib.MA(close, 5)
const defaultStep = () => ({ func: 'talib.MA', params: [{ type: 'basic', value: 'close' }, { type: 'number', value: '5' }] })
// 切换指标：重建参数表单 + 每个数据参数独立编辑区（列名参数隐藏，复合序列参数显示分步编辑）
const onSelectChange = () => {
  Object.keys(paramsForm).forEach(k => delete paramsForm[k])
  const dps = selectedSpec.value?.data_params || []
  dataEditors.value = dps.map(name => ({
    name,
    basicData: basicOptions.includes(name) ? name : 'close',
    steps: [defaultStep()],
    finalVar: 0,
  }))
  const spec = selectedSpec.value
  if (spec) {
    editableParams.value.forEach(p => {
      if (!p.required && p.default !== null && p.default !== undefined) {
        paramsForm[p.name] = String(p.default)
      } else {
        paramsForm[p.name] = ''
      }
    })
  }
}

// ---------- 分步编辑（每个数据参数独立 steps） ----------
const addStep = (ed) => {
  const si = ed.steps.length
  ed.steps.push({ func: '', params: [{ type: 'basic', value: 'close' }, { type: 'number', value: '' }] })
  ed.finalVar = si
}
const removeStep = (ed, si) => {
  ed.steps.splice(si, 1)
  // 修正最终结果指向（删除后步骤下标整体前移）
  if (ed.steps.length === 0) { ed.finalVar = 0 }
  else if (ed.finalVar >= ed.steps.length) { ed.finalVar = ed.steps.length - 1 }
  else if (ed.finalVar > si) { ed.finalVar -= 1 }
}
// 切换函数后按指标 signature 自动预填参数：
//   data 参数 → 基本数据列（列名参数取该列，否则 close）
//   param int/float → 数字（默认值预填）；param bool → true/false
//   财务 FN（kind=fin）自动注入，跳过
// talib 无签名信息 → 默认 [基本数据 close, 数字]
const onStepFuncChange = (step) => {
  const fnName = String(step.func || '')
  const spec = indicatorList.value.find(it => it.name === fnName)
  if (spec && spec.signature) {
    step.params = spec.signature
      .filter(p => p.kind === 'data' || p.kind === 'param')
      .map(p => {
        if (p.kind === 'data') {
          // 值编码 'col:列名'（基本数据，可下拉改选前序步骤 'var:下标'）
          return { type: 'basic', value: 'col:' + (basicOptions.includes(p.name) ? p.name : 'close') }
        }
        if (p.annotation === 'bool') {
          return { type: 'bool', value: p.default ?? false }
        }
        if (p.annotation === 'str') {
          return { type: 'string', value: (p.default !== null && p.default !== undefined) ? String(p.default) : '' }
        }
        const d = p.default
        return { type: 'number', value: (d !== null && d !== undefined) ? String(d) : '' }
      })
    return
  }
  step.params = [{ type: 'basic', value: 'close' }, { type: 'number', value: '' }]
}

// 收集数据源表达式：
//   列名参数 → 列名本身（后端默认取该列）
//   复合序列参数 → 分步表达式（每参数独立）
//   多个数据参数 → JSON 对象 {"参数名": 表达式}；单个 → 旧字符串格式（后端兼容）
const collectData = () => {
  if (!selectedSpec.value) return ''
  const editors = dataEditors.value
  if (!editors.length) return ''
  const exprs = {}
  editors.forEach(ed => {
    if (isColumnParam(ed.name)) { exprs[ed.name] = ed.name; return }
    if (!ed.steps.length) { exprs[ed.name] = ed.basicData || 'close'; return }
    const parts = ed.steps.map((s, si) => {
      const fn = String(s.func || '').trim()
      const args = s.params.map(p => {
        if (p.type === 'number' || p.type === 'bool') return String(p.value ?? '').trim() || '0'
        if (p.type === 'string') return `'${String(p.value ?? '').trim()}'`
        if (p.type === 'var') return String(stepVar(ed, Number(p.value) || 0))
        let v = String(p.value ?? '').trim()
        if (v.startsWith('col:')) v = v.slice(4)
        else if (v.startsWith('var:')) return String.fromCharCode(97 + (Number(v.slice(4)) || 0))
        return v || (p.type === 'basic' ? 'close' : '')
      })
      return `${stepVar(ed, si)}=${fn}(${args.join(',')})`
    })
    exprs[ed.name] = `${parts.join(';')};${stepVar(ed, ed.finalVar)}`
  })
  if (editors.length === 1) return exprs[editors[0].name]
  return JSON.stringify(exprs)
}

// ---------- 应用 ----------
const syncStore = () => {
  searchStore.setPythonIndicators(appliedList.value.map(it => ({ ...it })))
}

// 收集表单值 → 参数数组（顺序与 editableParams 一致；必填缺失/非数字报错）
const collectParams = (spec) => {
  const params = []
  for (const p of editableParams.value) {
    const raw = paramsForm[p.name]
    if (p.required && (raw === undefined || raw === null || String(raw).trim() === '')) {
      ElMessage.warning(`缺少必填参数：${p.name}`)
      return null
    }
    if (raw === undefined || raw === null || String(raw).trim() === '') {
      params.push(p.default)
      continue
    }
    // 字符串参数：原样传入
    if (p.annotation === 'str') {
      params.push(String(raw).trim())
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
.ind-opt-label {
  display: block;
  white-space: normal;
  line-height: 1.45;
  padding: 2px 0;
}
.ind-opt-name {
  color: #e2e8f0;
}
.ind-opt-doc {
  color: #94a3b8;
  font-size: 12px;
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
.step-empty {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
}
.step-empty-tip {
  font-size: 12px;
  color: #64748b;
}
.step-foot {
  display: flex;
  justify-content: flex-end;
  margin-top: 2px;
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
