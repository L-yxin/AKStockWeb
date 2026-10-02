<template>
  <div class="sa-panel">
    <!-- 顶栏 -->
    <div class="sa-head">
      <div class="sa-head-left">
        <span class="sa-title">信号表现分析</span>
        <el-tag size="small" effect="dark" class="meta-tag">{{ searchStore.symbol }}</el-tag>
      </div>
      <el-button text size="small" @click="$emit('close')"><el-icon><Close /></el-icon></el-button>
    </div>

    <div class="sa-body">
      <!-- ================= 左列：配置 ================= -->
      <div class="sa-left">
        <!-- 信号配置 -->
        <div class="sa-section">
          <div class="sa-section-head">
            <span class="sa-section-title">信号配置</span>
            <el-button size="small" plain type="primary" @click="addSignal">
              <el-icon><Plus /></el-icon>&nbsp;添加信号
            </el-button>
          </div>

          <div v-if="signals.length" class="sa-list">
            <div v-for="(sig, idx) in signals" :key="idx" class="sa-signal">
              <div class="sa-signal-head">
                <span class="sa-index">#{{ idx + 1 }}</span>
                <el-radio-group v-model="sig.mode" size="small">
                  <el-radio-button value="klineform">函数</el-radio-button>
                  <el-radio-button value="pycode">代码</el-radio-button>
                </el-radio-group>
                <el-button text size="small" type="danger" class="sa-del" @click="removeSignal(idx)">
                  <el-icon><Delete /></el-icon>
                </el-button>
              </div>

              <!-- KLineForm：函数下拉 + 参数表单 -->
              <template v-if="sig.mode === 'klineform'">
                <div class="sa-field">
                  <span class="sa-label">函数</span>
                  <el-select v-model="sig.fnKey" size="small" filterable placeholder="选择后台指标函数" class="sa-fn-select"
                    @change="onFnChange(sig)">
                    <el-option-group v-for="g in fnGroups" :key="g.label" :label="g.label">
                      <el-option v-for="opt in g.options" :key="opt.value" :label="opt.label" :value="opt.value" />
                    </el-option-group>
                    <el-option label="✚ 自定义函数名…" value="__custom__" />
                  </el-select>
                </div>

                <!-- 自定义函数：文本输入（无目录定义） -->
                <template v-if="sig.fnKey === '__custom__'">
                  <div class="sa-field">
                    <span class="sa-label">函数名</span>
                    <el-input v-model="sig.customName" size="small" placeholder="如 ma_golden_cross" class="sa-input" />
                  </div>
                  <div class="sa-field">
                    <span class="sa-label">参数</span>
                    <el-input v-model="sig.argsText" size="small" type="textarea" :rows="2"
                      placeholder="每行一个参数：&#10;6,12,24&#10;30" />
                  </div>
                </template>

                <!-- 目录函数：按参数定义渲染表单 -->
                <template v-else>
                  <div v-for="p in userParams(sig)" :key="p.name" class="sa-field">
                    <span class="sa-label">{{ p.name }}<span v-if="p.required" class="req">*</span></span>
                    <el-tooltip v-if="p.doc" :content="p.doc" placement="top">
                      <el-icon class="doc-icon"><InfoFilled /></el-icon>
                    </el-tooltip>
                    <component :is="inputComponent(p)" v-model="sig.formParams[p.name]" v-bind="inputProps(p)"
                      class="sa-input" />
                  </div>
                  <div v-if="!userParams(sig).length" class="sa-noparam">该函数无需参数</div>
                </template>
              </template>

              <!-- pythonCode -->
              <div v-else class="sa-field sa-code-wrap">
                <span class="sa-label">代码</span>
                <el-button size="small" @click="openEditor(sig)">
                  打开代码编辑器 (Monaco)
                </el-button>
              </div>

              <!-- 标的：自动跟随主图，只读 -->
              <div class="sa-symbol" v-if="false">
                <div class="sa-field">
                  <span class="sa-label">代码</span>
                  <el-input v-model="sig.symbol.code" size="small" placeholder="如 sh600000" class="sa-input" />
                  <el-select v-model="sig.symbol.adjust" size="small" style="width: 88px">
                    <el-option label="前复权" value="qfq" />
                    <el-option label="后复权" value="hfq" />
                    <el-option label="不复权" value="none" />
                  </el-select>
                </div>
                <div class="sa-field">
                  <span class="sa-label">起止</span>
                  <el-date-picker v-model="sig.symbol.start" size="small" type="date" value-format="YYYY-MM-DD"
                    placeholder="起始" class="sa-input" />
                  <el-date-picker v-model="sig.symbol.end" size="small" type="date" value-format="YYYY-MM-DD"
                    placeholder="结束" class="sa-input" />
                </div>
              </div>
            </div>
          </div>
          <el-empty v-else description="暂无信号，点击「添加信号」" :image-size="48" />
        </div>

        <!-- 分析参数 -->
        <div class="sa-section">
          <div class="sa-section-head"><span class="sa-section-title">分析参数</span></div>
          <div class="sa-params">
            <div class="sa-field">
              <span class="sa-label">观察期</span>
              <el-date-picker v-model="range" size="small" type="daterange" value-format="YYYY-MM-DD"
                range-separator="~" start-placeholder="开始" end-placeholder="结束"
                style="width: 100%" @change="scheduleAutoAnalyze" />
            </div>
            <div class="sa-field">
              <span class="sa-label sa-label-sm">minSample</span>
              <el-input-number v-model="minSample" size="small" :min="1" :max="100" style="width: 84px"
                @change="scheduleAutoAnalyze" />
            </div>
            <div class="sa-field">
              <span class="sa-label">N 节点</span>
              <el-select v-model="horizons" size="small" multiple collapse-tags collapse-tags-tooltip
                placeholder="未来 K 线数" style="width: 100%" @change="scheduleAutoAnalyze">
                <el-option v-for="h in HORIZON_OPTIONS" :key="h" :label="`${h} 根`" :value="h" />
              </el-select>
            </div>
            <div class="sa-field">
              <span class="sa-label">收益</span>
              <el-radio-group v-model="returnType" size="small" @change="scheduleAutoAnalyze">
                <el-radio-button value="simple">简单</el-radio-button>
                <el-radio-button value="log">对数</el-radio-button>
              </el-radio-group>
              <span class="sa-label sa-label-sm">合并</span>
              <el-switch v-model="mergeConsecutive" size="small" @change="scheduleAutoAnalyze" />
            </div>
          </div>
        </div>

        <!-- 提交 -->
        <el-button type="primary" class="sa-submit-btn" :loading="submitting" @click="submitAnalyze">
          {{ result ? '重新分析' : '开始分析' }}
        </el-button>
      </div>

      <!-- ================= 右列：结果 ================= -->
      <div class="sa-right">
        <template v-if="result">
          <div v-if="errors.length" class="sa-errors">
            <div v-for="(e, i) in errors" :key="i" class="sa-error">
              <b>{{ e.displayName || e.name }}</b>：{{ e.error }}
            </div>
          </div>
          <el-empty v-if="!result.signals.length" description="全部信号无效，请检查配置" :image-size="56" />

          <template v-if="result.signals.length">
            <!-- 打开可视化窗口 -->
            <div class="sa-dialog-entry">
              <el-button type="primary" size="large" class="sa-open-btn" @click="dialogVisible = true">
                <el-icon><DataAnalysis /></el-icon>&nbsp;打开可视化窗口
              </el-button>
              <p class="sa-dialog-tip">弹窗可拖拽、可调整大小 · 统计表 / 柱状图 / 分布图</p>
            </div>

            <!-- 主图信号标记（叠加到主页 K 线图） -->
            <div class="sa-chart-block">
              <div class="sa-sub-head">
                <span class="sa-sub-title">主图信号标记</span>
                <el-tag size="small" type="info">叠加到主 K 线图</el-tag>
              </div>
              <div class="sa-mainmarker">
                <p>分析完成后，各信号触发点已叠加到主图 K 线上（红色「买」标签 + 方向线）。</p>
                <p>重新分析会刷新全部标记；若信号标的与主图标的不一致，标记位置请留意错位。</p>
                <p class="sa-chart-foot">
                  <template v-for="s in result.signals" :key="s.name">
                    <span class="sig-meta">{{ s.displayName }}：{{ s.signalCount ?? 0 }} 个 · {{ s.timeSpan || '' }}</span><br />
                  </template>
                </p>
              </div>
            </div>
          </template>
        </template>

        <div v-else class="sa-placeholder">
          <el-icon class="ph-icon"><DataAnalysis /></el-icon>
          <span>配置左侧信号后点击「开始分析」</span>
        </div>
      </div>
    </div>

    <SignalQualityDialog v-model:visible="dialogVisible" :result="result" :errors="errors" :return-type="returnType" />
<CodeEditorDialog v-model:visible="editorVisible" v-model="editingSig.pythonCode"
  v-if="editingSig" />
  </div>
</template>

<script setup>
import { Plus, Delete, Close, InfoFilled, DataAnalysis } from '@element-plus/icons-vue'
import { signalAnalyze, ws_buyingAndSellingIndicator_url, base_http_url } from '@/api'
import '@/chart/overlays'
import SignalQualityDialog from './SignalQualityDialog.vue'
import CodeEditorDialog from './CodeEditorDialog.vue'

const props = defineProps({
  chartRef: { type: Object, required: true },
})
defineEmits(['close'])

const searchStore = useSearchParametersStore()

// ---------- 周期 ----------
const PERIOD_OPTIONS = {
  '1m': '1分钟', '5m': '5分钟', '15m': '15分钟', '30m': '30分钟',
  '1h': '60分钟', '1d': '日线', '1w': '周线', '1M': '月线',
}
const HORIZON_OPTIONS = [5, 10, 20, 30, 60, 120]

function storePeriodToBackend() {
  const p = searchStore.period || { type: 'day', span: 1 }
  if (p.type === 'minute') return `${p.span}m`
  if (p.type === 'hour') return `${p.span}h`
  if (p.type === 'day') return '1d'
  if (p.type === 'week') return '1w'
  if (p.type === 'month') return '1M'
  return '1d'
}

const defaultSymbol = () => ({
  code: searchStore.symbol,
  adjust: searchStore.adjust_type === 'front' ? 'qfq' : (searchStore.adjust_type === 'back' ? 'hfq' : 'none'),
  start: searchStore.startDate || '2019-01-01',
  end: searchStore.endDate || '2026-12-31',
})

// ---------- 指标目录（后端 WS /ws/buyingAndSellingIndicator） ----------
const cat = reactive({ buy: [], sell: [] })
const fnMap = reactive({}) // method -> item

const loadIndicators = () => {
  const ws = new WebSocket(ws_buyingAndSellingIndicator_url)
  ws.onopen = () => ws.send('')
  ws.onmessage = (event) => {
    ws.close()
    let data
    try {
      data = JSON.parse(event.data)
      const buyRaw = JSON.parse(data.buy)
      const sellRaw = JSON.parse(data.sell)
      cat.buy = convertToArray(buyRaw)
      cat.sell = convertToArray(sellRaw)
    } catch (e) {
      console.error('信号表现分析：指标目录解析失败', e)
      return
    }
    ;[...cat.buy, ...cat.sell].forEach(it => { fnMap[it.method] = it })
    // 目录就绪后，为已有信号补齐定义与默认参数
    // - 刚添加未手动修改的默认信号（fnKey='__custom__' 且未填自定义名）→ 自动切到目录首选函数
    // - 已选目录函数但定义缺失 → 补齐 itemDef/formParams
    signals.value.forEach(sig => {
      if (sig.mode !== 'klineform') return
      if (sig.fnKey === '__custom__' && !sig.customName.trim()) {
        const first = fnMap['is_rsi_oversold'] || cat.buy[0]
        if (first) {
          sig.fnKey = first.method
          sig.itemDef = first
          sig.formParams = defaultFormParams(first)
        }
        return
      }
      if (sig.fnKey !== '__custom__' && fnMap[sig.fnKey] && !sig.itemDef) {
        sig.itemDef = fnMap[sig.fnKey]
        sig.formParams = defaultFormParams(sig.itemDef)
      }
    })
  }
  ws.onerror = (err) => {
    console.error('加载买卖指标失败:', err)
    ElMessage.warning('指标目录加载失败，函数下拉不可用，可使用「自定义函数名」')
  }
}

const convertToArray = (rawObj) => {
  const methods = rawObj.method || {}
  const infos = rawObj.info || {}
  const types = rawObj.type || {}
  const params = rawObj.params || {}
  return Object.keys(methods).map(key => ({
    method: methods[key],
    info: infos[key] || '',
    type: types[key] || '',
    params: params[key] || { params: [], doc: '' },
  }))
}

const fnGroups = computed(() => [
  { label: `买入指标（${cat.buy.length}）`, options: cat.buy.map(it => ({ value: it.method, label: `${it.info}（${it.method}）` })) },
  { label: `卖出指标（${cat.sell.length}）`, options: cat.sell.map(it => ({ value: it.method, label: `${it.info}（${it.method}）` })) },
])

// ---------- 参数类型工具（与买卖提示面板一致） ----------
const isAutoInjectedParam = (name, annotation) => {
  const autoNames = ['open_', 'high', 'low', 'close', 'volume', 'open', 'high', 'low', 'close', 'volume']
  if (autoNames.includes(name)) return true
  if (annotation && annotation.includes('ndarray')) {
    return autoNames.some(n => name.toLowerCase().includes(n))
  }
  return false
}

const formatType = (annotation) => {
  if (!annotation) return 'any'
  const match = annotation.match(/'([^']+)'/)
  if (match) return match[1]
  const parts = annotation.replace('<class ', '').replace('>', '').split('.')
  return parts[parts.length - 1] || 'any'
}

const getDefaultByType = (annotation) => {
  if (!annotation) return ''
  const t = formatType(annotation).toLowerCase()
  if (t.includes('int')) return 0
  if (t.includes('float')) return 0.0
  if (t.includes('bool')) return false
  return ''
}

const userParams = (sig) => {
  const defs = sig.itemDef?.params?.params || []
  return defs.filter(p => !isAutoInjectedParam(p.name, p.annotation))
}

const inputComponent = (p) => {
  const t = formatType(p.annotation).toLowerCase()
  if (t.includes('int') || t.includes('float')) return 'el-input-number'
  if (t.includes('bool')) return 'el-switch'
  return 'el-input'
}

const isComplexParam = (p) => {
  const t = formatType(p.annotation).toLowerCase()
  return t.includes('config') || t.includes('list')
}

const inputProps = (p) => {
  const t = formatType(p.annotation).toLowerCase()
  const obj = { placeholder: `请输入${p.name}`, size: 'small' }
  if (t.includes('int')) {
    obj.step = 1
    obj.precision = 0
    obj.controlsPosition = 'right'
  } else if (t.includes('float')) {
    obj.step = 0.0001
    obj.precision = 4
    obj.controlsPosition = 'right'
  } else if (t.includes('bool')) {
    obj.activeText = '开'
    obj.inactiveText = '关'
  } else if (isComplexParam(p)) {
    // 复合 Config / list 参数：逗号分隔字符串（如 RsiConfig "6,12,24"、MaPairsConfig "5,10,10,20"）
    obj.placeholder = `如 6,12,24（逗号分隔）`
  }
  return obj
}

const defaultFormParams = (item) => {
  const out = {}
  const defs = item?.params?.params || []
  defs.forEach(p => {
    if (!isAutoInjectedParam(p.name, p.annotation)) {
      out[p.name] = p.default !== null && p.default !== undefined ? p.default : getDefaultByType(p.annotation)
    }
  })
  return out
}

const buildArgs = (sig) => {
  return userParams(sig).map(p => {
    const v = sig.formParams[p.name]
    const t = formatType(p.annotation).toLowerCase()
    if (t.includes('bool')) return v ? '1' : '0'
    if (t.includes('int') || t.includes('float')) return Number(v)
    return String(v ?? '')
  })
}

const parseArgs = (text) => {
  if (!text || !text.trim()) return []
  return text.split('\n').map(l => l.trim()).filter(Boolean).map(v => {
    if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v)
    return v
  })
}

// ---------- 信号列表 ----------
const signals = ref([])

// ---------- Monaco 代码编辑器 ----------
const editorVisible = ref(false)
const editingSig = ref(null)
function openEditor(sig) {
  editingSig.value = sig
  editorVisible.value = true
}

const makeSignal = () => {
  // 默认选目录中 is_rsi_oversold，否则目录第一个买入指标
  let item = fnMap['is_rsi_oversold'] || cat.buy[0] || null
  const sig = {
    mode: 'klineform',
    fnKey: item ? item.method : '__custom__',
    customName: '',
    argsText: '6,12,24\n30',
    pythonCode: 'return ta.RSI(c, 9) < 30',
    symbol: defaultSymbol(),
    itemDef: item || null,
    formParams: item ? defaultFormParams(item) : {},
  }
  return sig
}

const addSignal = () => signals.value.push(makeSignal())
const removeSignal = (idx) => signals.value.splice(idx, 1)

const onFnChange = (sig) => {
  if (sig.fnKey === '__custom__') {
    sig.itemDef = null
    sig.formParams = {}
    return
  }
  const item = fnMap[sig.fnKey]
  sig.itemDef = item || null
  sig.formParams = item ? defaultFormParams(item) : {}
}

// ---------- 分析参数 ----------
const range = ref([searchStore.startDate || '2019-01-01', searchStore.endDate || '2026-12-31'])
const period = ref(storePeriodToBackend())
const horizons = ref([...HORIZON_OPTIONS])
const mergeConsecutive = ref(false)
const returnType = ref('simple')
const minSample = ref(5)

// 主图周期变化时自动跟随
watch(() => searchStore.period, () => { period.value = storePeriodToBackend(); scheduleAutoAnalyze() }, { deep: true })

// ---------- 提交 / 防抖自动分析 ----------
const submitting = ref(false)
const result = ref(null)
const errors = ref([])
const dialogVisible = ref(false)
let autoTimer = null

const scheduleAutoAnalyze = () => {
  if (!result.value && !submitting.value) return
  clearTimeout(autoTimer)
  autoTimer = setTimeout(() => submitAnalyze(), 400)
}

const validateSignal = (s) => {
  if (s.mode === 'klineform') {
    const name = s.fnKey === '__custom__' ? s.customName.trim() : s.fnKey
    if (!name) return '存在未选择函数或未填函数名的信号'
    if (s.fnKey !== '__custom__') {
      const miss = userParams(s).filter(p => {
        const v = s.formParams[p.name]
        if (p.required) return v === undefined || v === null || v === ''
        if (isComplexParam(p)) return v === undefined || v === null || v === ''
        return false
      })
      if (miss.length) {
        const hint = miss.some(isComplexParam) ? '（复合参数请填逗号分隔，如 6,12,24）' : ''
        return `信号「${name}」缺少必填参数：${miss.map(p => p.name).join('、')}${hint}`
      }
    }
  } else if (!s.pythonCode.trim()) {
    return '存在未填 pythonCode 的信号'
  }
  if (!s.symbol?.code) return '存在未填标的代码的信号'
  return null
}

const submitAnalyze = async () => {
  if (!signals.value.length) {
    ElMessage.warning('请先添加信号')
    return
  }
  for (const s of signals.value) {
    const err = validateSignal(s)
    if (err) {
      ElMessage.warning(err)
      return
    }
  }
  if (!range.value || range.value.length !== 2) {
    ElMessage.warning('请选择观察期起止时间')
    return
  }

  const payload = {
    signals: signals.value.map(s => {
      if (s.mode === 'klineform') {
        const name = s.fnKey === '__custom__' ? s.customName.trim() : s.fnKey
        const item = s.fnKey === '__custom__' ? null : fnMap[s.fnKey]
        const args = s.fnKey === '__custom__' ? parseArgs(s.argsText) : buildArgs(s)
        return {
          displayName: item ? `${item.info}（${item.method}）` : name,
          symbol: defaultSymbol(),
          name,
          args,
        }
      }
      return {
        displayName: '自定义 pythonCode',
        symbol: defaultSymbol(),
        pythonCode: s.pythonCode,
      }
    }),
    range: { start: range.value[0], end: range.value[1] },
    horizons: horizons.value.length ? [...horizons.value] : HORIZON_OPTIONS,
    mergeConsecutive: mergeConsecutive.value,
    returnType: returnType.value,
    minSample: minSample.value,
    period: period.value,
  }

  submitting.value = true
  try {
    const res = await signalAnalyze(payload)
    if (res.code === 0 && res.data) {
      result.value = res.data
      errors.value = res.data.errors || []
      if (errors.value.length) {
        ElMessage.warning(`部分信号无效：${errors.value.map(e => e.error || e).join('；')}`)
      }
      nextTick(() => {
        applyMainMarkers()
      })
    } else {
      throw new Error(res.error || '返回格式异常')
    }
  } catch (e) {
    ElMessage.error('分析失败：' + (e.message || e))
  } finally {
    submitting.value = false
  }
}

// ---------- 表格取值 ----------
function cell(sig, n, key) {
  const h = sig?.horizons?.[String(n)]
  if (!h) return null
  if (h.insufficient) return '样本不足'
  switch (key) {
    case 'count': return h.count
    case 'win': return returnType.value === 'log' ? h.winRateLog : h.winRateSimple
    case 'ret': return returnType.value === 'log' ? h.avgReturnLog : h.avgReturnSimple
    case 'avgWin': return h.avgWin
    case 'avgLoss': return h.avgLoss
    case 'dd': return h.maxDrawdown?.avg
    case 'vol': return h.volatility?.pooled
    default: return null
  }
}
const retCls = (v) => {
  if (typeof v !== 'number') return ''
  return v >= 0 ? 'pos' : 'neg'
}
const pct = (v) => {
  if (v === null || v === undefined) return '-'
  if (typeof v === 'string') return v
  return `${(v * 100).toFixed(2)}%`
}
const plr = (sig, n) => {
  const h = sig?.horizons?.[String(n)]
  if (!h || h.insufficient) return '-'
  if (h.profitLossRatio === null) return '∞'
  if (typeof h.profitLossRatio !== 'number') return '-'
  return h.profitLossRatio.toFixed(2)
}
const ratio = (sig, n, key) => {
  const h = sig?.horizons?.[String(n)]
  if (!h || h.insufficient) return '-'
  const v = h[key]
  if (v === null || v === undefined) return '-'
  return Number(v).toFixed(2)
}

// ---------- 主图信号标记（叠加到主页 K 线图） ----------
function applyMainMarkers() {
  const comp = props.chartRef
  const chart = comp?.chart
  if (!chart) return
  try {
    comp.clearAllMarkers(chart)
    const markers = []
    ;(result.value?.signals || []).forEach(s => {
      ;(s.markers || []).forEach(m => {
        markers.push({
          timestamp: m.timestamp,
          value: m.value,
          type: 'B',
          mes: s.displayName,
        })
      })
    })
    if (markers.length) comp.addMarkers(chart, markers, 'stock')
  } catch (e) {
    console.warn('主图信号标记失败:', e)
  }
}

// ---------- 柱状图 / 分布图：已移至 SignalQualityDialog.vue（可拖拽缩放弹窗） ----------

onMounted(() => {
  loadIndicators()
  if (!signals.value.length) addSignal()
})

onBeforeUnmount(() => {
  clearTimeout(autoTimer)
})
</script>

<style scoped>
.sa-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}
.sa-head {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 2px;
}
.sa-head-left {
  display: flex;
  align-items: center;
  gap: 8px;
}
.sa-title {
  font-size: 14px;
  font-weight: 600;
  color: #e2e8f0;
}
.meta-tag { font-variant-numeric: tabular-nums; }

.sa-body {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 10px;
}

/* 左列：配置 */
.sa-left {
  width: 300px;
  flex: none;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-right: 4px;
}
.sa-section {
  border: 1px solid rgba(148, 163, 184, 0.15);
  border-radius: 8px;
  padding: 8px 10px;
  background: rgba(255, 255, 255, 0.02);
  flex: none;
}
.sa-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.sa-section-title {
  font-size: 13px;
  font-weight: 600;
  color: #e2e8f0;
}

.sa-list { display: flex; flex-direction: column; gap: 8px; }
.sa-signal {
  border: 1px solid rgba(148, 163, 184, 0.14);
  border-radius: 8px;
  padding: 6px 8px;
  background: rgba(15, 20, 30, 0.35);
}
.sa-signal-head { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
.sa-index { font-size: 11px; color: #64748b; }
.sa-del { margin-left: auto; }

.sa-field {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}
.sa-field:last-child { margin-bottom: 0; }
.sa-label {
  font-size: 11px;
  color: #64748b;
  flex: none;
  min-width: 34px;
  max-width: 100px;
  text-align: right;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sa-label-sm { width: auto; }
.sa-period-readonly { display: inline-block; padding: 2px 10px; font-size: 12px; color: #94a3b8; background: rgba(148,163,184,0.1); border-radius: 4px; }
.sa-period-group { display: flex; gap: 4px; flex-wrap: wrap; }
.sa-period-btn { padding: 4px 10px; font-size: 12px; color: #94a3b8; background: rgba(148,163,184,0.08); border: 1px solid rgba(148,163,184,0.2); border-radius: 6px; cursor: pointer; transition: all 0.15s; }
.sa-period-btn:hover { color: #e2e8f0; border-color: rgba(148,163,184,0.4); }
.sa-period-btn.active { color: #fff; background: #3b82f6; border-color: #3b82f6; }
.req { color: #f56c6c; margin-left: 2px; }
.sa-input { flex: 1; min-width: 0; }
.sa-fn-select { flex: 1; min-width: 0; }
.doc-icon { color: #64748b; flex: none; }
.sa-noparam { font-size: 11px; color: #64748b; padding: 2px 0 2px 40px; }
.sa-symbol {
  margin-top: 6px;
  border-top: 1px dashed rgba(148, 163, 184, 0.12);
  padding-top: 6px;
}
.sa-params { display: flex; flex-direction: column; gap: 8px; }
.sa-params .sa-label { width: auto; min-width: 34px; }

.sa-submit-btn { flex: none; width: 100%; }

/* 右列：结果 */
.sa-right {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.sa-placeholder {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: #64748b;
  font-size: 13px;
  border: 1px dashed rgba(148, 163, 184, 0.2);
  border-radius: 8px;
}
.ph-icon { font-size: 34px; }

.sa-errors { display: flex; flex-direction: column; gap: 4px; }
.sa-error {
  font-size: 12px;
  color: #f87171;
  background: rgba(239, 68, 68, 0.08);
  border: 1px solid rgba(239, 68, 68, 0.2);
  border-radius: 6px;
  padding: 6px 8px;
  word-break: break-all;
}
.sa-chart-block, .sa-table-block {
  border: 1px solid rgba(59, 130, 246, 0.22);
  border-radius: 8px;
  padding: 10px 12px;
  background: rgba(59, 130, 246, 0.05);
}
.sa-sub-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.sa-sub-title { font-size: 13px; font-weight: 600; color: #93c5fd; margin-right: auto; }
.sa-mainmarker p { font-size: 12px; color: #cbd5e1; margin: 4px 0; line-height: 1.6; }
.sig-meta { display: inline-block; margin-right: 12px; font-variant-numeric: tabular-nums; }
.sa-chart-foot { font-size: 11px; color: #64748b; margin-top: 6px; }
.sa-echart { height: 220px; width: 100%; }

.sa-table-scroll { overflow-x: auto; }
.sa-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  min-width: 420px;
}
.sa-table th, .sa-table td {
  border: 1px solid rgba(148, 163, 184, 0.14);
  padding: 4px 6px;
  text-align: center;
  color: #cbd5e1;
}
.sa-table thead th { background: rgba(59, 130, 246, 0.08); color: #93c5fd; font-weight: 600; }
.sa-table .th-sig { border-left: 2px solid rgba(59, 130, 246, 0.3); }
.sa-table .td-n { font-weight: 600; color: #e2e8f0; }
.sa-table tbody td.pos { color: #f87171; }
.sa-table tbody td.neg { color: #34d399; }
.sa-note { font-size: 11px; color: #64748b; margin-top: 6px; }

/* 打开可视化窗口入口 */
.sa-dialog-entry {
  border: 1px solid rgba(59, 130, 246, 0.35);
  border-radius: 10px;
  padding: 16px 14px;
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.14), rgba(59, 130, 246, 0.04));
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.sa-open-btn { width: 100%; }
.sa-dialog-tip { font-size: 11px; color: #64748b; margin: 0; }
.sa-code-wrap { position: relative; }
.sa-comp-pop {
  position: absolute; left: 8px; min-width: 200px; max-height: 200px; overflow-y: auto;
  background: #162032; border: 1px solid #2b3a55; border-radius: 4px;
  box-shadow: 0 6px 16px rgba(0,0,0,0.5); z-index: 2000;
}
.sa-comp-item { padding: 4px 10px; cursor: pointer; font-size: 12px; color: #cdd6e4; font-family: Consolas, monospace; }
.sa-comp-item.active, .sa-comp-item:hover { background: #3b82f6; color: #fff; }
.sa-comp-ns { color: #7dd3fc; margin-right: 2px; }
.sa-comp-item.active .sa-comp-ns, .sa-comp-item:hover .sa-comp-ns { color: #fff; }
.sa-comp-empty { padding: 6px 10px; font-size: 12px; color: #8899aa; }
</style>
