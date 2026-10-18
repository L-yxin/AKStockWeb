<template>
  <div class="settings-page">
    <div class="sp-header">
      <el-button text @click="$router.push('/')">
        <el-icon><ArrowLeft /></el-icon>&nbsp;返回行情
      </el-button>
      <span class="sp-title">设置</span>
    </div>

    <!-- 显示设置 -->
    <el-card class="sp-card" shadow="never">
      <template #header>显示设置</template>
      <div class="sp-row">
        <div class="sp-desc">
          <div class="sp-name">价格小数位数</div>
          <div class="sp-sub">
            影响 K 线十字光标开高低收、价格轴刻度、模拟交易标记等行情价格显示；默认 2 位
          </div>
        </div>
        <el-input-number :model-value="settingStore.pricePrecision" :min="0" :max="6" :step="1"
          @update:model-value="onPrecisionChange" />
      </div>
    </el-card>

    <!-- 数据来源 -->
    <el-card class="sp-card" shadow="never">
      <template #header>数据来源</template>
      <div class="sp-row">
        <div class="sp-desc">
          <div class="sp-name">K 线数据来源</div>
          <div class="sp-sub">
            通达信直拉：每次请求实时从后台拉取（网页默认方式）；
            内存缓存：走后端缓存服务（懒加载，TTL 30min，重复读取毫秒级，适合回测/频繁切换）
          </div>
        </div>
        <el-radio-group :model-value="searchStore.dataSource" @update:model-value="onSourceChange">
          <el-radio-button value="tq">通达信直拉</el-radio-button>
          <el-radio-button value="cache">内存缓存</el-radio-button>
        </el-radio-group>
      </div>
    </el-card>

    <!-- 缓存状态 -->
    <el-card class="sp-card" shadow="never">
      <template #header>
        <div class="sp-card-header">
          <span>缓存状态</span>
          <el-button size="small" :loading="statsLoading" @click="refreshStats">刷新</el-button>
          <el-button size="small" type="danger" plain :loading="clearing" @click="onClearCache">清空缓存</el-button>
        </div>
      </template>
      <div v-if="stats" class="sp-stats">
        <div class="sp-stat-item">
          <div class="sp-stat-num">{{ stats.entries }}</div>
          <div class="sp-stat-label">缓存条目（标的 × 周期 × 复权）</div>
        </div>
        <div class="sp-stat-item">
          <div class="sp-stat-num">{{ fmtGB(stats.used_gb) }}</div>
          <div class="sp-stat-label">当前占用（GiB）</div>
        </div>
        <div class="sp-stat-item">
          <div class="sp-stat-num">{{ fmtGB(stats.budget_gb) }}</div>
          <div class="sp-stat-label">预算上限（GiB）</div>
        </div>
        <div class="sp-stat-item">
          <div class="sp-stat-num">{{ (stats.utilization * 100).toFixed(1) }}%</div>
          <div class="sp-stat-label">利用率</div>
        </div>
        <div class="sp-stat-item">
          <div class="sp-stat-num">{{ stats.ttl_seconds }}s</div>
          <div class="sp-stat-label">缓存 TTL</div>
        </div>
        <div class="sp-stat-item">
          <div class="sp-stat-num">{{ stats.sweep_interval_seconds }}s</div>
          <div class="sp-stat-label">清理扫描间隔</div>
        </div>
      </div>
      <el-empty v-else-if="!statsLoading && statsError" :description="statsError" />
    </el-card>

    <!-- 缓存服务说明 -->
    <el-card class="sp-card" shadow="never">
      <template #header>缓存服务说明</template>
      <ul class="sp-notes">
        <li>后端需以 <code>--workers 1</code> 启动（单进程内存缓存，多 worker 各自一份互不可见）</li>
        <li>首次访问懒加载；请求区间超出缓存区间时自动按并集扩展重拉</li>
        <li>预算超限按最近访问最旧优先逐出（近似 LRU），后台每 60s 兜底清理过期条目</li>
        <li>回测程序可先 <code>POST /api/v1/cache/warmup</code> 预热，再统一走 <code>GET /api/v1/stocks/{symbol}</code></li>
        <li>前复权数据随最新交易日漂移，跨日回测前请手动清空缓存</li>
      </ul>
    </el-card>

    <!-- 后台管理入口 -->
    <el-card class="sp-card" shadow="never">
      <template #header>后台管理</template>
      <div class="sp-row">
        <div class="sp-desc">
          <div class="sp-name">后台管理页面</div>
          <div class="sp-sub">
            数据预加载：基于 <code>webapi/data/</code> 下 <code>watchlist.json</code> / <code>sector_cache.json</code>
            提取股票代码预热到内存缓存；缓存策略调整：预算 / TTL / 清理扫描间隔（运行时生效，无需重启）
          </div>
        </div>
        <el-button type="primary" plain @click="$router.push('/admin')">
          进入后台管理<el-icon class="el-icon--right"><ArrowRight /></el-icon>
        </el-button>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ArrowLeft, ArrowRight } from '@element-plus/icons-vue'
import { getCacheStats, clearCache, getAdminSettings, saveAdminSettings } from '@/api'
import { ElMessage } from 'element-plus'

const searchStore = useSearchParametersStore()
const settingStore = useSettingStore()

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

const onSourceChange = async (val) => {
  searchStore.setDataSource(val)
  // 数据来源选择保存到后端 data/setting.json（打开设置页时自动恢复）
  try {
    await saveAdminSettings({ dataSource: val })
    ElMessage.success(val === 'cache' ? '数据源已切换为内存缓存并保存到后端，下次加载生效' : '数据源已切换为通达信直拉并保存到后端，下次加载生效')
  } catch (e) {
    ElMessage.success(val === 'cache' ? '数据源已切换为内存缓存，下次加载生效（保存到后端失败）' : '数据源已切换为通达信直拉，下次加载生效（保存到后端失败）')
  }
}

const restoreDataSource = async () => {
  try {
    const j = await getAdminSettings()
    const ds = j.settings?.dataSource
    if (ds === 'tq' || ds === 'cache') {
      searchStore.setDataSource(ds)
    }
  } catch (e) {
    // 读取失败保持当前（前端 store）选择
  }
}

const onPrecisionChange = (val) => {
  settingStore.setPricePrecision(val)
  ElMessage.success(`价格小数位数已设为 ${val} 位，K 线图已生效`)
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
  await restoreDataSource()
  refreshStats()
})
</script>

<style scoped>
.settings-page {
  max-width: 860px;
  margin: 0 auto;
  padding: 16px;
  /* body overflow:hidden（K线全屏布局）→ 本页根元素自行滚动 */
  height: 100%;
  overflow-y: auto;
}
.sp-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}
.sp-title {
  font-size: 18px;
  font-weight: 600;
}
.sp-card {
  margin-bottom: 16px;
}
.sp-card-header {
  display: flex;
  align-items: center;
  gap: 8px;
}
.sp-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.sp-desc {
  flex: 1;
}
.sp-name {
  font-weight: 600;
  margin-bottom: 4px;
}
.sp-sub {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.6;
}
.sp-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}
.sp-stat-item {
  text-align: center;
  padding: 12px 8px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
}
.sp-stat-num {
  font-size: 22px;
  font-weight: 700;
  color: var(--el-color-primary);
}
.sp-stat-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
}
.sp-notes {
  margin: 0;
  padding-left: 18px;
  line-height: 1.9;
  font-size: 13px;
  color: var(--el-text-color-regular);
}
code {
  background: var(--el-fill-color-light);
  border-radius: 4px;
  padding: 1px 5px;
  font-size: 12px;
}
</style>
