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
// 补全数据：ta / ind / klf 动态名单（启动时从后端拉取）
// ============================================================
interface CompletionDef {
  label: string
  kind: monaco.languages.CompletionItemKind
  detail?: string
  insertText?: string
  boost?: number
}

const K = monaco.languages.CompletionItemKind
const nsMap: Record<string, CompletionDef[]> = { ta: [], ind: [], klf: [] }

async function loadNsCompletions() {
  try {
    const j = await getPyCodeCompletions()
    if (j.code === 0 && j.data) {
      for (const ns of ['ta', 'ind', 'klf'] as const) {
        nsMap[ns] = (j.data[ns] || []).map((name: string) => ({
          label: name,
          kind: K.Function,
          detail: `${ns}.${name}`,
          boost: 60,
        }))
      }
    }
  } catch { /* ignore */ }
}

// ============================================================
// 补全 Provider
// ============================================================
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

function registerCompletion(): monaco.IDisposable {
  return monaco.languages.registerCompletionItemProvider('python', {
    triggerCharacters: ['.'],

    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position)
      const range: monaco.IRange = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      }

      const lineContent = model.getLineContent(position.lineNumber)
      const beforeCursor = lineContent.slice(0, position.column - 1)

      // ta. / ind. / klf. 前缀 → 对应命名空间函数名单
      const nsMatch = beforeCursor.match(/(ta|ind|klf)\.[A-Za-z_]*$/)
      if (!nsMatch) return { suggestions: [] }

      const items = nsMap[nsMatch[1]] || []
      return { suggestions: items.map((def) => toSuggestion(def, range)) }
    },
  })
}

// ============================================================
// Hover Provider（ta/ind/klf 函数签名 + docstring）
// ============================================================
const docCache: Record<string, string> = {}
async function fetchDoc(ns: string, name: string): Promise<string> {
  const key = `${ns}.${name}`
  if (docCache[key] !== undefined) return docCache[key]
  try {
    const j = await getPyCodeDoc(ns, name)
    if (j.code === 0 && j.data) {
      const { signature, doc } = j.data
      const sigLine = `\`${ns}.${name}${signature}\``
      let md = `### ${ns}.${name}\n\n${sigLine}`
      if (doc) md += `\n\n---\n\n${doc}`
      docCache[key] = md
      return md
    }
  } catch { /* ignore */ }
  docCache[key] = ''
  return ''
}

function registerHover(): monaco.IDisposable {
  return monaco.languages.registerHoverProvider('python', {
    provideHover(model, position) {
      const word = model.getWordUntilPosition(position)
      const lineContent = model.getLineContent(position.lineNumber)
      const before = lineContent.slice(0, word.startColumn - 1)
      const m = before.match(/(ta|ind|klf)\.([A-Za-z_.]*)$/)
      if (!m) return null
      const ns = m[1]
      let fnName = word.word
      if (ns === 'klf' && m[2].includes('.')) {
        fnName = `${m[2].split('.')[0]}.${word.word}`
      }
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      }
      return (async () => {
        const md = await fetchDoc(ns, fnName)
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
let completionDispose: monaco.IDisposable | null = null
let hoverDispose: monaco.IDisposable | null = null
let contentDispose: monaco.IDisposable | null = null

onMounted(() => {
  if (!editorContainer.value) return
  loadNsCompletions()

  editor = monaco.editor.create(editorContainer.value, {
    value: props.modelValue,
    language: props.language,
    theme: props.theme,
    automaticLayout: true,
    fontSize: 14,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    tabSize: 4,
    quickSuggestions: { other: true, comments: false, strings: false },
    suggestOnTriggerCharacters: true,
    tabCompletion: 'on',
    acceptSuggestionOnEnter: 'on',
    suggestSelection: 'first',
    wordBasedSuggestions: 'currentDocument',
    hover: { above: false, delay: 100 },
  })

  completionDispose = registerCompletion()
  hoverDispose = registerHover()

  contentDispose = editor.onDidChangeModelContent(() => {
    emit('update:modelValue', editor!.getValue())
  })
})

watch(
  () => props.modelValue,
  (val) => {
    if (editor && editor.getValue() !== val) {
      editor.setValue(val)
    }
  }
)

watch(
  () => props.theme,
  (val) => {
    monaco.editor.setTheme(val)
  }
)

onBeforeUnmount(() => {
  contentDispose?.dispose()
  completionDispose?.dispose()
  hoverDispose?.dispose()
  editor?.dispose()
  editor = null
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
