<template>
  <div class="sector-panel">
    <!-- 标签：行业板块 / 指数成分 / 自选 -->
    <div class="sp-tabs">
      <div v-for="t in TABS" :key="t.key" class="sp-tab" :class="{ active: tab === t.key }"
        @click="switchTab(t.key)">
        {{ t.name }}
      </div>
    </div>

    <div class="sp-body">
      <!-- 左侧：分组列表 -->
      <div class="sp-groups">
        <el-input v-model="groupKeyword" class="sp-search" size="small" clearable
          placeholder="搜分组" />
        <div v-if="groupsLoading" class="sp-loading">加载中…</div>
        <template v-else>
          <div v-for="g in filteredGroups" :key="g.id" class="sp-group"
            :class="{ active: activeGroup?.id === g.id }"
            @click="selectGroup(g)">
            <span class="sp-group-name">{{ g.name }}</span>
            <span v-if="g.count !== undefined" class="sp-group-count">{{ g.count }}</span>
          </div>
          <div v-if="!filteredGroups.length" class="sp-empty">
            {{ groups.length ? '无匹配分组' : '暂无分组' }}
          </div>
        </template>
      </div>

      <!-- 右侧：成分股列表 -->
      <div class="sp-stocks" ref="stocksRef" @wheel.prevent="onStocksWheel">
        <el-input v-model="stockKeyword" class="sp-search" size="small" clearable
          placeholder="搜代码/名称" />
        <div v-if="stocksLoading" class="sp-loading">加载成分股…</div>
        <template v-else>
          <div v-for="(s, i) in filteredStocks" :key="s.code" class="sp-stock"
            :class="{ active: i === sectorStore.activeIndex }"
            @click="openStock(s)">
            <span class="sp-stock-code">{{ s.code }}</span>
            <span class="sp-stock-name">{{ s.name }}</span>
            <span v-if="tab === 'watchlist'" class="sp-stock-del" title="移出自选"
              @click.stop="removeStock(s)">×</span>
          </div>
          <div v-if="!filteredStocks.length" class="sp-empty">
            {{ stocks.length ? '无匹配股票' : '该分组暂无股票' }}
          </div>
        </template>
      </div>
    </div>

    <!-- 底部操作条 -->
    <div class="sp-footer">
      <span class="sp-hint" v-if="sectorStore.wheelEnabled">
        滚轮/{{ wheelHint }}切换：{{ activeGroup?.name || '' }}（{{ (sectorStore.activeIndex + 1) || 0 }}/{{ stocks.length }}）
      </span>
      <span class="sp-hint" v-else>点击左侧分组启用滚轮切换</span>
      <div class="sp-actions">
        <el-button v-if="tab === 'watchlist'" size="small" @click="createGroup">新建自选组</el-button>
        <el-button v-if="tab === 'watchlist' && activeGroup" size="small" type="danger" plain
          @click="deleteGroup">删除该组</el-button>
        <el-button v-if="tab !== 'watchlist' && activeGroup" size="small" type="primary" plain
          @click="addCurrentToWatchlist">加当前到自选</el-button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { h, onUnmounted } from 'vue'
import { ElSelect, ElOption } from 'element-plus'
import { getSectorGroups, getSectorStocks, watchlistOp, getWatchlist } from '@/api'

const searchStore = useSearchParametersStore()
const sectorStore = useSectorStore()

const TABS = [
  { key: 'sector', name: '行业板块' },
  { key: 'index', name: '指数成分' },
  { key: 'watchlist', name: '自选' },
]

const tab = ref('sector')
const groups = ref([])
const groupsLoading = ref(false)
const stocks = ref([])
const stocksLoading = ref(false)
const activeGroup = ref(null)
const stocksRef = ref(null)
const groupKeyword = ref('')
const stockKeyword = ref('')

const wheelHint = 'Ctrl+滚轮'

// ---------- 本地搜索过滤 ----------
const filteredGroups = computed(() => {
  const kw = groupKeyword.value.trim().toLowerCase()
  if (!kw) return groups.value
  return groups.value.filter(g => g.name.toLowerCase().includes(kw) || g.id.toLowerCase().includes(kw))
})
const filteredStocks = computed(() => {
  const kw = stockKeyword.value.trim().toLowerCase()
  if (!kw) return stocks.value
  return stocks.value.filter(s => s.code.toLowerCase().includes(kw) || s.name.toLowerCase().includes(kw))
})
// 搜索词清空 → 滚轮列表恢复为全量
watch(stockKeyword, (v) => {
  if (!v && sectorStore.activeList) {
    sectorStore.setActiveList({ ...sectorStore.activeList, items: stocks.value })
  }
})
// 切换标签时清空搜索词
watch(tab, () => {
  groupKeyword.value = ''
  stockKeyword.value = ''
})

const switchTab = async (key) => {
  tab.value = key
  groups.value = []
  stocks.value = []
  activeGroup.value = null
  sectorStore.setActiveList(null)
  await loadGroups()
}

const loadGroups = async () => {
  groupsLoading.value = true
  try {
    const j = await getSectorGroups(tab.value)
    groups.value = j.items || []
  } catch (e) {
    ElMessage.error('获取分组失败：' + e.message)
  } finally {
    groupsLoading.value = false
  }
}

const selectGroup = async (g) => {
  activeGroup.value = g
  stocksLoading.value = true
  stocks.value = []
  try {
    const j = await getSectorStocks(tab.value, g.id)
    stocks.value = j.items || []
    sectorStore.setActiveList({
      type: tab.value,
      groupId: g.id,
      groupName: g.name,
      items: stocks.value,
    })
  } catch (e) {
    ElMessage.error('获取成分股失败：' + e.message)
    sectorStore.setActiveList(null)
  } finally {
    stocksLoading.value = false
  }
}

// 点击股票 → 切换主图；搜索状态下滚轮列表跟随过滤结果
const openStock = (s) => {
  if (searchStore.symbol === s.code) return
  // 有搜索词时，把滚轮激活列表收敛为过滤结果（清除搜索后 watch 恢复全量）
  if (stockKeyword.value.trim() && sectorStore.activeList) {
    sectorStore.setActiveList({ ...sectorStore.activeList, items: filteredStocks.value })
  }
  searchStore.symbol = s.code
  searchStore.onLoad()
  syncIndex(s.code)
}
const syncIndex = (code) => {
  const idx = filteredStocks.value.findIndex(it => it.code === code)
  if (idx >= 0) sectorStore.activeIndex = idx
}

// 列表内滚轮切换（阻止默认滚动，只切换股票；0.5s 消抖防连续滚动连切）
let stocksWheelTimer = null
let stocksWheelDir = 0
const onStocksWheel = (e) => {
  stocksWheelDir = e.deltaY > 0 ? 1 : -1
  if (stocksWheelTimer) clearTimeout(stocksWheelTimer)
  stocksWheelTimer = setTimeout(() => {
    const item = sectorStore.step(stocksWheelDir)
    if (item) openStock(item)
  }, 500)
}

// ---------- 自选管理 ----------
const refreshWatchlist = async () => {
  const j = await getWatchlist()
  if (tab.value === 'watchlist') {
    groups.value = (j.groups || []).map(g => ({ id: g.id, name: g.name, count: g.codes.length }))
  }
}

const createGroup = async () => {
  const { value } = await ElMessageBox.prompt('自选组名称', '新建自选组', {
    confirmButtonText: '创建', cancelButtonText: '取消',
    inputValue: `自选组${groups.value.length + 1}`,
  }).catch(() => ({ value: null }))
  if (!value) return
  try {
    await watchlistOp('create', { name: value })
    await refreshWatchlist()
  } catch (e) {
    ElMessage.error('创建失败：' + e.message)
  }
}

const deleteGroup = async () => {
  await ElMessageBox.confirm(`确定删除自选组「${activeGroup.value.name}」？`, '删除自选组', {
    type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消',
  }).catch(() => 'cancel')
  try {
    await watchlistOp('delete', { id: activeGroup.value.id })
    activeGroup.value = null
    stocks.value = []
    sectorStore.setActiveList(null)
    await refreshWatchlist()
  } catch (e) {
    ElMessage.error('删除失败：' + e.message)
  }
}

const removeStock = async (s) => {
  try {
    await watchlistOp('remove', { id: activeGroup.value.id, code: s.code })
    stocks.value = stocks.value.filter(it => it.code !== s.code)
    sectorStore.clampIndex()
    await refreshWatchlist()
  } catch (e) {
    ElMessage.error('移出失败：' + e.message)
  }
}

const addCurrentToWatchlist = async () => {
  // 目标自选组：无组先建默认；多组弹窗选择
  const j = await getWatchlist().catch(e => { ElMessage.error('获取自选失败：' + e.message); return { groups: [] } })
  const groups = j.groups || []
  if (!groups.length) {
    const r = await watchlistOp('create', { name: '默认自选' })
    groups.push({ id: r.group.id, name: r.group.name })
  }
  let gid = groups[0].id
  let gname = groups[0].name
  if (groups.length > 1) {
    const sel = ref(gid)
    await ElMessageBox({
      title: '加入自选',
      message: () => h('div', { style: 'display:flex;align-items:center;gap:8px' }, [
        h('span', { style: 'font-size:12px;color:#94a3b8;flex:none' }, '目标自选组：'),
        h(ElSelect, {
          modelValue: sel.value,
          'onUpdate:modelValue': v => { sel.value = v },
          style: 'width:180px',
          size: 'small',
        }, () => groups.map(g => h(ElOption, { key: g.id, label: g.name, value: g.id }))),
      ]),
      confirmButtonText: '加入',
      cancelButtonText: '取消',
    }).then(() => {
      gid = sel.value
      gname = (groups.find(g => g.id === gid) || {}).name || gid
    }).catch(() => {})
  }
  try {
    await watchlistOp('add', { id: gid, code: searchStore.symbol, name: '' })
    ElMessage.success(`已将 ${searchStore.symbol} 加入「${gname}」`)
  } catch (e) {
    ElMessage.error('添加失败：' + e.message)
  }
}

onMounted(loadGroups)
onUnmounted(() => {
  if (stocksWheelTimer) clearTimeout(stocksWheelTimer)
})
</script>

<style scoped>
.sector-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.sp-tabs {
  display: flex;
  gap: 4px;
  padding: 4px;
  background: rgba(148, 163, 184, 0.08);
  border-radius: 6px;
  margin-bottom: 8px;
}
.sp-tab {
  flex: 1;
  text-align: center;
  padding: 5px 0;
  font-size: 12px;
  color: #94a3b8;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s;
}
.sp-tab:hover { color: #e2e8f0; }
.sp-tab.active { color: #fff; background: #3b82f6; }
.sp-body {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 8px;
}
.sp-groups {
  width: 140px;
  flex: none;
  overflow-y: auto;
  border-right: 1px solid rgba(148, 163, 184, 0.12);
  padding-right: 6px;
}
.sp-search {
  margin-bottom: 6px;
  flex: none;
}
.sp-search :deep(.el-input__wrapper) {
  background: rgba(148, 163, 184, 0.08);
  box-shadow: none;
}
.sp-groups .sp-search {
  position: sticky;
  top: 0;
  z-index: 2;
  background: var(--panel, #141a23);
  padding-bottom: 4px;
}
.sp-group {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  padding: 6px 8px;
  border-radius: 5px;
  font-size: 12px;
  color: #94a3b8;
  cursor: pointer;
  transition: all 0.12s;
  white-space: nowrap;
  overflow: hidden;
}
.sp-group:hover { color: #e2e8f0; background: rgba(148, 163, 184, 0.1); }
.sp-group.active { color: #fff; background: rgba(59, 130, 246, 0.22); }
.sp-group-name { overflow: hidden; text-overflow: ellipsis; }
.sp-group-count { font-size: 10px; color: #64748b; flex: none; }
.sp-stocks {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  cursor: ns-resize;
}
.sp-stocks .sp-search {
  position: sticky;
  top: 0;
  z-index: 2;
  background: var(--panel, #141a23);
  padding-bottom: 4px;
}
.sp-stock {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 5px;
  font-size: 12px;
  color: #cbd5e1;
  cursor: pointer;
  transition: all 0.12s;
}
.sp-stock:hover { background: rgba(148, 163, 184, 0.1); }
.sp-stock.active {
  background: rgba(59, 130, 246, 0.25);
  color: #fff;
  box-shadow: inset 2px 0 0 #3b82f6;
}
.sp-stock-code { color: #64748b; font-size: 11px; flex: none; }
.sp-stock-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sp-stock-del {
  color: #64748b;
  font-size: 14px;
  padding: 0 4px;
  border-radius: 3px;
}
.sp-stock-del:hover { color: #f56c6c; background: rgba(245, 108, 108, 0.15); }
.sp-loading, .sp-empty {
  padding: 16px;
  text-align: center;
  font-size: 12px;
  color: #64748b;
}
.sp-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid rgba(148, 163, 184, 0.12);
  margin-top: 8px;
}
.sp-hint { font-size: 11px; color: #64748b; }
.sp-actions { display: flex; gap: 6px; }
</style>
