<template>
  <div class="admin-page">
    <div class="ap-header">
      <el-button text @click="$router.push('/settings')">
        <el-icon><ArrowLeft /></el-icon>&nbsp;返回设置
      </el-button>
      <span class="ap-title">后台管理</span>
    </div>

    <!-- 数据预加载 -->
    <el-card class="ap-card" shadow="never">
      <template #header>
        <div class="ap-card-header">
          <span>数据预加载</span>
          <el-button size="small" :loading="sourcesLoading" @click="loadSources">刷新分组清单</el-button>
          <el-button size="small" type="primary" plain :loading="saving" @click="onSaveSettings">保存配置</el-button>
        </div>
      </template>

      <div class="ap-row">
        <div class="ap-desc">
          <div class="ap-name">预加载分组（精确选择）</div>
          <div class="ap-sub">
            基于 <code>webapi/data/</code> 下两个 json：<code>watchlist.json</code>（自选组）与
            <code>sector_cache.json</code>（已缓存的板块成分 / 指数成分）。勾选具体分组后预热到内存缓存；
            配置保存到 <code>webapi/data/setting.json</code>，下次打开自动恢复。
          </div>
        </div>
      </div>

      <div class="ap-groups">
        <div class="ap-group-field">
          <div class="ap-label">自选组（{{ groupCounts.watchlist }}）</div>
          <el-select v-model="selGroups.watchlist" multiple filterable collapse-tags collapse-tags-tooltip
            placeholder="选择自选组" style="width: 100%">
            <el-option v-for="g in sources.watchlist" :key="g.id" :value="g.id"
              :label="`${g.name}（${g.count}）`" />
          </el-select>
        </div>
        <div class="ap-group-field">
          <div class="ap-label">板块成分（{{ groupCounts.sector }}）</div>
          <el-select v-model="selGroups.sector" multiple filterable collapse-tags collapse-tags-tooltip
            placeholder="选择板块（仅已缓存的板块）" style="width: 100%">
            <el-option v-for="g in sources.sector" :key="g.id" :value="g.id"
              :label="`${g.name}（${g.count}）`" />
          </el-select>
        </div>
        <div class="ap-group-field">
          <div class="ap-label">指数成分（{{ groupCounts.index }}）</div>
          <el-select v-model="selGroups.index" multiple filterable collapse-tags collapse-tags-tooltip
            placeholder="选择指数成分（仅已缓存的）" style="width: 100%">
            <el-option v-for="g in sources.index" :key="g.id" :value="g.id"
              :label="`${g.name}（${g.count}）`" />
          </el-select>
        </div>
      </div>

      <div class="ap-plan">
        <div class="ap-plan-grid">
          <div class="ap-stat-item">
            <div class="ap-stat-num">{{ selectedCount }}</div>
            <div class="ap-stat-label">所选分组股票合计</div>
          </div>
          <div class="ap-stat-item">
            <div class="ap-stat-num">{{ groupCounts.watchlist }}</div>
            <div class="ap-stat-label">可选自选组</div>
          </div>
          <div class="ap-stat-item">
            <div class="ap-stat-num">{{ groupCounts.sector }}</div>
            <div class="ap-stat-label">可选板块</div>
          </div>
          <div class="ap-stat-item">
            <div class="ap-stat-num">{{ groupCounts.index }}</div>
            <div class="ap-stat-label">可选指数</div>
          </div>
        </div>
        <div class="ap-sub ap-config-tip">合计为各组股票数简单相加（跨组重叠以执行时后端去重为准）</div>
      </div>

      <el-divider />

      <div class="ap-form-row">
        <div class="ap-field">
          <div class="ap-label">复权</div>
          <el-select v-model="preloadForm.adjust" style="width: 120px">
            <el-option label="不复权" value="none" />
            <el-option label="前复权" value="qfq" />
            <el-option label="后复权" value="hfq" />
          </el-select>
        </div>
        <div class="ap-field">
          <div class="ap-label">周期</div>
          <el-select v-model="preloadForm.period" style="width: 120px">
            <el-option label="日线" value="1d" />
            <el-option label="周线" value="1w" />
            <el-option label="60分" value="60m" />
            <el-option label="30分" value="30m" />
            <el-option label="5分" value="5m" />
          </el-select>
        </div>
        <div class="ap-field">
          <div class="ap-label">起始日期</div>
          <el-date-picker v-model="preloadForm.start" type="date" value-format="YYYY-MM-DD" style="width: 150px" />
        </div>
        <div class="ap-field">
          <div class="ap-label">数量上限</div>
          <el-input-number v-model="preloadForm.limit" :min="0" :max="5000" placeholder="0=不限" style="width: 130px" />
        </div>
        <el-button type="primary" :loading="preloading" @click="onRunPreload">开始预加载</el-button>
      </div>

      <div v-if="preloadResult" class="ap-result">
        <el-alert
          :title="`预加载完成：计划 ${preloadResult.planned} 只，成功 ${preloadResult.loaded} 只，失败 ${preloadResult.failed} 只，耗时 ${preloadResult.elapsed_sec}s`"
          :type="preloadResult.failed ? 'warning' : 'success'" :closable="false" show-icon />
        <div v-if="Object.keys(preloadResult.errors || {}).length" class="ap-errors">
          <div v-for="(msg, sym) in preloadResult.errors" :key="sym" class="ap-error-line">{{ sym }}: {{ msg }}</div>
        </div>
      </div>
    </el-card>

    <!-- 缓存策略调整 -->
    <el-card class="ap-card" shadow="never">
      <template #header>
        <div class="ap-card-header">
          <span>缓存策略调整</span>
          <el-button size="small" :loading="cfgLoading" @click="loadConfig">读取当前</el-button>
        </div>
      </template>
      <div class="ap-form-row">
        <div class="ap-field">
          <div class="ap-label">内存预算（GiB）</div>
          <el-input-number v-model="cacheCfg.budget_gb" :min="1" :max="64" :step="1" style="width: 140px" />
        </div>
        <div class="ap-field">
          <div class="ap-label">缓存 TTL（秒）</div>
          <el-input-number v-model="cacheCfg.ttl_seconds" :min="60" :step="60" style="width: 140px" />
        </div>
        <div class="ap-field">
          <div class="ap-label">清理扫描间隔（秒）</div>
          <el-input-number v-model="cacheCfg.sweep_interval_seconds" :min="10" :step="10" style="width: 140px" />
        </div>
        <el-button type="primary" :loading="cfgSaving" @click="onSaveConfig">保存并生效</el-button>
      </div>
      <div class="ap-sub ap-config-tip">
        调整立即生效（无需重启后端）；调小预算会立即按新预算逐出最旧条目。默认预算 10 GiB / TTL 1800s（30 分钟）/ 扫描 60s。
      </div>
    </el-card>

    <!-- 缓存状态 -->
    <el-card class="ap-card" shadow="never">
      <template #header>
        <div class="ap-card-header">
          <span>缓存状态</span>
          <el-button size="small" :loading="statsLoading" @click="refreshStats">刷新</el-button>
          <el-button size="small" type="danger" plain :loading="clearing" @click="onClearCache">清空缓存</el-button>
        </div>
      </template>
      <div v-if="stats" class="ap-stats">
        <div class="ap-stat-item">
          <div class="ap-stat-num">{{ stats.entries }}</div>
          <div class="ap-stat-label">缓存条目</div>
        </div>
        <div class="ap-stat-item">
          <div class="ap-stat-num">{{ fmtGB(stats.used_gb) }}</div>
          <div class="ap-stat-label">占用（GiB）</div>
        </div>
        <div class="ap-stat-item">
          <div class="ap-stat-num">{{ fmtGB(stats.budget_gb) }}</div>
          <div class="ap-stat-label">预算（GiB）</div>
        </div>
        <div class="ap-stat-item">
          <div class="ap-stat-num">{{ (stats.utilization * 100).toFixed(1) }}%</div>
          <div class="ap-stat-label">利用率</div>
        </div>
        <div class="ap-stat-item">
          <div class="ap-stat-num">{{ stats.ttl_seconds }}s</div>
          <div class="ap-stat-label">TTL</div>
        </div>
        <div class="ap-stat-item">
          <div class="ap-stat-num">{{ stats.sweep_interval_seconds }}s</div>
          <div class="ap-stat-label">扫描间隔</div>
        </div>
      </div>
      <el-empty v-else-if="!statsLoading && statsError" :description="statsError" />
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ArrowLeft } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { getPreloadSources, runPreload, getAdminSettings, saveAdminSettings, getCacheConfig, setCacheConfig, getCacheStats, clearCache } from '@/api'

// ==================== 数据预加载（分组精确选择） ====================
const sources = reactive({ watchlist: [], sector: [], index: [] })
const selGroups = reactive({ watchlist: [], sector: [], index: [] })
const sourcesLoading = ref(false)
const sourcesError = ref('')

const preloadForm = ref({ adjust: 'none', period: '1d', start: '2024-01-01', limit: 0 })
const preloading = ref(false)
const preloadResult = ref(null)
const saving = ref(false)

const groupCounts = computed(() => ({
  watchlist: sources.watchlist.length,
  sector: sources.sector.length,
  index: sources.index.length,
}))
const selectedCount = computed(() => {
  const sum = (arr, ids) => arr.filter((g) => ids.includes(g.id)).reduce((s, g) => s + (g.count || 0), 0)
  return sum(sources.watchlist, selGroups.watchlist) + sum(sources.sector, selGroups.sector) + sum(sources.index, selGroups.index)
})

const loadSources = async () => {
  sourcesLoading.value = true
  sourcesError.value = ''
  try {
    const j = await getPreloadSources()
    sources.watchlist = j.watchlist || []
    sources.sector = j.sector || []
    sources.index = j.index || []
  } catch (e) {
    sourcesError.value = e.message || '获取分组清单失败'
  } finally {
    sourcesLoading.value = false
  }
}

const onRunPreload = async () => {
  const groups = [...selGroups.watchlist, ...selGroups.sector, ...selGroups.index]
  if (!groups.length) {
    ElMessage.warning('请至少选择一个分组')
    return
  }
  preloading.value = true
  preloadResult.value = null
  try {
    const j = await runPreload({
      groups,
      period: preloadForm.value.period,
      adjust: preloadForm.value.adjust,
      start: preloadForm.value.start || '',
      limit: preloadForm.value.limit > 0 ? preloadForm.value.limit : undefined,
    })
    preloadResult.value = j
    stats.value = j.stats
    await persistSettings() // 执行成功自动保存配置
    ElMessage.success(`预加载完成：成功 ${j.loaded} 只，失败 ${j.failed} 只（${j.elapsed_sec}s）`)
  } catch (e) {
    ElMessage.error(e.message || '预加载失败')
  } finally {
    preloading.value = false
  }
}

// ==================== 缓存策略调整 ====================
const cacheCfg = ref({ budget_gb: 10, ttl_seconds: 1800, sweep_interval_seconds: 60 })
const cfgLoading = ref(false)
const cfgSaving = ref(false)

const loadConfig = async () => {
  cfgLoading.value = true
  try {
    const j = await getCacheConfig()
    const c = j.config || j
    cacheCfg.value = {
      budget_gb: c.budget_gb,
      ttl_seconds: c.ttl_seconds,
      sweep_interval_seconds: c.sweep_interval_seconds,
    }
    stats.value = c
  } catch (e) {
    ElMessage.error(e.message || '读取缓存策略失败')
  } finally {
    cfgLoading.value = false
  }
}

const onSaveConfig = async () => {
  cfgSaving.value = true
  try {
    const j = await setCacheConfig({
      budget_gb: cacheCfg.value.budget_gb,
      ttl_seconds: cacheCfg.value.ttl_seconds,
      sweep_interval_seconds: cacheCfg.value.sweep_interval_seconds,
    })
    const c = j.config || j
    stats.value = c
    await persistSettings() // 策略生效后同步保存到 setting.json
    ElMessage.success('缓存策略已生效并保存')
  } catch (e) {
    ElMessage.error(e.message || '缓存策略调整失败')
  } finally {
    cfgSaving.value = false
  }
}

// ==================== 配置持久化（data/setting.json） ====================
const persistSettings = async () => {
  const groups = [...selGroups.watchlist, ...selGroups.sector, ...selGroups.index]
  const body = {
    preload: {
      groups,
      adjust: preloadForm.value.adjust,
      period: preloadForm.value.period,
      start: preloadForm.value.start || '',
      limit: preloadForm.value.limit || 0,
    },
    cache: {
      budget_gb: cacheCfg.value.budget_gb,
      ttl_seconds: cacheCfg.value.ttl_seconds,
      sweep_interval_seconds: cacheCfg.value.sweep_interval_seconds,
    },
  }
  await saveAdminSettings(body)
  return body
}

const onSaveSettings = async () => {
  saving.value = true
  try {
    await persistSettings()
    ElMessage.success('后台管理配置已保存到 webapi/data/setting.json')
  } catch (e) {
    ElMessage.error(e.message || '配置保存失败')
  } finally {
    saving.value = false
  }
}

const restoreSettings = async () => {
  try {
    const j = await getAdminSettings()
    const p = j.settings.preload || {}
    const c = j.settings.cache || {}
    // 恢复预加载选择：groups 按前缀分回三类
    const groups = Array.isArray(p.groups) ? p.groups : []
    selGroups.watchlist = groups.filter((g) => g.startsWith('wl_') || g === 'watchlist')
    selGroups.sector = groups.filter((g) => g.startsWith('sector_stocks:'))
    selGroups.index = groups.filter((g) => g.startsWith('index_stocks:'))
    preloadForm.value = {
      adjust: p.adjust || 'none',
      period: p.period || '1d',
      start: p.start || '2024-01-01',
      limit: p.limit || 0,
    }
    cacheCfg.value = {
      budget_gb: c.budget_gb ?? 10,
      ttl_seconds: c.ttl_seconds ?? 1800,
      sweep_interval_seconds: c.sweep_interval_seconds ?? 60,
    }
  } catch (e) {
    ElMessage.warning('读取已保存配置失败，使用默认值')
  }
}

// ==================== 缓存状态 ====================
const stats = ref(null)
const statsLoading = ref(false)
const statsError = ref('')
const clearing = ref(false)

const fmtGB = (gb) => (Number(gb) || 0).toFixed(2)

const refreshStats = async () => {
  statsLoading.value = true
  statsError.value = ''
  try {
    stats.value = await getCacheStats()
  } catch (e) {
    statsError.value = e.message || '获取缓存状态失败'
  } finally {
    statsLoading.value = false
  }
}

const onClearCache = async () => {
  clearing.value = true
  try {
    const j = await clearCache()
    ElMessage.success(`已清空 ${j.evicted} 条缓存`)
    await refreshStats()
  } catch (e) {
    ElMessage.error(e.message || '清空缓存失败')
  } finally {
    clearing.value = false
  }
}

onMounted(async () => {
  await restoreSettings()
  await Promise.all([loadSources(), loadConfig(), refreshStats()])
})
</script>

<style scoped>
.admin-page {
  max-width: 860px;
  margin: 0 auto;
  padding: 16px;
  /* body overflow:hidden（K线全屏布局）→ 本页根元素自行滚动 */
  height: 100%;
  overflow-y: auto;
}
.ap-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}
.ap-title {
  font-size: 18px;
  font-weight: 600;
}
.ap-card {
  margin-bottom: 16px;
}
.ap-card-header {
  display: flex;
  align-items: center;
  gap: 8px;
}
.ap-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}
.ap-desc {
  flex: 1;
  min-width: 260px;
}
.ap-name {
  font-weight: 600;
  margin-bottom: 4px;
}
.ap-sub {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.6;
}
.ap-plan {
  margin-top: 14px;
}
.ap-plan-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}
.ap-stat-item {
  text-align: center;
  padding: 12px 8px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
}
.ap-stat-num {
  font-size: 22px;
  font-weight: 700;
  color: var(--el-color-primary);
}
.ap-stat-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
}
.ap-sample {
  margin-top: 10px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}
.ap-sample-tag {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--el-fill-color-light);
  color: var(--el-text-color-regular);
  font-family: Consolas, monospace;
}
.ap-sample-more {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.ap-groups {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-top: 14px;
}
.ap-group-field .ap-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 6px;
}
.ap-form-row {
  display: flex;
  align-items: flex-end;
  gap: 16px;
  flex-wrap: wrap;
}
.ap-field .ap-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 6px;
}
.ap-result {
  margin-top: 14px;
}
.ap-errors {
  margin-top: 8px;
  max-height: 160px;
  overflow: auto;
  font-size: 12px;
  font-family: Consolas, monospace;
}
.ap-error-line {
  padding: 2px 0;
  color: var(--el-color-danger);
}
.ap-config-tip {
  margin-top: 10px;
}
.ap-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}
code {
  background: var(--el-fill-color-light);
  border-radius: 4px;
  padding: 1px 5px;
  font-size: 12px;
}
</style>
