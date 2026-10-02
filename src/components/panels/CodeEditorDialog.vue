<template>
  <teleport to="body">
    <div v-if="visible" class="ce-mask" @click.self="close">
      <div class="ce-frame" :style="frameStyle">
        <div class="ce-title" @pointerdown="onTitleDown">
          <span class="ce-title-text">Python 信号编辑器</span>
          <el-select v-model="templateKey" size="small" style="width: 200px; margin-left: 12px"
                     @change="applyTemplate">
            <el-option v-for="t in TEMPLATES" :key="t.name" :label="t.name" :value="t.name" />
          </el-select>
          <span style="flex: 1"></span>
          <span class="ce-hint">ta / ind / klf 智能补全</span>
          <el-button size="small" text @click.stop="close">✕</el-button>
        </div>
        <div class="ce-body">
          <QuantEditor v-model="code" language="python" theme="vs-dark" height="100%" />
        </div>
        <div class="ce-resize" @pointerdown.stop="onResizeDown"></div>
      </div>
    </div>
  </teleport>
</template>

<script setup>
import { ref, reactive, watch } from 'vue'
import QuantEditor from '../QuantEditor.vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  modelValue: { type: String, default: '' },
})
const emit = defineEmits(['update:visible', 'update:modelValue'])

const code = ref(props.modelValue || '')

const TEMPLATES = [
  { name: '— 选择模板 —', code: '' },
  { name: 'RSI 超卖 (14,30)', code: 'return ta.RSI(c, 14) < 30' },
  { name: 'RSI 超卖 (9,20)', code: 'return ta.RSI(c, 9) < 20' },
  { name: 'MACD 金叉', code: 'macd, sig, hist = ta.MACD(c, 12, 26, 9)\nreturn hist > 0' },
  { name: '均线多头 (5>20)', code: 'return ta.MA(c, 5) > ta.MA(c, 20)' },
  { name: '布林下轨破', code: 'u, m, l = ta.BBANDS(c, 20, 2, 2)\nreturn c < l' },
  { name: '成交量放大', code: 'return v > ta.MA(v, 20) * 1.5' },
  { name: 'KLineForm 买入函数', code: 'return klf.buy.is_rsi_oversold(c, h, l, 6, 12, 24, 30)' },
]
const templateKey = ref('— 选择模板 —')

function applyTemplate(name) {
  const t = TEMPLATES.find(x => x.name === name)
  if (!t || !t.code) return
  code.value = t.code
}

// ---------- 弹窗尺寸 / 拖拽 ----------
const frame = reactive({ left: 100, top: 80, width: 820, height: 520 })
const MIN_W = 560, MIN_H = 360
const frameStyle = ref({})

function centerFrame() {
  const w = Math.min(880, window.innerWidth - 60)
  const h = Math.min(560, window.innerHeight - 80)
  frame.width = w; frame.height = h
  frame.left = Math.max(20, (window.innerWidth - w) / 2)
  frame.top = Math.max(20, (window.innerHeight - h) / 2)
  applyFrame()
}
function applyFrame() {
  frameStyle.value = {
    left: frame.left + 'px', top: frame.top + 'px',
    width: frame.width + 'px', height: frame.height + 'px',
  }
}

let drag = null
function onTitleDown(e) {
  if (e.target.closest('.el-select, .el-button')) return
  drag = { sx: e.clientX, sy: e.clientY, ol: frame.left, ot: frame.top }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  e.preventDefault()
}
let resize = null
function onResizeDown(e) {
  resize = { sx: e.clientX, sy: e.clientY, ow: frame.width, oh: frame.height }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  e.preventDefault()
}
function onMove(e) {
  if (drag) {
    frame.left = drag.ol + e.clientX - drag.sx
    frame.top = drag.ot + e.clientY - drag.sy
  } else if (resize) {
    frame.width = Math.max(MIN_W, resize.ow + e.clientX - resize.sx)
    frame.height = Math.max(MIN_H, resize.oh + e.clientY - resize.sy)
  }
  applyFrame()
}
function onUp() {
  drag = null; resize = null
  window.removeEventListener('pointermove', onMove)
  window.removeEventListener('pointerup', onUp)
}

function close() {
  emit('update:modelValue', code.value)
  emit('update:visible', false)
}

watch(() => props.visible, (v) => {
  if (v) {
    code.value = props.modelValue || ''
    centerFrame()
  }
})
</script>

<style>
.ce-mask {
  position: fixed; inset: 0; z-index: 1500;
  background: rgba(4, 8, 18, 0.45);
}
.ce-frame {
  position: fixed;
  left: 100px; top: 80px; width: 820px; height: 520px;
  background: #161b26;
  border: 1px solid #2b3a55;
  border-radius: 6px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
  display: flex; flex-direction: column;
  overflow: hidden;
}
.ce-title {
  display: flex; align-items: center;
  padding: 8px 12px;
  background: #1e2636;
  border-bottom: 1px solid #2b3a55;
  cursor: move;
  user-select: none;
}
.ce-title-text { color: #cdd6e4; font-size: 13px; font-weight: 600; }
.ce-hint { color: #6b7a90; font-size: 11px; margin-right: 8px; }
.ce-body { flex: 1; min-height: 0; background: #1e1e1e; }
.ce-resize {
  position: absolute; right: 0; bottom: 0;
  width: 26px; height: 26px;
  cursor: nwse-resize;
}
.ce-resize::after {
  content: '';
  position: absolute; right: 4px; bottom: 4px;
  width: 12px; height: 12px;
  background: linear-gradient(135deg, transparent 50%, #4a5b7a 50%, #4a5b7a 60%, transparent 60%);
}
</style>
