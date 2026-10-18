// 板块 / 自选 激活状态：保存当前激活的股票列表与索引，供 K 线图滚轮切换
export const useSectorStore = defineStore('sector', () => {
  // 当前激活列表：{ type: sector|index|watchlist, groupId, groupName, items: [{code, name}] }
  const activeList = ref(null)
  // 当前高亮索引
  const activeIndex = ref(-1)
  // 激活的列表是否"已启用滚轮切换"（用户点击某分组后自动启用）
  const wheelEnabled = ref(false)

  const setActiveList = (list) => {
    activeList.value = list ? { ...list, items: list.items || [] } : null
    activeIndex.value = list ? Math.max(0, (list.items || []).findIndex(it => it.code === useSearchParametersStore().symbol)) : -1
    if (list && list.items && list.items.length) wheelEnabled.value = true
  }

  // 滚轮切换：deltaY>0 → 下一只；deltaY<0 → 上一只。返回切换后的 {code,name} 或 null
  const step = (deltaY) => {
    if (!wheelEnabled.value || !activeList.value || !activeList.value.items.length) return null
    const items = activeList.value.items
    let idx = activeIndex.value
    if (idx < 0) idx = 0
    idx = deltaY > 0 ? idx + 1 : idx - 1
    if (idx < 0 || idx >= items.length) return null // 到边界停止，不循环
    activeIndex.value = idx
    return items[idx]
  }

  // 从列表移除当前索引（自选删股后同步索引）
  const clampIndex = () => {
    const len = activeList.value?.items?.length || 0
    if (activeIndex.value >= len) activeIndex.value = len - 1
    if (activeIndex.value < 0 && len > 0) activeIndex.value = 0
  }

  return { activeList, activeIndex, wheelEnabled, setActiveList, step, clampIndex }
})
