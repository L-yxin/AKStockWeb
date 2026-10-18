<template>
  <!-- 全局键盘股票搜索：输入代码 / 名称 / 拼音（全拼·首字母），↑↓选择 Enter 确认 Esc 关闭 -->
  <div v-if="visible" class="ks-overlay" @mousedown.stop>
    <div class="ks-box" @mousedown.stop>
      <div class="ks-query">
        <span class="ks-q">{{ query }}</span><span class="ks-cursor" />
      </div>
      <div class="ks-list">
        <div v-if="building" class="ks-empty">正在构建拼音索引…</div>
        <template v-else>
          <div v-for="(it, i) in matches" :key="it.code" class="ks-item"
            :class="{ active: i === activeIndex }"
            @mouseenter="activeIndex = i" @mousedown.prevent="apply(it)">
            <span class="ks-code">{{ it.code }}</span>
            <span class="ks-name">{{ it.name }}</span>
            <span v-if="it.pinyinHit" class="ks-py">{{ it.pinyinHit }}</span>
          </div>
          <div v-if="!matches.length" class="ks-empty">无匹配标的</div>
        </template>
      </div>
      <div class="ks-hint">↑↓ 选择 · Enter 确认 · Esc 关闭</div>
    </div>
  </div>
</template>

<script setup>
import { pinyin } from 'pinyin-pro'
import { ws_searchSymbols_url } from '@/api'

const searchStore = useSearchParametersStore()

// ---------- 状态 ----------
const visible = ref(false)
const query = ref('')
const activeIndex = ref(0)
const building = ref(false)
const matches = ref([])

// 全量标的 + 拼音索引缓存
let symbolList = []      // [{code, name, fullPy, firstPy}]
let indexBuilt = false
let clearTimer = null
let queryLock = false    // 避免键盘事件与输入框冲突的简单节流

// ---------- 数据：拉全量 + 分片构建拼音索引（避免阻塞 UI） ----------
const startBuild = () => {
  if (indexBuilt || building.value) return
  building.value = true
  const ws = new WebSocket(ws_searchSymbols_url)
  ws.onopen = () => ws.send(JSON.stringify({ action: 'searchSymbols', query: '', limit: 100000 }))
  ws.onmessage = (event) => {
    try {
      const res = JSON.parse(event.data)
      const list = res.data || []
      // 分片转换拼音：每片 400 条，片间让出主线程
      const raw = list.map(it => ({ code: it.code || '', name: it.name || '' }))
      symbolList = new Array(raw.length)
      let idx = 0
      const CHUNK = 400
      const step = () => {
        const end = Math.min(idx + CHUNK, raw.length)
        for (; idx < end; idx++) {
          const it = raw[idx]
          let fullPy = ''
          let firstPy = ''
          try {
            fullPy = pinyin(it.name, { toneType: 'none', type: 'array' }).join('')
            firstPy = pinyin(it.name, { toneType: 'none', pattern: 'first', type: 'array' }).join('')
          } catch (e) { /* ignore */ }
          symbolList[idx] = { ...it, fullPy, firstPy }
        }
        if (idx < raw.length) {
          setTimeout(step, 0)
        } else {
          indexBuilt = true
          building.value = false
          doMatch()
        }
      }
      step()
    } catch (e) {
      building.value = false
      ws.close()
    }
    ws.close()
  }
  ws.onerror = () => { building.value = false; ws.close() }
}

// ---------- 匹配 ----------
const rank = (it, q) => {
  const code = it.code.toLowerCase()
  const fullPy = it.fullPy.toLowerCase()
  const firstPy = it.firstPy.toLowerCase()
  if (code.startsWith(q)) return 0
  if (code.includes(q)) return 1
  if (firstPy.startsWith(q)) return 2
  if (fullPy.includes(q)) return 3
  if (it.name.includes(query.value)) return 4
  return -1
}

const doMatch = () => {
  const q = query.value.trim().toLowerCase()
  if (!q) { matches.value = []; return }
  const scored = []
  for (const it of symbolList) {
    const r = rank(it, q)
    if (r >= 0) scored.push({ ...it, _r: r, pinyinHit: it.fullPy && (it.firstPy.startsWith(q) || it.fullPy.includes(q)) ? it.fullPy : '' })
  }
  scored.sort((a, b) => a._r - b._r || a.code.localeCompare(b.code))
  matches.value = scored.slice(0, 50)
  activeIndex.value = 0
}

// ---------- 应用选择 ----------
const apply = (it) => {
  if (!it) return
  searchStore.symbol = it.code
  visible.value = false
  query.value = ''
  searchStore.onLoad()
}

const hide = () => {
  visible.value = false
  query.value = ''
  matches.value = []
  if (clearTimer) { clearTimeout(clearTimer); clearTimer = null }
}

const isEditableFocus = () => {
  const el = document.activeElement
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' ||
    el.isContentEditable || el.closest?.('.el-select') || el.closest?.('.el-input')
}

// ---------- 键盘监听 ----------
const onKeydown = async (e) => {
  // 焦点在输入控件中时不抢键盘（不干扰顶部搜索框/参数输入）
  if (isEditableFocus()) {
    if (e.key === 'Escape' && visible.value) hide()
    return
  }
  // 功能键 / 组合键忽略
  if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return
  const k = e.key

  // 可见时的控制键：方向选择 / 回车确认 / Esc 关闭
  if (visible.value) {
    if (k === 'ArrowUp') { e.preventDefault(); activeIndex.value = Math.max(0, activeIndex.value - 1); return }
    if (k === 'ArrowDown') { e.preventDefault(); activeIndex.value = Math.min(matches.value.length - 1, activeIndex.value + 1); return }
    if (k === 'Enter') { e.preventDefault(); apply(matches.value[activeIndex.value]); return }
    if (k === 'Escape') { e.preventDefault(); hide(); return }
  }
  if (k.length !== 1) return

  // 字母 / 数字累积
  if (/^[a-zA-Z0-9]$/.test(k)) {
    // 首次输入立即弹出浮层，索引异步分片构建（构建完成前显示 loading）
    if (!visible.value) {
      visible.value = true
      startBuild()
    }
    query.value += k.toLowerCase()
    doMatch()
    // 2 秒无新输入 → 隐藏重置
    if (clearTimer) clearTimeout(clearTimer)
    clearTimer = setTimeout(() => hide(), 2000)
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('blur', hide)
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('blur', hide)
  if (clearTimer) clearTimeout(clearTimer)
})
</script>

<style scoped>
.ks-overlay {
  position: fixed;
  inset: 0;
  z-index: 4000;
  pointer-events: none;
}
.ks-box {
  position: absolute;
  top: 12%;
  left: 50%;
  transform: translateX(-50%);
  width: 420px;
  max-height: 480px;
  display: flex;
  flex-direction: column;
  background: #141a23;
  border: 1px solid rgba(148, 163, 184, 0.25);
  border-radius: 10px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.55);
  overflow: hidden;
  pointer-events: auto;
}
.ks-query {
  padding: 10px 14px;
  font-size: 16px;
  color: #e2e8f0;
  border-bottom: 1px solid rgba(148, 163, 184, 0.12);
  font-family: 'JetBrains Mono', Consolas, monospace;
}
.ks-cursor {
  display: inline-block;
  width: 2px;
  height: 16px;
  margin-left: 2px;
  vertical-align: -2px;
  background: #3b82f6;
  animation: ks-blink 1s steps(1) infinite;
}
@keyframes ks-blink { 50% { opacity: 0; } }
.ks-list {
  flex: 1;
  overflow-y: auto;
  padding: 6px 0;
  max-height: 400px;
}
.ks-item {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 7px 14px;
  cursor: pointer;
  font-size: 13px;
}
.ks-item.active {
  background: rgba(59, 130, 246, 0.18);
}
.ks-code {
  color: #60a5fa;
  font-family: 'JetBrains Mono', Consolas, monospace;
  min-width: 96px;
}
.ks-name {
  color: #e2e8f0;
  flex: none;
}
.ks-py {
  color: #64748b;
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ks-empty {
  padding: 18px 14px;
  text-align: center;
  color: #64748b;
  font-size: 12px;
}
.ks-hint {
  padding: 6px 14px;
  border-top: 1px solid rgba(148, 163, 184, 0.12);
  color: #64748b;
  font-size: 11px;
}
</style>
