
export const useSearchParametersStore = defineStore('searchParameters', () => {
  // 1. 响应式状态
  const symbol = ref('sh000001') // 默认标的：上证指数
  let today = new Date()
  today.setFullYear(today.getFullYear() - 1) // 默认开始日期：1年前
  const startDate = ref(today.toISOString().split('T')[0])
  const endDate = ref(new Date().toISOString().split('T')[0]) 

  // 2. 事件容器
  const onLoadEvent = ref(new Map())

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
    addOnLoadEvent,
    removeOnLoadEvent,
    onLoad,
    // 导出校验方法（组件可单独调用）
    validateParameters
  }
})