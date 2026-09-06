
export const useSearchParametersStore = defineStore('searchParameters', () => {
  // 1. 响应式状态
  const symbol = ref('sh000001') // 默认标的：上证指数
  let today = new Date()
  today.setFullYear(today.getFullYear() - 7) // 默认开始日期：6年前
  const startDate = ref(today.toISOString())
  const endDate = ref(new Date().toISOString())
  const adjust_type = ref("none") // none不复权、front前复权、back后复权
  // K线周期（klinecharts Period 结构：{type, span}，type ∈ minute/hour/day/week/month）
  const period = ref({ type: 'day', span: 1 })
  const setPeriod = (p) => {
    if (p && typeof p.type === 'string' && p.span > 0) {
      period.value = { type: p.type, span: p.span }
    }
  }

  // 已启用的K线技术指标（K线对象重建后由 kLineView 据此重放 createIndicator）
  // 每项：{ name, calcParams, onMainChart }
  const enabledIndicators = ref([
    { name: 'MA', calcParams: [5, 10, 20, 60], onMainChart: true },
    { name: 'VOL', calcParams: [5, 10, 20], onMainChart: false },
  ])
  const setEnabledIndicators = (list) => {
    enabledIndicators.value = (Array.isArray(list) ? list : []).map(it => ({
      name: it.name,
      calcParams: Array.isArray(it.calcParams) ? [...it.calcParams] : [],
      onMainChart: !!it.onMainChart,
    }))
  }

  // 2. 事件容器
  const onLoadEvent = ref(new Map())

  // 3. 买卖提示指标信号（已启用指标的返回值，供模拟交易跳柱时提示）
  // 每项：{ period, datetime, timestamp, type: buy|sell, value, low, high, message }
  const longShortSignals = ref([])
  const setLongShortSignals = (list) => {
    longShortSignals.value = Array.isArray(list) ? list : []
  }

  // 3. 核心：参数校验函数
  const validateParameters = () => {
    // 校验1：标的不能为空
    if (!symbol.value.trim()) {
      ElMessage.warning('请选择标的')
      return false
    }
    // 校验2：开始日期不能为空
    if (!startDate.value) {
      ElMessage.warning('请选择开始日期')
      return false
    }
    // 校验3：结束日期不能为空
    if (!endDate.value) {
      ElMessage.warning('请选择结束日期')
      return false
    }
    // 校验4：结束日期 < 开始日期 → 拦截
    if (endDate.value < startDate.value) {
      ElMessage.error('结束日期不能小于开始日期')
      return false
    }
    // 校验复权类型
    if (!['none', 'front', 'back'].includes(adjust_type.value)) {
      ElMessage.error('复权类型不合法')
      return false
    }
    // 所有校验通过
    return true
  }

  // 4. 方法
  const addOnLoadEvent = (name, event) => {
    onLoadEvent.value.set(name, event)
  }

  const removeOnLoadEvent = (name) => {
    onLoadEvent.value.delete(name)
  }

  // 5. 加载事件（先校验，通过再执行）
  const onLoad = () => {
    // 🔥 校验不通过，直接拦截，不执行后续逻辑
    if (!validateParameters()) return

    // 校验通过 → 执行所有加载事件
    onLoadEvent.value.forEach(event => {
      if (typeof event === 'function') event()
    })
    ElMessage.success('参数校验通过，开始加载数据')
  }

  return {
    symbol,
    startDate,
    endDate,
    adjust_type,
    period,
    setPeriod,
    enabledIndicators,
    setEnabledIndicators,
    longShortSignals,
    setLongShortSignals,
    addOnLoadEvent,
    removeOnLoadEvent,
    onLoad,
    // 导出校验方法（组件可单独调用）
    validateParameters
  }
})
