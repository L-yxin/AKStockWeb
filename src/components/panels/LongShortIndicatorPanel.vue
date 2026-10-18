<template>
  <!-- 买卖提示指标：可拖拽/缩放弹窗，买入/卖出/中性三分类 -->
  <div class="ls-dialog">
    <div class="ls-frame" :style="{ width: frame.width + 'px', height: frame.height + 'px', left: frame.x + 'px', top: frame.y + 'px' }">
      <!-- 标题栏（拖拽区） -->
      <div class="ls-titlebar" @pointerdown="onTitleDown">
        <span class="ls-title">买卖提示指标</span>
        <el-button type="primary" size="small" :loading="submitting" @click.stop="enableSelectedLongShortIndicators">
          启用选择的多空指标
        </el-button>
        <el-button text size="small" class="ls-close" @click.stop="$emit('close')">
          <el-icon><Close /></el-icon>
        </el-button>
      </div>

      <!-- 分类 Tabs + 搜索 -->
      <div class="ls-toolbar">
        <div class="ls-tabs">
          <div v-for="c in CATS" :key="c.key" class="ls-tab" :class="{ active: tab === c.key }"
            @click="switchTab(c.key)">
            <span class="ls-dot" :style="{ background: c.color }" />
            {{ c.label }}
            <span class="ls-count">{{ (lists[c.key] || []).length }}</span>
          </div>
        </div>
        <el-input v-model="keyword" class="ls-search" size="small" clearable placeholder="搜指标名/方法" />
      </div>

      <!-- 指标列表 -->
      <div class="ls-list">
        <div v-if="loading" class="ls-empty">加载中…</div>
        <template v-else>
          <div v-for="item in filteredList" :key="item.method" class="indicator-card">
            <el-checkbox v-model="item.enabled">
              <span class="indicator-name">{{ item.info }}</span>
            </el-checkbox>
            <!-- ！：悬浮显示完整文档（teleported 挂 body 不被弹窗裁剪；延迟显示避免闪烁） -->
            <el-tooltip v-if="item.params.doc" :content="item.params.doc"
              placement="top" :show-after="250" :teleported="true" :append-to-body="true"
              popper-class="ls-doc-popper">
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
          <div v-if="!filteredList.length" class="ls-empty">
            {{ lists[tab].length ? '无匹配指标' : '该分类暂无指标' }}
          </div>
        </template>
      </div>

      <!-- 右下角缩放手柄 -->
      <div class="ls-resize" @pointerdown.stop="onResizeDown" />
    </div>
  </div>
</template>

<script setup>
import { InfoFilled, Close } from '@element-plus/icons-vue'
import { ws_buyingAndSellingIndicator_url } from '@/api'
import { requestLongShortSignals } from '@/chart/longShortSignals'

const props = defineProps({
  chartRef: { type: Object, required: true },
})
defineEmits(['close'])

const getChart = () => props.chartRef?.chart
const getComponent = () => props.chartRef

const searchStore = useSearchParametersStore()

// ---------- 弹窗几何（拖拽 / 缩放） ----------
const frame = reactive({ x: 80, y: 60, width: 520, height: 560 })
const MIN_W = 380
const MIN_H = 320
let drag = null
let resize = null

const onTitleDown = (e) => {
  drag = { sx: e.clientX, sy: e.clientY, ox: frame.x, oy: frame.y }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
}
const onResizeDown = (e) => {
  resize = { sx: e.clientX, sy: e.clientY, ow: frame.width, oh: frame.height }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
}
const onMove = (e) => {
  if (drag) {
    frame.x = Math.max(0, Math.min(window.innerWidth - 220, drag.ox + e.clientX - drag.sx))
    frame.y = Math.max(0, Math.min(window.innerHeight - 120, drag.oy + e.clientY - drag.sy))
  } else if (resize) {
    frame.width = Math.max(MIN_W, resize.ow + e.clientX - resize.sx)
    frame.height = Math.max(MIN_H, resize.oh + e.clientY - resize.sy)
  }
}
const onUp = () => {
  drag = null
  resize = null
  window.removeEventListener('pointermove', onMove)
  window.removeEventListener('pointerup', onUp)
}

// ---------- 分类 ----------
const PKG_COLOR = '#8b5cf6'  // 包级指标 tab 颜色（紫）
const BASE_CATS = [
  { key: 'buy', label: '买入', color: '#ef5350' },
  { key: 'sell', label: '卖出', color: '#26a69a' },
  { key: 'neutral', label: '中性', color: '#f59e0b' },
]
// 动态：基础三分类 + 每个包一个 tab（key = 包名，如 StockSelectionStrategy）
const CATS = computed(() => {
  const cats = [...BASE_CATS]
  const pkgs = buyingAndSellingIndicator.packages || []
  const seen = {}
  pkgs.forEach(p => {
    if (seen[p.type]) return
    seen[p.type] = true
    cats.push({ key: p.type, label: p.type, color: PKG_COLOR })
  })
  return cats
})
const tab = ref('buy')
const keyword = ref('')
const loading = ref(false)
const submitting = ref(false)

// ---------- 买卖提示指标状态 ----------
const buyingAndSellingIndicator = reactive({ buy: [], sell: [], neutral: [], packages: [] })
const indicatorParams = reactive({})
const lists = computed(() => {
  const out = { buy: buyingAndSellingIndicator.buy, sell: buyingAndSellingIndicator.sell, neutral: buyingAndSellingIndicator.neutral }
  ;(buyingAndSellingIndicator.packages || []).forEach(p => {
    if (!out[p.type]) out[p.type] = []
    out[p.type].push(p)
  })
  return out
})

const switchTab = (key) => { tab.value = key }
const filteredList = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  const src = lists.value[tab.value] || []
  if (!kw) return src
  return src.filter(it => it.info.toLowerCase().includes(kw) || it.method.toLowerCase().includes(kw))
})

// 辅助函数：判断是否为自动注入的参数（不需要用户配置）
const isAutoInjectedParam = (name, annotation) => {
  const autoNames = ['open_', 'high', 'low', 'close', 'volume', 'open', 'high', 'low', 'close', 'volume']
  if (autoNames.includes(name)) return true
  // FNxxxx 财务字段自动注入
  if (/^FN\d+$/.test(name)) return true
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

const loadIndicators = () => {
  loading.value = true
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
    buyingAndSellingIndicator.buy = convertToArray(JSON.parse(data.buy))
    buyingAndSellingIndicator.sell = convertToArray(JSON.parse(data.sell))
    // neutral 分类（旧后端可能没有该字段）
    buyingAndSellingIndicator.neutral = data.neutral ? convertToArray(JSON.parse(data.neutral)) : []
    // 包级指标（data.packages 为数组，无需 convertToArray；type=包名）
    buyingAndSellingIndicator.packages = Array.isArray(data.packages) ? data.packages : []

    // 初始化参数默认值
    const allItems = [
      ...buyingAndSellingIndicator.buy,
      ...buyingAndSellingIndicator.sell,
      ...buyingAndSellingIndicator.neutral,
      ...buyingAndSellingIndicator.packages,
    ]
    // 恢复已启用勾选：以 store 中持久化的启用配置为准（切换股票/重开弹窗后保持打钩）
    // 同一 method 可能出现在多个分类（如买入/中性都有"十字星"），用 method+type 精确匹配，避免跨分类误勾
    const activeKeys = new Set((searchStore.enabledLongShortIndicators.configs || []).map(c => `${c.method}|${c.type}`))
    allItems.forEach(item => {
      if (activeKeys.has(`${item.method}|${item.type}`)) item.enabled = true
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
    .finally(() => { loading.value = false })
}

// ---------- 启用选择的多空指标 ----------
const enableSelectedLongShortIndicators = async () => {
  // 合并买入、卖出、中性、包级指标
  const allItems = [
    ...buyingAndSellingIndicator.buy,
    ...buyingAndSellingIndicator.sell,
    ...buyingAndSellingIndicator.neutral,
    ...buyingAndSellingIndicator.packages,
  ]
  const enabledItems = allItems.filter(item => item.enabled)

  // 全部取消勾选：若当前已有启用配置 → 清空全部多空指标（取消启用）
  if (enabledItems.length === 0) {
    const hadActive = (searchStore.enabledLongShortIndicators.configs || []).length > 0
    if (hadActive) {
      const chart = getChart()
      if (chart) getComponent().clearAllMarkers(chart, 'ls')
      searchStore.setLongShortSignals([])
      searchStore.setEnabledLongShortIndicators({ configs: [], period: '1d' })
      ElMessage.success('已清空全部多空指标')
      return null
    }
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

  submitting.value = true
  try {
    const { data: parsedData, skipped } = await requestLongShortSignals(props.chartRef, {
      configs: enabledConfigs,
      period,
    })
    if (skipped && skipped.length) {
      ElMessage.warning(`${skipped.length} 个指标计算失败已跳过：${skipped.map(s => s.info || s.method).join('、')}`)
    }
    ElMessage.success(`多空指标启用成功（${enabledConfigs.length} 个）`)
    // 持久化已启用配置：股票切换时自动重新计算
    searchStore.setEnabledLongShortIndicators({ configs: enabledConfigs, period })
  } catch (err) {
    console.error('启用多空指标失败:', err)
    ElMessage.error('启用多空指标失败: ' + err)
  } finally {
    submitting.value = false
  }
}

onMounted(() => {
  loadIndicators()
})
</script>

<style scoped>
.ls-dialog {
  position: fixed;
  inset: 0;
  z-index: 3000;
  pointer-events: none;
}
.ls-frame {
  position: absolute;
  display: flex;
  flex-direction: column;
  background: var(--panel, #141a23);
  border: 1px solid rgba(148, 163, 184, 0.25);
  border-radius: 10px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
  overflow: hidden;
  pointer-events: auto;
}
.ls-titlebar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  cursor: move;
  user-select: none;
  border-bottom: 1px solid rgba(148, 163, 184, 0.15);
  flex: none;
}
.ls-title {
  font-weight: 700;
  font-size: 14px;
  color: #e2e8f0;
  margin-right: auto;
}
.ls-close {
  color: #94a3b8;
}
.ls-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  flex: none;
}
.ls-tabs {
  display: flex;
  gap: 6px;
  flex: none;
}
.ls-tab {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 12px;
  color: #94a3b8;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.15s;
}
.ls-tab:hover {
  color: #e2e8f0;
  background: rgba(148, 163, 184, 0.08);
}
.ls-tab.active {
  color: #fff;
  background: rgba(59, 130, 246, 0.18);
  border-color: rgba(59, 130, 246, 0.35);
}
.ls-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex: none;
}
.ls-count {
  font-size: 10px;
  color: #64748b;
}
.ls-search {
  flex: 1;
  min-width: 0;
}
.ls-search :deep(.el-input__wrapper) {
  background: rgba(148, 163, 184, 0.08);
  box-shadow: none;
}
.ls-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 12px 12px;
}
.ls-empty {
  padding: 24px 0;
  text-align: center;
  color: #64748b;
  font-size: 12px;
}
.indicator-card {
  margin-bottom: 10px;
  border: 1px solid rgba(148, 163, 184, 0.15);
  padding: 10px 12px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.02);
}
.indicator-name {
  font-weight: 600;
  color: #e2e8f0;
  font-size: 13px;
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
  margin-bottom: 10px;
}
.param-row:last-child {
  margin-bottom: 0;
}
.param-label {
  font-size: 12px;
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
.ls-resize {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 16px;
  height: 16px;
  cursor: nwse-resize;
}
.ls-resize::after {
  content: '';
  position: absolute;
  right: 3px;
  bottom: 3px;
  width: 8px;
  height: 8px;
  border-right: 2px solid rgba(148, 163, 184, 0.5);
  border-bottom: 2px solid rgba(148, 163, 184, 0.5);
  border-radius: 1px;
}
/* 悬浮文档提示（！图标）弹层：完整显示、自动换行、不被裁剪、浮在弹窗之上 */
:global(.ls-doc-popper) {
  max-width: 380px !important;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 12px;
  color: #e2e8f0 !important;
  background: #1e2733 !important;
  border: 1px solid rgba(148, 163, 184, 0.25) !important;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45) !important;
  z-index: 3200 !important;
}
:global(.ls-doc-popper .el-popper__arrow::before) {
  background: #1e2733 !important;
  border-color: rgba(148, 163, 184, 0.25) !important;
}
</style>
