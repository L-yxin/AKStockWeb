<!-- src/components/QuantEditor.vue -->
<script lang="ts">
import * as monaco from 'monaco-editor'
import { getPyCodeCompletions, getPyCodeDoc } from '@/api'

// ============================================================
// 1. 模块级全局状态（提升到 setup 外部）
// 保证组件反复挂载/卸载时，Provider 只注册一次，不叠加
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

// 防重复注册的锁
let completionDispose: monaco.IDisposable | null = null
let hoverDispose: monaco.IDisposable | null = null

// 文档缓存
const docCache = new Map<string, Promise<string>>()

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
      nsLoadPromise = null // 失败允许下次重试
    }
  })()
  return nsLoadPromise
}

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

      const range: monaco.IRange = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: ctx.startColumn,
        endColumn: position.column,
      }

      const filtered = ctx.prefix
        ? items.filter((d) => d.label.startsWith(ctx.prefix))
        : items

      return { suggestions: filtered.map((d) => toSuggestion(d, range)) }
    },
  })
}

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
    } catch { /* ignore */ }
    return ''
  })()

  docCache.set(key, p)
  p.then((md) => {
    if (!md) docCache.delete(key)
  })
  return p
}

function registerHover(): void {
  if (hoverDispose) return
  hoverDispose = monaco.languages.registerHoverProvider('python', {
    provideHover(model, position) {
      const ctx = parseNsContext(model, position)
      if (!ctx) return null

      const line = model.getLineContent(position.lineNumber)
      const after = line.slice(position.column - 1)
      const tail = (after.match(/^[\w.]*/) ?? [''])[0]

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
</script>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'

// ============================================================
// 2. 组件级状态与实例
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

const editorContainer = ref<HTMLElement>()
let editor: monaco.editor.IStandaloneCodeEditor | null = null
let contentDispose: monaco.IDisposable | null = null
let isSettingValue = false // 防止 setValue 触发 emit 回环

onMounted(() => {
  if (!editorContainer.value) return

  // 注册（内部有全局锁，多次调用无副作用）
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
  // 注意：不要在这里 dispose completionDispose 和 hoverDispose。
  // 因为它们是全局单例，只应注册一次。
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