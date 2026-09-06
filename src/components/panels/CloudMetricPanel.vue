<template>
  <div class="cloud-metric-panel">
    <!-- 已上传列表 -->
    <div class="section">
      <div class="section-title">
        云指标列表
        <el-button link type="primary" size="small" @click="refreshList" :loading="cloudMetricStore.listLoading">刷新</el-button>
      </div>
      <el-table :data="cloudMetricStore.metricList" size="small" v-loading="cloudMetricStore.listLoading" max-height="280">
        <el-table-column prop="name" label="名称" min-width="120" />
        <el-table-column prop="rows" label="行数" width="60" />
        <el-table-column label="列数" width="60">
          <template #default="{ row }">{{ row.columns?.length || 0 }}</template>
        </el-table-column>
        <el-table-column prop="start" label="起始" width="90" />
        <el-table-column prop="end" label="结束" width="90" />
        <el-table-column prop="updated_at" label="更新时间" width="140" />
        <el-table-column label="操作" width="110" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="viewMetric(row)">查看</el-button>
            <el-button link type="danger" size="small" @click="removeMetric(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="empty-tip" v-if="!cloudMetricStore.listLoading && cloudMetricStore.metricList.length === 0">
        暂无云指标。云指标由 Python 端计算后调用 postCloudMetrics() 上传。
      </div>
    </div>

    <el-divider v-if="viewing" />

    <!-- 折线图展示区 -->
    <div class="section" v-if="viewing">
      <div class="section-title">
        {{ viewing.name }}
        <span class="sub">{{ viewing.columns?.join(' / ') }}</span>
      </div>
      <div ref="chartRef" class="metric-chart"></div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import * as echarts from 'echarts'
import { listCloudMetrics, getCloudMetric, deleteCloudMetric } from '@/api'
import { useCloudMetricStore } from '@/stores/cloudMetricStore'
// ---------- 列表 ----------
const cloudMetricStore = useCloudMetricStore()
const metricList = cloudMetricStore.metricList
async function refreshList() {
  cloudMetricStore.listLoading = true
  try {
    cloudMetricStore.metricList = await listCloudMetrics()
  } catch (e) {
    ElMessage.error(e.message || '列表获取失败')
  } finally {
    cloudMetricStore.listLoading = false
  }
}

async function removeMetric(row) {
  try {
    await ElMessageBox.confirm(`确定删除云指标「${row.name}」？`, '确认删除', { type: 'warning' })
  } catch { return }
  try {
    await deleteCloudMetric(row.name)
    ElMessage.success('已删除')
    if (viewing.value?.name === row.name) viewing.value = null
    await refreshList()
  } catch (e) {
    ElMessage.error(e.message || '删除失败')
  }
}

// ---------- 折线图展示 ----------
const viewing = ref(null)
const chartRef = ref(null)
let chartInstance = null

async function viewMetric(row) {
  viewing.value = { ...row, data: [] }
  await nextTick()
  try {
    const ret = await getCloudMetric(row.name)
    viewing.value = ret
    renderChart(ret)
  } catch (e) {
    ElMessage.error(e.message || '查询失败')
    viewing.value = null
  }
}

function renderChart(ret) {
  if (!chartRef.value) return
  if (!chartInstance) {
    chartInstance = echarts.init(chartRef.value)
  }
  const { columns, data } = ret
  const xData = data.map(d => {
    const dt = new Date(d.timestamp)
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
  })
  const series = columns.map(col => ({
    name: col,
    type: 'line',
    data: data.map(d => d[col]),
    smooth: true,
    symbol: 'none',
    lineStyle: { width: 1.5 },
  }))
  chartInstance.setOption({
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis' },
    legend: {
      data: columns,
      textStyle: { color: '#cbd5e1' },
      top: 0,
    },
    grid: { left: 50, right: 20, top: 40, bottom: 30 },
    xAxis: {
      type: 'category',
      data: xData,
      axisLabel: { color: '#94a3b8', fontSize: 10 },
      axisLine: { lineStyle: { color: '#334155' } },
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: '#94a3b8', fontSize: 10 },
      splitLine: { lineStyle: { color: 'rgba(51,65,85,0.3)' } },
    },
    series,
  }, true)
}

function handleResize() {
  chartInstance?.resize()
}

onMounted(() => {
  refreshList()
  window.addEventListener('resize', handleResize)
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  chartInstance?.dispose()
  chartInstance = null
})
</script>

<style scoped>
.cloud-metric-panel {
  padding: 12px 16px;
  color: #e2e8f0;
}
.section-title {
  font-size: 14px;
  font-weight: 600;
  color: #f1f5f9;
  margin-bottom: 10px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.section-title .sub {
  font-size: 12px;
  font-weight: 400;
  color: #94a3b8;
}
.empty-tip {
  text-align: center;
  color: #64748b;
  font-size: 12px;
  padding: 24px 0;
}
.metric-chart {
  width: 100%;
  height: 360px;
}
</style>
