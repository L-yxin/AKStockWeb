<!-- src/components/QuantEditor.vue -->
<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import * as monaco from 'monaco-editor'
import { getPyCodeCompletions, getPyCodeDoc } from '@/api'

// ============================================================
// Props / Emits
// ============================================================
const props = withDefaults(
  defineProps<{
    modelValue: string
    language?: string
    theme?: string
    height?: string
  }>(),
  {
    language: 'python',
    theme: 'vs-dark',
    height: '100%',
  }
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

// ============================================================
// 命名空间补全数据（ta / ind / klf）
// ============================================================
type Ns = 'ta' | 'ind' | 'klf'
const NSS: readonly Ns[] = ['ta', 'ind', 'klf']

interface CompletionDef {
  label: string
  kind: monaco.languages.CompletionItemKind
  detail?: string
  insertText?: string
  boost?: number
}

const K = monaco.languages.CompletionItemKind
const nsMap: Record<Ns, CompletionDef[]> = { ta: [], ind: [], klf: [] }

let nsLoadPromise: Promise<void> | null = null
function ensureNsCompletions(): Promise<void> {
  if (nsLoadPromise) return nsLoadPromise
  nsLoadPromise = (async () => {
    try {
      const j = await getPyCodeCompletions()
      if (j.code !== 0 || !j.data) throw new Error('bad response')
      for (const ns of NSS) {
        nsMap[ns] = (j.data[ns] || []).map((name: string) => ({
          label: name,
          kind: K.Function,
          detail: `${ns}.${name}`,
          boost: 60,
        }))
      }
    } catch {
      nsLoadPromise = null // 允许下次重试
    }
  })()
  return nsLoadPromise
}

// ============================================================
// 工具：解析 `ta.` / `ind.` / `klf.` 上下文
//  - ns:          命名空间
//  - prefix:      `ns.` 之后、光标之前已输入的文本（可能含 `.`）
//  - startColumn: 补全/hover 的替换起点（1-based）
// ============================================================
interface NsContext {
  ns: Ns
  prefix: string
  startColumn: number
}

function parseNsContext(
  model: monaco.editor.ITextModel,
  position: monaco.Position
): NsContext | null {
  const line = model.getLineContent(position.lineNumber)
  const before = line.slice(0, position.column - 1)
  // 前面必须是行首或 非标识符/非点，避免误匹配 `foo.ta.x`
  const m = before.match(/(?:^|[^\w.])(ta|ind|klf)\.([\w.]*)$/)
  if (!m) return null
  const ns = m[1] as Ns
  const prefix = m[2] ?? ''
  const startColumn = before.length - prefix.length + 1
  return { ns, prefix, startColumn }
}

function toSuggestion(
  def: CompletionDef,
  range: monaco.IRange
): monaco.languages.CompletionItem {
  return {
    label: def.label,
    kind: def.kind,
    detail: def.detail,
    insertText: def.insertText ?? def.label,
    range,
    sortText: String(1000 - (def.boost ?? 0)).padStart(4, '0') + def.label,
  }
}

// ============================================================
// 补全 Provider（全局只注册一次）
// ============================================================
let completionDispose: monaco.IDisposable | null = null

function registerCompletion(): void {
  if (completionDispose) return
  completionDispose = monaco.languages.registerCompletionItemProvider('python', {
    triggerCharacters: ['.'],

    async provideCompletionItems(model, position) {
      const ctx = parseNsContext(model, position)
      if (!ctx) return { suggestions: [] }

      await ensureNsCompletions()
      const items = nsMap[ctx.ns]
      if (!items.length) return { suggestions: [] }

      // 替换范围：从 `ns.` 之后到光标
      const range: monaco.IRange = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: ctx.startColumn,
        endColumn: position.column,
      }

      // 前端先按前缀粗筛，减少返回量；Monaco 会再做二次模糊过滤
      const filtered = ctx.prefix
        ? items.filter((d) => d.label.startsWith(ctx.prefix))
        : items

      return { suggestions: filtered.map((d) => toSuggestion(d, range)) }
    },
  })
}

// ============================================================
// Hover Provider
// ============================================================
const docCache = new Map<string, Promise<string>>()

function fetchDoc(ns: string, name: string): Promise<string> {
  const key = `${ns}.${name}`
  const cached = docCache.get(key)
  if (cached) return cached

  const p = (async () => {
    try {
      const j = await getPyCodeDoc(ns, name)
      if (j.code === 0 && j.data) {
        const { signature, doc } = j.data
        const sigLine = `\`${ns}.${name}${signature}\``
        let md = `### ${ns}.${name}\n\n${sigLine}`
        if (doc) md += `\n\n---\n\n${doc}`
        return md
      }
    } catch {
      /* ignore */
    }
    return ''
  })()

  docCache.set(key, p)
  // 空结果不缓存，允许网络恢复后重试
  p.then((md) => {
    if (!md) docCache.delete(key)
  })
  return p
}

let hoverDispose: monaco.IDisposable | null = null

function registerHover(): void {
  if (hoverDispose) return
  hoverDispose = monaco.languages.registerHoverProvider('python', {
    provideHover(model, position) {
      const ctx = parseNsContext(model, position)
      if (!ctx) return null

      // 光标可能在符号中间：向后再读一段标识符
      const line = model.getLineContent(position.lineNumber)
      const after = line.slice(position.column - 1)
      const tail = (after.match(/^[\w.]*/) ?? [''])[0]

      // 完整符号名，去掉尾部多余的点
      const fullName = (ctx.prefix + tail).replace(/\.+$/, '')
      if (!fullName) return null

      const range: monaco.IRange = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: ctx.startColumn,
        endColumn: position.column + tail.length,
      }

      return (async () => {
        const md = await fetchDoc(ctx.ns, fullName)
        if (!md) return null
        return { range, contents: [{ value: md }] }
      })()
    },
  })
}

// ============================================================
// 编辑器实例
// ============================================================
const editorContainer = ref<HTMLElement>()
let editor: monaco.editor.IStandaloneCodeEditor | null = null
let contentDispose: monaco.IDisposable | null = null
let isSettingValue = false // 防止 setValue 触发 emit 回环

onMounted(() => {
  if (!editorContainer.value) return

  // Provider 是全局的，注册一次即可
  registerCompletion()
  registerHover()

  editor = monaco.editor.create(editorContainer.value, {
    value: props.modelValue,
    language: props.language,
    theme: props.theme,
    automaticLayout: true,
    fontSize: 14,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    tabSize: 4,
    padding: { top: 8, bottom: 8 },
    smoothScrolling: true,
    cursorBlinking: 'smooth',
    renderWhitespace: 'selection',
    quickSuggestions: { other: true, comments: false, strings: false },
    suggestOnTriggerCharacters: true,
    tabCompletion: 'on',
    acceptSuggestionOnEnter: 'on',
    suggestSelection: 'first',
    wordBasedSuggestions: 'currentDocument',
    hover: { above: false, delay: 100 },
    // 关键：让 hover / 补全浮层不被容器 overflow 裁剪
    fixedOverflowWidgets: true,
    scrollbar: {
      verticalScrollbarSize: 10,
      horizontalScrollbarSize: 10,
    },
  })

  contentDispose = editor.onDidChangeModelContent(() => {
    if (isSettingValue) return
    emit('update:modelValue', editor!.getValue())
  })

  // 预热补全名单
  ensureNsCompletions()
})

watch(
  () => props.modelValue,
  (val) => {
    if (!editor || editor.getValue() === val) return

    // 保存光标/选区，setValue 后恢复（否则光标会跳到末尾）
    const pos = editor.getPosition()
    const sel = editor.getSelection()

    isSettingValue = true
    editor.setValue(val)
    isSettingValue = false

    if (pos) editor.setPosition(pos)
    if (sel) editor.setSelection(sel)
  }
)

watch(
  () => props.theme,
  (val) => {
    monaco.editor.setTheme(val)
  }
)

watch(
  () => props.language,
  (lang) => {
    const model = editor?.getModel()
    if (model) monaco.editor.setModelLanguage(model, lang)
  }
)

onBeforeUnmount(() => {
  contentDispose?.dispose()
  contentDispose = null
  editor?.dispose()
  editor = null
  // Provider 是全局的，保留注册（避免多实例 / HMR 场景下反复叠加）
  // 若确定应用只在一处使用并要彻底释放，可在此：
  // completionDispose?.dispose(); completionDispose = null
  // hoverDispose?.dispose();     hoverDispose = null
})
</script>

<template>
  <div
    ref="editorContainer"
    class="quant-editor"
    :style="{ height }"
  />
</template>

<style scoped>
.quant-editor {
  width: 100%;
  min-height: 400px;
  border-radius: 4px;
  overflow: hidden;
}
</style>

<!-- 非 scoped：美化 monaco hover 浮层 -->
<style>
.monaco-editor-hover {
  background: #1e2636 !important;
  border: 1px solid #3b4a6b !important;
  border-radius: 6px !important;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5) !important;
}
.monaco-editor-hover .markdown-docs {
  color: #cdd6e4 !important;
  font-size: 13px !important;
  line-height: 1.6 !important;
}
.monaco-editor-hover .markdown-docs code {
  background: #0d1117 !important;
  color: #fbbf24 !important;
  padding: 2px 6px !important;
  border-radius: 3px !important;
  font-family: 'Consolas', monospace !important;
}
.monaco-editor-hover .markdown-docs h3 {
  color: #fff !important;
  margin: 0 0 8px 0 !important;
  font-size: 14px !important;
}
.monaco-editor-hover .markdown-docs hr {
  border-color: #2b3a55 !important;
  margin: 8px 0 !important;
}
</style>
